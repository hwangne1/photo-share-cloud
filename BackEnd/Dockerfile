# ================================================================
# DOCKERFILE BACKEND - FASTAPI
# ================================================================

# Bước 1: Sử dụng Python 3.11 bản slim để giảm kích thước image
FROM python:3.11-slim

# Bước 2: Thiết lập thư mục làm việc bên trong container
WORKDIR /app

# Bước 3: Copy file requirements trước để tận dụng Docker cache
COPY requirements.txt .

# Bước 4: Cập nhật pip và cài các thư viện Python cần thiết
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Bước 5: Copy toàn bộ mã nguồn Backend vào container
COPY . .

# Bước 6: Khai báo cổng mà FastAPI/Uvicorn sử dụng
EXPOSE 8000

# Bước 7: Khởi chạy FastAPI bằng Uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]