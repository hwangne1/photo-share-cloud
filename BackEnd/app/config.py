import os
from dotenv import load_dotenv

# Nạp các biến môi trường từ file .env vào hệ thống
load_dotenv()

class Settings:
    AWS_ACCESS_KEY_ID: str = os.getenv("AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY: str = os.getenv("AWS_SECRET_ACCESS_KEY")
    AWS_BUCKET_NAME: str = os.getenv("AWS_BUCKET_NAME")
    AWS_REGION: str = os.getenv("AWS_REGION", "ap-southeast-1")

settings = Settings()