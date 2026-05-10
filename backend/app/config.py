from pydantic import BaseModel, Field
from dotenv import load_dotenv
import os

load_dotenv()


def parse_csv_env(value: str | None, default: list[str]) -> list[str]:
    if not value:
        return default

    return [item.strip() for item in value.split(",") if item.strip()]


class Settings(BaseModel):
    openai_api_key: str | None = os.getenv("OPENAI_API_KEY")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-5.4-mini")
    frontend_origin: str = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
    frontend_origins: list[str] = Field(
        default_factory=lambda: parse_csv_env(
            os.getenv("FRONTEND_ORIGINS"),
            [os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")],
        )
    )
    frontend_origin_regex: str | None = os.getenv(
        "FRONTEND_ORIGIN_REGEX",
        (
            r"^http://("
            r"localhost|127\.0\.0\.1|0\.0\.0\.0|"
            r"10\.\d+\.\d+\.\d+|"
            r"172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|"
            r"192\.168\.\d+\.\d+"
            r")(:\d+)?$"
        ),
    )


settings = Settings()
