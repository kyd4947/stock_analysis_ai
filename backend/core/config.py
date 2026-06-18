from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DART_API_KEY: str = ""
    ECOS_API_KEY: str = ""
    FRED_API_KEY: str = ""
    NEWS_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    TOSS_API_KEY: str = ""
    TOSS_CLIENT_ID: str = ""
    TOSS_CLIENT_SECRET: str = ""
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    SITE_PASSWORD: str = ""
    JWT_SECRET: str = ""
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
