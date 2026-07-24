# ================================================================
# GIAI ĐOẠN 1: BUILD FRONTEND REACT/VITE
# ================================================================

# Sử dụng Node.js 20 bản Alpine để có image nhẹ
FROM node:20-alpine AS build

# Thiết lập thư mục làm việc bên trong container
WORKDIR /app

# Copy trước các file quản lý thư viện để tận dụng Docker Layer Cache
COPY package*.json ./

# Cài đặt chính xác các dependency theo package-lock.json
RUN npm install

# Copy toàn bộ mã nguồn Frontend vào container
COPY . .

# Nhận địa chỉ Backend API từ Docker Compose trong quá trình build
ARG VITE_API_BASE_URL

# Đưa giá trị build argument thành biến môi trường cho Vite
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# Build ứng dụng React/Vite thành các file tĩnh production trong thư mục dist
RUN npm run build


# ================================================================
# GIAI ĐOẠN 2: TRIỂN KHAI FRONTEND BẰNG NGINX
# ================================================================

# Sử dụng Nginx Alpine để phục vụ các file web tĩnh
FROM nginx:alpine

# Copy kết quả build từ giai đoạn Node.js sang thư mục mặc định của Nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Nạp cấu hình Reverse Proxy tùy chỉnh
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Khai báo cổng HTTP mà Frontend sử dụng
EXPOSE 80

# Khởi chạy Nginx ở foreground để container luôn hoạt động
CMD ["nginx", "-g", "daemon off;"]
