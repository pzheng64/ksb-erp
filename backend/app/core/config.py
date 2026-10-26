from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "mysql+pymysql://ksb:ksb@127.0.0.1:3306/ksb_erp?charset=utf8mb4"
    jwt_secret: str = "dev-ksb-erp-change-in-production"
    jwt_expire_minutes: int = 720
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    @property
    def cors_origin_list(self) -> List[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


settings = Settings()
