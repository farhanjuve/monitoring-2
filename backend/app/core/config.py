from pydantic_settings import BaseSettings
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]

class Settings(BaseSettings):
    DATABASE_URL: str = "mysql+aiomysql://root:password@localhost:4000/pupuk_monitor"
    SECRET_KEY: str = "supersecretkeymin32charslongstring"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    
    R2_ACCOUNT_ID: str | None = None
    R2_ACCESS_KEY_ID: str | None = None
    R2_SECRET_ACCESS_KEY: str | None = None
    R2_BUCKET_NAME: str = "pupuk-photos"
    R2_PUBLIC_URL: str | None = None
    ALLOW_LOCAL_PHOTO_STORAGE: bool = False
    
    FCM_SERVER_KEY: str | None = None
    FCM_PROJECT_ID: str | None = None

    class Config:
        env_file = BASE_DIR / ".env"

settings = Settings()
