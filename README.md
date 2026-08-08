# 📸 Photo Share Cloud

Một ứng dụng chia sẻ ảnh được xây dựng bằng **FastAPI**, **ReactJS**, **Docker** và **AWS Cloud**.

Hệ thống cho phép người dùng đăng ký tài khoản, đăng nhập, tải ảnh lên Amazon S3, quản lý album, chia sẻ ảnh và xem ảnh thông qua CloudFront Signed URL.

---

# 🚀 Công nghệ sử dụng

## Backend
- FastAPI
- Python
- JWT Authentication
- Bcrypt Password Hashing
- Boto3 (AWS SDK)

## Frontend
- ReactJS
- Vite
- Axios

## Cloud
- Amazon EC2
- Amazon S3
- Amazon CloudFront
- Origin Access Control (OAC)

## Deployment
- Docker
- Docker Compose
- Nginx

---

# 📁 Cấu trúc dự án

```
photo-share-cloud
│
├── BackEnd/
│   ├── app/
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── .env
│   └── users_db.json
│
├── FrontEnd/
│   ├── src/
│   ├── package.json
│   ├── Dockerfile
│   └── .env
│
├── docker-compose.yml
└── .gitignore
```

---

# ⚙️ Yêu cầu

Trước khi chạy dự án cần cài đặt:

- Docker Desktop (Windows)
- Docker Engine + Docker Compose (Linux)
- Git

Kiểm tra:

```bash
docker --version
docker compose version
```

---

# 📥 Clone Project

```bash
git clone https://github.com/<your-username>/photo-share-cloud.git

cd photo-share-cloud
```

---

# 🔧 Cấu hình Backend

Di chuyển vào thư mục

```bash
cd BackEnd
```

Tạo file

```
.env
```

Ví dụ:

```env
SECRET_KEY=your_secret_key

AWS_ACCESS_KEY_ID=xxxxxxxxxxxxxxxx

AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxx

AWS_REGION=ap-southeast-1

BUCKET_NAME=your_bucket

CLOUDFRONT_DOMAIN=xxxxxxxx.cloudfront.net
```

---

## users_db.json

Tạo file

```
users_db.json
```

với nội dung

```json
{}
```

---

# 🎨 Cấu hình Frontend

Trong thư mục

```
FrontEnd
```

Tạo file

```
.env
```

Ví dụ

```env
VITE_API_BASE_URL=http://<EC2-IP>:8000
```

Nếu chạy local

```env
VITE_API_BASE_URL=http://localhost:8000
```

---

# 🐳 Chạy bằng Docker Compose

Tại thư mục gốc

```bash
docker compose up --build
```

Hoặc

```bash
docker compose up -d --build
```

---

# 🌐 Truy cập

Frontend

```
http://localhost
```

Backend API

```
http://localhost:8000
```

Swagger

```
http://localhost:8000/docs
```

---

# 👤 Tài khoản

Đăng ký tài khoản mới trực tiếp trên giao diện.

Hoặc sử dụng tài khoản đã có trong `users_db.json`.

---

# ✨ Chức năng

- Đăng ký
- Đăng nhập
- Upload ảnh
- Xem ảnh
- Preview
- Drag & Drop Upload
- Album
- Chia sẻ ảnh
- Yêu thích
- Thùng rác
- Khôi phục
- Xóa vĩnh viễn
- Tìm kiếm
- Recent Upload

---

# 🔒 Tính năng bảo mật

- JWT Authentication
- Password Hashing (bcrypt)
- Magic Bytes Validation
- MIME Type Validation
- Amazon S3 Block Public Access
- CloudFront Signed URL
- Origin Access Control (OAC)

---

# ☁️ Kiến trúc hệ thống

```
Browser
      │
      ▼
 ReactJS
      │
      ▼
 FastAPI
      │
      ▼
 Amazon S3
      ▲
      │
 CloudFront
```

---

# 📷 Luồng Upload

```
User

↓

React

↓

FastAPI

↓

JWT Validation

↓

Magic Bytes Validation

↓

Upload lên Amazon S3

↓

Upload thành công
```

---

# 📷 Luồng xem ảnh

```
User

↓

Frontend

↓

Backend

↓

Tạo CloudFront Signed URL

↓

CloudFront

↓

Amazon S3

↓

Hiển thị ảnh
```

---

# 🛑 Dừng hệ thống

```bash
docker compose down
```

---

# 🔄 Build lại

```bash
docker compose up --build
```

---

# 👨‍💻 Tác giả

Hoang Pham

Đồ án môn **Điện toán đám mây**

Trường Đại học :HUFLIT

