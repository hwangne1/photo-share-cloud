from pathlib import Path
import json
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

import jwt
import bcrypt
import boto3
import puremagic
from botocore.exceptions import ClientError
from dotenv import load_dotenv
from fastapi import FastAPI, File, Header, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.s3_services import (
    upload_file_to_s3,
    generate_cloudfront_signed_url,
)


# =================================================================
# ZONE 1: KHỞI TẠO HỆ THỐNG & BIẾN MÔI TRƯỜNG
# =================================================================

# Đọc biến môi trường từ file .env khi chạy local.
# Khi chạy Docker/EC2, các biến này có thể được truyền từ env_file hoặc hệ thống.
load_dotenv()

AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.getenv("AWS_REGION", "ap-southeast-1")
AWS_STORAGE_BUCKET_NAME = os.getenv("AWS_STORAGE_BUCKET_NAME")
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 60

app = FastAPI(
    title="Photo Share Cloud API Pro",
    version="1.0.0",
)

# Thiết lập file database JSON cục bộ.
APP_ROOT = Path(__file__).resolve().parent.parent
DB_FILE = APP_ROOT / "users_db.json"

if not DB_FILE.exists():
    with DB_FILE.open("w", encoding="utf-8") as file:
        json.dump({}, file, ensure_ascii=False, indent=4)


# =================================================================
# ZONE 2: CHỐT CHẶN BẢO MẬT MẠNG (CORS CONFIGURATION)
# =================================================================

# Local origins dùng cho quá trình phát triển.
# Khi tạo EC2, bổ sung địa chỉ Frontend thật vào biến CORS_ORIGINS trong .env,
# ví dụ:
# CORS_ORIGINS=http://54.xxx.xxx.xxx,http://localhost:5173
default_origins = [
    "http://localhost",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5500",
]

cors_origins_env = os.getenv("CORS_ORIGINS", "")
extra_origins = [
    origin.strip()
    for origin in cors_origins_env.split(",")
    if origin.strip()
]

origins = list(dict.fromkeys(default_origins + extra_origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/png",
}

MAX_FILE_SIZE = 5 * 1024 * 1024


# =================================================================
# ZONE 3: CẤU TRÚC DỮ LIỆU ĐẦU VÀO (PYDANTIC MODELS)
# =================================================================

class UserAuth(BaseModel):
    username: str
    password: str


class DeleteFileRequest(BaseModel):
    storage_path: str
class FavoriteFileRequest(BaseModel):
    storage_path: str
# =================================================================
# MODEL: THAO TÁC VỚI THÙNG RÁC
# -----------------------------------------------------------------
# Frontend chỉ gửi đường dẫn file trên S3.
# Danh tính người dùng vẫn được xác định bằng JWT.
# =================================================================

class TrashFileRequest(BaseModel):
    storage_path: str
# =================================================================
# ZONE 4: CÁC HÀM BỔ TRỢ HỆ THỐNG (HELPER FUNCTIONS)
# =================================================================
def create_access_token(username: str) -> str:
    """Tạo JWT Access Token cho người dùng đã đăng nhập."""
    if not JWT_SECRET_KEY:
        raise HTTPException(
            status_code=500,
            detail="Thiếu cấu hình JWT_SECRET_KEY.",
        )

    expire = datetime.now(timezone.utc) + timedelta(
        minutes=JWT_EXPIRE_MINUTES
    )

    payload = {
        "sub": username,
        "exp": expire,
    }

    return jwt.encode(
        payload,
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )


def verify_access_token(authorization: str = Header(...)) -> str:
    """Xác minh JWT và trả về username từ token."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Token không hợp lệ.",
        )

    token = authorization.removeprefix("Bearer ").strip()

    try:
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
        )

        username = payload.get("sub")

        if not username:
            raise HTTPException(
                status_code=401,
                detail="Token không hợp lệ.",
            )

        return username

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail="Phiên đăng nhập đã hết hạn.",
        )

    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail="Token không hợp lệ.",
        )

def validate_aws_config() -> None:
    """Kiểm tra các biến môi trường AWS bắt buộc."""
    missing = []

    if not AWS_ACCESS_KEY_ID:
        missing.append("AWS_ACCESS_KEY_ID")

    if not AWS_SECRET_ACCESS_KEY:
        missing.append("AWS_SECRET_ACCESS_KEY")

    if not AWS_STORAGE_BUCKET_NAME:
        missing.append("AWS_STORAGE_BUCKET_NAME")

    if missing:
        print(
            f"[ERROR] Thiếu biến môi trường AWS: {', '.join(missing)}",
            file=sys.stderr,
        )
        raise HTTPException(
            status_code=500,
            detail="Lỗi cấu hình hạ tầng Cloud. Vui lòng kiểm tra biến môi trường AWS.",
        )


def get_s3_client():
    """Khởi tạo AWS S3 Client dùng chung."""
    validate_aws_config()

    return boto3.client(
        "s3",
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        region_name=AWS_REGION,
    )


def read_db():
    """Đọc dữ liệu tài khoản từ file JSON."""
    try:
        with DB_FILE.open("r", encoding="utf-8") as file:
            return json.load(file)
    except (json.JSONDecodeError, OSError):
        print("[ERROR] Không thể đọc users_db.json.", file=sys.stderr)
        raise HTTPException(
            status_code=500,
            detail="Không thể đọc dữ liệu tài khoản.",
        )


def write_db(data):
    """Ghi dữ liệu tài khoản vào file JSON."""
    try:
        with DB_FILE.open("w", encoding="utf-8") as file:
            json.dump(
                data,
                file,
                ensure_ascii=False,
                indent=4,
            )
    except OSError:
        print("[ERROR] Không thể ghi users_db.json.", file=sys.stderr)
        raise HTTPException(
            status_code=500,
            detail="Không thể lưu dữ liệu tài khoản.",
        )


# =================================================================
# ZONE 5: HỆ THỐNG API ENDPOINTS
# =================================================================

# -----------------------------------------------------------------
# 5.1. API KIỂM TRA TRẠNG THÁI SERVER
# -----------------------------------------------------------------

@app.get("/")
def home():
    return {
        "status": "success",
        "message": "Photo Share Cloud Backend đang hoạt động.",
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "photo-share-cloud-backend",
    }


# -----------------------------------------------------------------
# 5.2. API ĐĂNG KÝ TÀI KHOẢN
# -----------------------------------------------------------------

@app.post("/register", status_code=status.HTTP_201_CREATED)
def register(user: UserAuth):
    db = read_db()

    if user.username in db:
        print(
            f"[SECURITY ALERT] REGISTER FAILED: "
            f"Username [{user.username}] đã tồn tại."
        )
        raise HTTPException(
            status_code=400,
            detail="Tên đăng nhập đã được sử dụng!",
        )

    password_bytes = user.password.encode("utf-8")
    salt = bcrypt.gensalt()
    hashed_password = bcrypt.hashpw(
        password_bytes,
        salt,
    ).decode("utf-8")

      # Lưu tài khoản mới vào database JSON.
    # favorites là danh sách đường dẫn S3 của các ảnh được yêu thích.
    db[user.username] = {
        "password": hashed_password,
        "favorites": [],
# Lưu các storage_path đã được chuyển vào thùng rác.
    # File vẫn còn trên S3 cho đến khi người dùng xóa vĩnh viễn.
        "trash": [],
    }

    write_db(db)

    print(
        f"[SECURITY INFO] USER REGISTERED: "
        f"Tài khoản [{user.username}] đã được tạo thành công."
    )

    return {
        "status": "success",
        "message": "Đăng ký tài khoản thành công!",
    }


# -----------------------------------------------------------------
# 5.3. API ĐĂNG NHẬP HỆ THỐNG
# -----------------------------------------------------------------

@app.post("/login")
def login(user: UserAuth):
    db = read_db()

    if user.username not in db:
        print(
            f"[SECURITY ALERT] LOGIN FAILED: "
            f"Không tìm thấy username [{user.username}].",
            file=sys.stderr,
        )
        raise HTTPException(
            status_code=401,
            detail="Sai tài khoản hoặc mật khẩu",
        )

    hashed_password_in_db = db[user.username]["password"].encode("utf-8")
    password_bytes = user.password.encode("utf-8")

    if not bcrypt.checkpw(
        password_bytes,
        hashed_password_in_db,
    ):
        print(
            f"[SECURITY ALERT] LOGIN FAILED: "
            f"User [{user.username}] nhập sai mật khẩu.",
            file=sys.stderr,
        )
        raise HTTPException(
            status_code=401,
            detail="Sai tài khoản hoặc mật khẩu",
        )

    print(
        f"[SECURITY INFO] USER LOGIN SUCCESS: "
        f"User [{user.username}] đăng nhập thành công."
    )

    access_token = create_access_token(user.username)

    return {
    "status": "success",
    "message": "Đăng nhập thành công!",
    "username": user.username,
    "access_token": access_token,
    "token_type": "bearer",
}


# -----------------------------------------------------------------
# 5.4. API LẤY DANH SÁCH FILE TỪ S3
# -----------------------------------------------------------------
@app.get("/list-files")
def list_user_files(
    authorization: str = Header(...),
):
    # Xác minh JWT và lấy username trực tiếp từ token.
    username = verify_access_token(authorization)

    # Đọc database của user.
    db = read_db()

    # Danh sách yêu thích.
    favorites = db.get(username, {}).get("favorites", [])

    # Danh sách file trong thùng rác.
    trash = db.get(username, {}).get("trash", [])

    s3_client = get_s3_client()
    prefix = f"{username}/"
    file_list = []

    try:
        paginator = s3_client.get_paginator("list_objects_v2")

        for page in paginator.paginate(
            Bucket=AWS_STORAGE_BUCKET_NAME,
            Prefix=prefix,
        ):
            for obj in page.get("Contents", []):
                storage_path = obj["Key"]

                if storage_path == prefix:
                    continue

                signed_url = generate_cloudfront_signed_url(
                    storage_path
                )

                file_list.append(
                    {
                        "storage_path": storage_path,
                        "signed_url": signed_url,
                        "is_favorite": storage_path in favorites,
                        "is_trashed": storage_path in trash,
                    }
                )

        return {
            "status": "success",
            "files": file_list,
        }

    except ClientError as error:
        print(
            f"[ERROR] LIST FILES FAILED: {error}",
            file=sys.stderr,
        )
        raise HTTPException(
            status_code=500,
            detail="Không thể tải danh sách tệp từ AWS S3.",
        )

    except (
        FileNotFoundError,
        ValueError,
        RuntimeError,
    ) as error:
        print(
            f"[ERROR] CLOUDFRONT SIGNED URL FAILED: {error}",
            file=sys.stderr,
        )
        raise HTTPException(
            status_code=500,
            detail="Không thể tạo đường dẫn CloudFront bảo mật.",
        )
# -----------------------------------------------------------------
# 5.5. API TẢI FILE ẢNH LÊN S3
# -----------------------------------------------------------------

@app.post("/upload")
async def upload_image(
    file: UploadFile = File(...),
    authorization: str = Header(...),
):
    # Xác minh JWT và lấy username thật từ token.
    username = verify_access_token(authorization)

    file_content = await file.read()

    # Giới hạn dung lượng để giảm nguy cơ upload file quá lớn.
    if len(file_content) > MAX_FILE_SIZE:
        print(
            f"[SECURITY ALERT] OVERSIZED UPLOAD: "
            f"User [{username}] gửi file quá giới hạn.",
            file=sys.stderr,
        )
        raise HTTPException(
            status_code=400,
            detail="Ảnh quá nặng! Vui lòng chọn ảnh dưới 5MB.",
        )

    if not file_content:
        raise HTTPException(
            status_code=400,
            detail="File tải lên đang rỗng.",
        )

    # Kiểm tra Magic Bytes.
    try:
        detected = puremagic.from_string(file_content)
        detected_text = str(detected).lower()

        valid_signatures = (
            "image/jpeg",
            "image/png",
            "jpeg",
            "png",
        )

        if not any(
            signature in detected_text
            for signature in valid_signatures
        ):
            print(
                f"[SECURITY ALERT] MALICIOUS FILE UPLOAD: "
                f"User [{username}] tải file sai Magic Bytes "
                f"({detected_text})",
                file=sys.stderr,
            )
            raise HTTPException(
                status_code=400,
                detail="Định dạng nội dung nhị phân bị giả mạo!",
            )

    except puremagic.PureError:
        raise HTTPException(
            status_code=400,
            detail="Không thể xác định cấu trúc nhị phân của file.",
        )

    # Kiểm tra Content-Type do trình duyệt gửi.
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Chỉ nhận ảnh JPG, JPEG hoặc PNG.",
        )

    # Xác định phần mở rộng dựa trên MIME.
    extension_by_mime = {
        "image/jpeg": "jpg",
        "image/png": "png",
    }

    file_extension = extension_by_mime[file.content_type]

    # Đưa con trỏ file về đầu trước khi upload.
    await file.seek(0)

    # Username lấy từ JWT, không còn tin vào x-user-id từ client.
    unique_filename = (
        f"{username}/"
        f"{uuid.uuid4()}.{file_extension}"
    )

    s3_url = upload_file_to_s3(
        file.file,
        unique_filename,
        file.content_type,
    )

    if not s3_url:
        raise HTTPException(
            status_code=500,
            detail="Lỗi khi đẩy file lên S3.",
        )

    return {
        "status": "success",
        "storage_path": unique_filename,
        "signed_url": s3_url,
    }


# -----------------------------------------------------------------
# 5.6. API XÓA FILE VĨNH VIỄN KHỎI S3
# -----------------------------------------------------------------

@app.delete("/delete")
def delete_file(
    req: DeleteFileRequest,
    authorization: str = Header(...),
):
    # Xác minh JWT và lấy username thật từ token.
    username = verify_access_token(authorization)

    # Chỉ cho phép user xóa file thuộc chính tài khoản của mình.
    expected_prefix = f"{username}/"

    if not req.storage_path.startswith(expected_prefix):
        print(
            f"[SECURITY ALERT] UNAUTHORIZED DELETE ATTEMPT: "
            f"User [{username}] cố xóa file "
            f"[{req.storage_path}] không thuộc sở hữu.",
            file=sys.stderr,
        )

        raise HTTPException(
            status_code=403,
            detail="Bạn không có quyền xóa tệp tin này!",
        )

    s3_client = get_s3_client()

    try:
        # =========================================================
        # BƯỚC 1: XÓA FILE THẬT KHỎI AWS S3
        # =========================================================
        s3_client.delete_object(
            Bucket=AWS_STORAGE_BUCKET_NAME,
            Key=req.storage_path,
        )

        # =========================================================
        # BƯỚC 2: DỌN METADATA CỦA FILE ĐÃ BỊ XÓA
        # =========================================================
        db = read_db()

        if username in db:
            # Xóa khỏi danh sách Thùng rác.
            trash = db[username].get("trash", [])

            if req.storage_path in trash:
                trash.remove(req.storage_path)

            db[username]["trash"] = trash

            # Xóa khỏi danh sách Yêu thích.
            favorites = db[username].get("favorites", [])

            if req.storage_path in favorites:
                favorites.remove(req.storage_path)

            db[username]["favorites"] = favorites

            # Lưu database sau khi dọn metadata.
            write_db(db)

        print(
            f"[SECURITY INFO] FILE DELETED: "
            f"User [{username}] đã xóa vĩnh viễn file "
            f"[{req.storage_path}] khỏi S3."
        )

        return {
            "status": "success",
            "message": "Đã xóa vĩnh viễn tệp tin khỏi hệ thống S3!",
        }

    except ClientError as error:
        print(
            f"[ERROR] DELETE FAILED: {error}",
            file=sys.stderr,
        )

        raise HTTPException(
            status_code=500,
            detail="Lỗi hệ thống khi yêu cầu xóa tệp trên S3.",
        )
# =============================================================
# DỌN METADATA SAU KHI XÓA VĨNH VIỄN
# =============================================================

    try:
        # Xóa file thật khỏi AWS S3.
        s3_client.delete_object(
            Bucket=AWS_STORAGE_BUCKET_NAME,
            Key=req.storage_path,
        )

        # =========================================================
        # DỌN METADATA SAU KHI XÓA VĨNH VIỄN
        # =========================================================
        db = read_db()

        if username in db:
            # Xóa khỏi danh sách Thùng rác.
            trash = db[username].get("trash", [])

            if req.storage_path in trash:
                trash.remove(req.storage_path)

            db[username]["trash"] = trash

            # Xóa khỏi danh sách Yêu thích.
            favorites = db[username].get("favorites", [])

            if req.storage_path in favorites:
                favorites.remove(req.storage_path)

            db[username]["favorites"] = favorites

            # Lưu lại database sau khi dọn metadata.
            write_db(db)

        print(
            f"[SECURITY INFO] FILE DELETED: "
            f"User [{username}] đã xóa file "
            f"[{req.storage_path}] khỏi S3."
        )

        return {
            "status": "success",
            "message": "Đã xóa vĩnh viễn tệp tin khỏi hệ thống S3!",
        }

    except ClientError as error:
        print(
            f"[ERROR] DELETE FAILED: {error}",
            file=sys.stderr,
        )

        raise HTTPException(
            status_code=500,
            detail="Lỗi hệ thống khi yêu cầu xóa tệp trên S3.",
        )
# -----------------------------------------------------------------
# 5.7. API BẬT / TẮT TRẠNG THÁI YÊU THÍCH
# -----------------------------------------------------------------

@app.post("/favorites/toggle")
def toggle_favorite(
    req: FavoriteFileRequest,
    authorization: str = Header(...),
):
    # Xác minh JWT và lấy username thật từ token.
    username = verify_access_token(authorization)

    # Kiểm tra file có thực sự thuộc về user đang đăng nhập hay không.
    expected_prefix = f"{username}/"

    if not req.storage_path.startswith(expected_prefix):
        print(
            f"[SECURITY ALERT] UNAUTHORIZED FAVORITE ATTEMPT: "
            f"User [{username}] cố thao tác với file "
            f"[{req.storage_path}] không thuộc sở hữu.",
            file=sys.stderr,
        )

        raise HTTPException(
            status_code=403,
            detail="Bạn không có quyền thao tác với tệp này!",
        )

    # Đọc database tài khoản.
    db = read_db()

    if username not in db:
        raise HTTPException(
            status_code=404,
            detail="Không tìm thấy tài khoản.",
        )

    # Tương thích với tài khoản cũ chưa có trường favorites.
    favorites = db[username].get("favorites", [])

    # Nếu file đã yêu thích -> bỏ yêu thích.
    if req.storage_path in favorites:
        favorites.remove(req.storage_path)
        is_favorite = False

    # Nếu chưa yêu thích -> thêm vào danh sách.
    else:
        favorites.append(req.storage_path)
        is_favorite = True

    # Lưu lại danh sách yêu thích của user.
    db[username]["favorites"] = favorites

    write_db(db)

    print(
        f"[SECURITY INFO] FAVORITE UPDATED: "
        f"User [{username}] - File [{req.storage_path}] "
        f"- Favorite [{is_favorite}]"
    )

    return {
        "status": "success",
        "storage_path": req.storage_path,
        "is_favorite": is_favorite,
    }
 # -----------------------------------------------------------------
# 5.8. API LẤY DANH SÁCH ẢNH YÊU THÍCH
# -----------------------------------------------------------------

@app.get("/favorites")
def get_favorites(
    authorization: str = Header(...),
):
    # Xác minh JWT và lấy username từ token.
    username = verify_access_token(authorization)

    # Đọc dữ liệu tài khoản.
    db = read_db()

    if username not in db:
        raise HTTPException(
            status_code=404,
            detail="Không tìm thấy tài khoản.",
        )

    # Tương thích với các tài khoản cũ chưa có trường favorites.
    favorites = db[username].get("favorites", [])

    return {
        "status": "success",
        "favorites": favorites,
    }
# -----------------------------------------------------------------
# 5.9. API CHUYỂN FILE VÀO THÙNG RÁC / KHÔI PHỤC
# -----------------------------------------------------------------

@app.post("/trash/toggle")
def toggle_trash(
    req: TrashFileRequest,
    authorization: str = Header(...),
):
    # Xác minh JWT và lấy username thật từ token.
    username = verify_access_token(authorization)

    # Chỉ cho phép thao tác với file thuộc chính user.
    expected_prefix = f"{username}/"

    if not req.storage_path.startswith(expected_prefix):
        print(
            f"[SECURITY ALERT] UNAUTHORIZED TRASH ATTEMPT: "
            f"User [{username}] cố thao tác với file "
            f"[{req.storage_path}] không thuộc sở hữu.",
            file=sys.stderr,
        )

        raise HTTPException(
            status_code=403,
            detail="Bạn không có quyền thao tác với tệp này!",
        )

    # Đọc dữ liệu người dùng.
    db = read_db()

    if username not in db:
        raise HTTPException(
            status_code=404,
            detail="Không tìm thấy tài khoản.",
        )

    # Tương thích với tài khoản cũ chưa có trường trash.
    trash = db[username].get("trash", [])

    # Nếu file đang ở trong thùng rác -> khôi phục.
    if req.storage_path in trash:
        trash.remove(req.storage_path)
        is_trashed = False

    # Nếu file chưa ở trong thùng rác -> chuyển vào thùng rác.
    else:
        trash.append(req.storage_path)
        is_trashed = True

    # Lưu lại trạng thái thùng rác.
    db[username]["trash"] = trash

    write_db(db)

    print(
        f"[SECURITY INFO] TRASH UPDATED: "
        f"User [{username}] - File [{req.storage_path}] "
        f"- Trashed [{is_trashed}]"
    )

    return {
        "status": "success",
        "storage_path": req.storage_path,
        "is_trashed": is_trashed,
    }