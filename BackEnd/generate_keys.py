import os
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization

def create_key_pair():
    print("[INFO] Đang khởi tạo cặp khóa RSA 2048-bit bằng Python...")
    
    # Sinh Private Key
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048
    )

    # Xuất và lưu file private_key.pem
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption()
    )
    with open("private_key.pem", "wb") as f:
        f.write(private_pem)

    # Sinh Public Key tương ứng
    public_key = private_key.public_key()

    # Xuất và lưu file public_key.pem
    public_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    )
    with open("public_key.pem", "wb") as f:
        f.write(public_pem)

    print("[SUCCESS] Đã tạo xong private_key.pem và public_key.pem trong thư mục dự án!")

if __name__ == "__main__":
    # Tự động cài đặt thư viện mã hóa nếu máy chưa có
    os.system("pip install cryptography")
    create_key_pair()