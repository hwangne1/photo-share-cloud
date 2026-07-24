import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import boto3
from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError
from botocore.signers import CloudFrontSigner
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from dotenv import load_dotenv


# =================================================================
# ZONE 1: CẤU HÌNH HẠ TẦNG AWS S3 & CLOUDFRONT
# =================================================================

load_dotenv()

AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.getenv("AWS_REGION", "ap-southeast-1")
AWS_STORAGE_BUCKET_NAME = os.getenv("AWS_STORAGE_BUCKET_NAME")

CLOUDFRONT_DOMAIN = os.getenv(
    "CLOUDFRONT_DOMAIN",
    "d3cbunnfnushg2.cloudfront.net",
).rstrip("/")

# Cho phép .env chứa domain có hoặc không có https://.
if not CLOUDFRONT_DOMAIN.startswith(("http://", "https://")):
    CLOUDFRONT_DOMAIN = f"https://{CLOUDFRONT_DOMAIN}"

CLOUDFRONT_KEY_PAIR_ID = os.getenv(
    "CLOUDFRONT_KEY_PAIR_ID",
    "K3S3N7M1U807C5",
)

# Mặc định private_key.pem nằm ở thư mục gốc của project.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
PRIVATE_KEY_PATH = Path(
    os.getenv(
        "CLOUDFRONT_PRIVATE_KEY_PATH",
        str(PROJECT_ROOT / "private_key.pem"),
    )
)

SIGNED_URL_TTL_SECONDS = int(
    os.getenv("SIGNED_URL_TTL_SECONDS", "60")
)


# =================================================================
# ZONE 2: HÀM HỖ TRỢ
# =================================================================

def validate_s3_config() -> None:
    """Kiểm tra cấu hình AWS cần thiết trước khi kết nối S3."""
    missing = []

    if not AWS_ACCESS_KEY_ID:
        missing.append("AWS_ACCESS_KEY_ID")

    if not AWS_SECRET_ACCESS_KEY:
        missing.append("AWS_SECRET_ACCESS_KEY")

    if not AWS_STORAGE_BUCKET_NAME:
        missing.append("AWS_STORAGE_BUCKET_NAME")

    if missing:
        raise RuntimeError(
            "Thiếu biến môi trường AWS: "
            + ", ".join(missing)
        )


def get_s3_client():
    """Khởi tạo S3 Client từ biến môi trường."""
    validate_s3_config()

    return boto3.client(
        "s3",
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        region_name=AWS_REGION,
    )


# =================================================================
# ZONE 3: KÝ SỐ RSA CHO CLOUDFRONT SIGNED URL
# =================================================================

def rsa_signer(message: bytes) -> bytes:
    """
    Đọc RSA Private Key và ký policy của CloudFront bằng
    PKCS#1 v1.5 + SHA-1 theo cơ chế CloudFront Signed URL.
    """
    if not PRIVATE_KEY_PATH.is_file():
        raise FileNotFoundError(
            f"Không tìm thấy CloudFront Private Key tại: "
            f"{PRIVATE_KEY_PATH}"
        )

    with PRIVATE_KEY_PATH.open("rb") as key_file:
        private_key = serialization.load_pem_private_key(
            key_file.read(),
            password=None,
        )

    return private_key.sign(
        message,
        padding.PKCS1v15(),
        hashes.SHA1(),
    )


def generate_cloudfront_signed_url(
    object_name: str,
) -> str:
    """
    Sinh CloudFront Signed URL có thời hạn mặc định 60 giây.
    """
    if not CLOUDFRONT_KEY_PAIR_ID:
        raise RuntimeError(
            "Thiếu biến môi trường CLOUDFRONT_KEY_PAIR_ID."
        )

    object_name = object_name.lstrip("/")
    url = f"{CLOUDFRONT_DOMAIN}/{object_name}"

    expire_time = (
        datetime.now(timezone.utc)
        + timedelta(seconds=SIGNED_URL_TTL_SECONDS)
    )

    cloudfront_signer = CloudFrontSigner(
        CLOUDFRONT_KEY_PAIR_ID,
        rsa_signer,
    )

    return cloudfront_signer.generate_presigned_url(
        url,
        date_less_than=expire_time,
    )


# =================================================================
# ZONE 4: DỊCH VỤ UPLOAD FILE LÊN S3
# =================================================================

def upload_file_to_s3(
    file_obj,
    object_name: str,
    content_type: str,
):
    """
    Upload file lên private S3 Bucket và trả về CloudFront Signed URL.
    AWS credentials được đọc từ biến môi trường, không hard-code trong code.
    """
    try:
        s3_client = get_s3_client()

        s3_client.upload_fileobj(
            file_obj,
            AWS_STORAGE_BUCKET_NAME,
            object_name,
            ExtraArgs={
                "ContentType": content_type,
            },
        )

        print(
            f"[AWS S3] Upload thành công file "
            f"[{object_name}] lên S3."
        )

        signed_cloudfront_url = (
            generate_cloudfront_signed_url(object_name)
        )

        return signed_cloudfront_url

    except NoCredentialsError:
        print(
            "[ERROR] S3 SERVICE FAILED: "
            "Không tìm thấy AWS Credentials hợp lệ.",
            file=sys.stderr,
        )

    except (ClientError, BotoCoreError) as error:
        print(
            f"[ERROR] AWS SERVICE FAILED: {error}",
            file=sys.stderr,
        )

    except (
        FileNotFoundError,
        ValueError,
        RuntimeError,
    ) as error:
        print(
            f"[ERROR] CONFIGURATION FAILED: {error}",
            file=sys.stderr,
        )

    except Exception as error:
        print(
            f"[ERROR] S3 SERVICE FAILED: {error}",
            file=sys.stderr,
        )

    return None