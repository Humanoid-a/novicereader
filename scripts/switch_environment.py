#!/usr/bin/env python3
"""
Switch NoviceReader between local development and deployed server settings.

This updates only non-secret config:
- deployment.json
- URL/storage keys in backend/.env

It intentionally preserves secrets such as OPENAI_API_KEY, AUTH_SECRET_KEY,
REGISTRATION_CODE, and database passwords.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
DEPLOYMENT_CONFIG_PATH = ROOT_DIR / "deployment.json"
BACKEND_ENV_PATH = ROOT_DIR / "backend" / ".env"
BACKEND_ENV_EXAMPLE_PATH = ROOT_DIR / "backend" / ".env.example"

LOCAL_FRONTEND_ORIGIN = "http://localhost:3000"
LOCAL_FRONTEND_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"
LOCAL_BACKEND_ORIGIN = "http://localhost:8000"
PRODUCTION_ORIGIN = "https://novicereader.com"
PRODUCTION_WWW_ORIGIN = "https://www.novicereader.com"


def normalize_mode(mode: str) -> str:
    normalized = mode.strip().lower()

    if normalized in {"local", "dev", "development", "test"}:
        return "local"

    if normalized in {"deploy", "deployment", "prod", "production", "server"}:
        return "deploy"

    raise SystemExit("Mode must be one of: local, dev, deploy, prod")


def read_deployment_config() -> dict:
    if not DEPLOYMENT_CONFIG_PATH.exists():
        return {}

    return json.loads(DEPLOYMENT_CONFIG_PATH.read_text(encoding="utf-8"))


def write_deployment_config(mode: str) -> None:
    existing_config = {
        "productionDomain": "novicereader.com",
        "productionOrigin": PRODUCTION_ORIGIN,
        "productionWwwOrigin": PRODUCTION_WWW_ORIGIN,
        "localFrontendOrigin": LOCAL_FRONTEND_ORIGIN,
        "localBackendPort": 8000,
        **read_deployment_config(),
    }
    config = {
        "isBuiltDeployment": mode == "deploy",
        "productionDomain": existing_config["productionDomain"],
        "productionOrigin": existing_config["productionOrigin"],
        "productionWwwOrigin": existing_config["productionWwwOrigin"],
        "localFrontendOrigin": existing_config["localFrontendOrigin"],
        "localBackendPort": existing_config["localBackendPort"],
    }

    DEPLOYMENT_CONFIG_PATH.write_text(
        json.dumps(config, indent=2) + "\n",
        encoding="utf-8",
    )


def read_env_lines() -> list[str]:
    if BACKEND_ENV_PATH.exists():
        return BACKEND_ENV_PATH.read_text(encoding="utf-8").splitlines()

    if BACKEND_ENV_EXAMPLE_PATH.exists():
        return BACKEND_ENV_EXAMPLE_PATH.read_text(encoding="utf-8").splitlines()

    return []


def env_key_from_line(line: str) -> str | None:
    stripped = line.strip()

    if not stripped or stripped.startswith("#") or "=" not in stripped:
        return None

    key = stripped.split("=", 1)[0].strip()

    if not key:
        return None

    return key


def update_env(updates: dict[str, str]) -> None:
    lines = read_env_lines()
    seen_keys: set[str] = set()
    updated_lines: list[str] = []

    for line in lines:
        key = env_key_from_line(line)

        if key in updates:
            updated_lines.append(f"{key}={updates[key]}")
            seen_keys.add(key)
        else:
            updated_lines.append(line)

    missing_updates = [
        (key, value)
        for key, value in updates.items()
        if key not in seen_keys
    ]

    if missing_updates:
        if updated_lines and updated_lines[-1].strip():
            updated_lines.append("")

        updated_lines.append("# Environment selected by scripts/switch_environment.py")

        for key, value in missing_updates:
            updated_lines.append(f"{key}={value}")

    BACKEND_ENV_PATH.parent.mkdir(parents=True, exist_ok=True)
    BACKEND_ENV_PATH.write_text("\n".join(updated_lines).rstrip() + "\n", encoding="utf-8")


def get_env_updates(mode: str, pdf_storage: str) -> dict[str, str]:
    if mode == "local":
        return {
            "FRONTEND_ORIGIN": LOCAL_FRONTEND_ORIGIN,
            "FRONTEND_ORIGINS": LOCAL_FRONTEND_ORIGINS,
            "PUBLIC_BACKEND_ORIGIN": LOCAL_BACKEND_ORIGIN,
            "DATABASE_URL": "",
            "PDF_STORAGE_BACKEND": "local",
        }

    return {
        "FRONTEND_ORIGIN": PRODUCTION_ORIGIN,
        "FRONTEND_ORIGINS": f"{PRODUCTION_ORIGIN},{PRODUCTION_WWW_ORIGIN}",
        "PUBLIC_BACKEND_ORIGIN": PRODUCTION_ORIGIN,
        # Docker Compose injects DATABASE_URL from the root .env POSTGRES_PASSWORD.
        # Keeping this blank here avoids accidentally using a placeholder value.
        "DATABASE_URL": "",
        "PDF_STORAGE_BACKEND": pdf_storage,
    }


def print_summary(mode: str, pdf_storage: str) -> None:
    if mode == "local":
        print("Switched to local development.")
        print("- deployment.json: isBuiltDeployment=false")
        print("- backend/.env: localhost origins, local PDF storage, JSON fallback DB")
        return

    print("Switched to deployed server mode.")
    print("- deployment.json: isBuiltDeployment=true")
    print("- backend/.env: novicereader.com origins")
    print(f"- backend/.env: PDF_STORAGE_BACKEND={pdf_storage}")
    print("- Database: Docker Compose injects DATABASE_URL from root .env")
    print("  Make sure root .env contains POSTGRES_PASSWORD=...")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Switch NoviceReader environment settings.",
    )
    parser.add_argument(
        "mode",
        help="local/dev or deploy/prod",
    )
    parser.add_argument(
        "--pdf-storage",
        choices=["local", "s3"],
        default="local",
        help="PDF storage backend for deployed mode. Default: local.",
    )
    args = parser.parse_args()
    mode = normalize_mode(args.mode)

    write_deployment_config(mode)
    update_env(get_env_updates(mode, args.pdf_storage))
    print_summary(mode, args.pdf_storage)


if __name__ == "__main__":
    main()
