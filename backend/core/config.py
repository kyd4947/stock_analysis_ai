from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DART_API_KEY: str = ""
    ECOS_API_KEY: str = ""
    FRED_API_KEY: str = ""
    NEWS_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    SECRET_KEY: str = "change-this-to-a-random-secret-in-production"
    USER_DB_PATH: str = "users.db"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
