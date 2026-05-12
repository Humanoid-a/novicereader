from pydantic import BaseModel, Field
from dotenv import load_dotenv
import os

from app.deployment_config import deployment_config

load_dotenv()


def parse_csv_env(value: str | None, default: list[str]) -> list[str]:
    if not value:
        return default

    return [item.strip() for item in value.split(",") if item.strip()]


def unique_values(values: list[str]) -> list[str]:
    return list(dict.fromkeys(values))


def get_default_frontend_origin() -> str:
    if deployment_config.isBuiltDeployment:
        return deployment_config.productionOrigin

    return deployment_config.localFrontendOrigin


def get_default_frontend_origins() -> list[str]:
    if deployment_config.isBuiltDeployment:
        return [
            deployment_config.productionOrigin,
            deployment_config.productionWwwOrigin,
        ]

    return [deployment_config.localFrontendOrigin]


def get_configured_frontend_origins() -> list[str]:
    configured_origins = [
        *parse_csv_env(os.getenv("FRONTEND_ORIGIN"), []),
        *parse_csv_env(os.getenv("FRONTEND_ORIGINS"), []),
    ]

    return unique_values([*get_default_frontend_origins(), *configured_origins])


def get_default_public_backend_origin() -> str:
    if deployment_config.isBuiltDeployment:
        return deployment_config.productionOrigin

    return f"http://localhost:{deployment_config.localBackendPort}"


def get_default_frontend_origin_regex() -> str | None:
    if deployment_config.isBuiltDeployment:
        return None

    return (
        r"^http://("
        r"localhost|127\.0\.0\.1|0\.0\.0\.0|"
        r"10\.\d+\.\d+\.\d+|"
        r"172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|"
        r"192\.168\.\d+\.\d+"
        r")(:\d+)?$"
    )


class Settings(BaseModel):
    openai_api_key: str | None = os.getenv("OPENAI_API_KEY")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-5.4-mini")
    auth_secret_key: str | None = os.getenv("AUTH_SECRET_KEY")
    auth_algorithm: str = os.getenv("AUTH_ALGORITHM", "HS256")
    access_token_expire_minutes: int = int(
        os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080")
    )
    registration_code: str | None = os.getenv("REGISTRATION_CODE")
    public_backend_origin: str = os.getenv(
        "PUBLIC_BACKEND_ORIGIN",
        get_default_public_backend_origin(),
    )
    frontend_origin: str = os.getenv("FRONTEND_ORIGIN", get_default_frontend_origin())
    frontend_origins: list[str] = Field(
        default_factory=get_configured_frontend_origins
    )
    frontend_origin_regex: str | None = os.getenv(
        "FRONTEND_ORIGIN_REGEX",
        get_default_frontend_origin_regex(),
    )


settings = Settings()
