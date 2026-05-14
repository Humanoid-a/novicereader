#!/usr/bin/env python3
"""
Create real .env files from tracked templates.

This does not overwrite existing .env files unless --force is provided.
Actual .env files stay gitignored because they contain secrets.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import shutil


ROOT_DIR = Path(__file__).resolve().parents[1]


def copy_template(source: Path, destination: Path, *, force: bool) -> None:
    if destination.exists() and not force:
        print(f"Kept existing {destination.relative_to(ROOT_DIR)}")
        return

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)
    print(f"Wrote {destination.relative_to(ROOT_DIR)} from {source.relative_to(ROOT_DIR)}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Install local .env files from tracked examples.",
    )
    parser.add_argument(
        "mode",
        choices=["local", "deploy"],
        help="Which environment template to install.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing .env files.",
    )
    args = parser.parse_args()

    backend_template = (
        ROOT_DIR / "backend" / ".env.local.example"
        if args.mode == "local"
        else ROOT_DIR / "backend" / ".env.deploy.example"
    )

    copy_template(
        backend_template,
        ROOT_DIR / "backend" / ".env",
        force=args.force,
    )

    if args.mode == "deploy":
        copy_template(
            ROOT_DIR / "compose.env.example",
            ROOT_DIR / ".env",
            force=args.force,
        )

    print("Fill in the placeholder secrets before running the app.")


if __name__ == "__main__":
    main()
