from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./cascadeguard.db"
    SECRET_KEY: str = "razorpay_secret_key_change_me_in_production"
    RAZORPAY_WEBHOOK_SECRET: str = ""
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    
    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
