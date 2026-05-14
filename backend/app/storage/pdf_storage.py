from __future__ import annotations

from pathlib import Path
from shutil import copyfile
import shutil
from typing import Iterable
from urllib.parse import quote

from fastapi import HTTPException
from fastapi.responses import FileResponse, StreamingResponse

from app.config import settings
from app.storage.paths import get_user_paper_dir


def use_s3_storage() -> bool:
    return settings.pdf_storage_backend.lower() == "s3"


def build_pdf_storage_key(
    user_id: str,
    paper_id: str,
    stored_filename: str,
) -> str:
    prefix = settings.s3_prefix.strip("/")
    key = f"users/{user_id}/papers/{paper_id}/{stored_filename}"

    if not prefix:
        return key

    return f"{prefix}/{key}"


def get_pdf_storage_key(paper: dict) -> str:
    return paper.get("storageKey") or build_pdf_storage_key(
        paper["userId"],
        paper["id"],
        paper["storedFilename"],
    )


def require_s3_bucket() -> str:
    if not settings.s3_bucket:
        raise HTTPException(
            status_code=503,
            detail="S3 PDF storage is enabled, but S3_BUCKET is not configured.",
        )

    return settings.s3_bucket


def get_s3_client():
    import boto3

    kwargs = {
        "region_name": settings.s3_region,
        "endpoint_url": settings.s3_endpoint_url,
    }

    if settings.s3_access_key_id and settings.s3_secret_access_key:
        kwargs["aws_access_key_id"] = settings.s3_access_key_id
        kwargs["aws_secret_access_key"] = settings.s3_secret_access_key

    return boto3.client(
        "s3",
        **{key: value for key, value in kwargs.items() if value},
    )


def save_pdf_from_path(
    *,
    user_id: str,
    paper_id: str,
    stored_filename: str,
    content_type: str,
    source_path: Path,
) -> str:
    storage_key = build_pdf_storage_key(user_id, paper_id, stored_filename)

    if use_s3_storage():
        get_s3_client().upload_file(
            str(source_path),
            require_s3_bucket(),
            storage_key,
            ExtraArgs={"ContentType": content_type},
        )
        return storage_key

    paper_dir = get_user_paper_dir(user_id, paper_id)
    paper_dir.mkdir(parents=True, exist_ok=True)
    copyfile(source_path, paper_dir / stored_filename)

    return storage_key


def _iter_s3_body(body) -> Iterable[bytes]:
    try:
        for chunk in body.iter_chunks(chunk_size=1024 * 1024):
            if chunk:
                yield chunk
    finally:
        body.close()


def get_pdf_response(paper: dict):
    filename = paper["originalFilename"]
    content_disposition = f"inline; filename*=UTF-8''{quote(filename)}"

    if use_s3_storage():
        from botocore.exceptions import ClientError

        try:
            response = get_s3_client().get_object(
                Bucket=require_s3_bucket(),
                Key=get_pdf_storage_key(paper),
            )
        except ClientError as error:
            raise HTTPException(status_code=404, detail="PDF file not found") from error

        return StreamingResponse(
            _iter_s3_body(response["Body"]),
            media_type=paper["contentType"] or "application/pdf",
            headers={"Content-Disposition": content_disposition},
        )

    file_path = (
        get_user_paper_dir(paper["userId"], paper["id"])
        / paper["storedFilename"]
    )

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="PDF file not found")

    return FileResponse(
        path=file_path,
        media_type=paper["contentType"] or "application/pdf",
        filename=filename,
    )


def read_pdf_bytes(paper: dict) -> bytes | None:
    if use_s3_storage():
        from botocore.exceptions import ClientError

        try:
            response = get_s3_client().get_object(
                Bucket=require_s3_bucket(),
                Key=get_pdf_storage_key(paper),
            )
        except ClientError:
            return None

        body = response["Body"]

        try:
            return body.read()
        finally:
            body.close()

    file_path = (
        get_user_paper_dir(paper["userId"], paper["id"])
        / paper["storedFilename"]
    )

    if not file_path.exists():
        return None

    return file_path.read_bytes()


def delete_pdf_for_paper(paper: dict) -> None:
    if use_s3_storage():
        from botocore.exceptions import ClientError

        try:
            get_s3_client().delete_object(
                Bucket=require_s3_bucket(),
                Key=get_pdf_storage_key(paper),
            )
        except ClientError:
            return

        return

    shutil.rmtree(get_user_paper_dir(paper["userId"], paper["id"]), ignore_errors=True)
