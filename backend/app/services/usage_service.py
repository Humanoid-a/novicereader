from datetime import datetime, timezone
import uuid

from app.models.usage import (
    TokenUsageBucket,
    TokenUsageFeature,
    TokenUsageRecord,
    TokenUsageSummary,
)
from app.storage.json_store import read_json, write_json
from app.storage.paths import get_user_token_usage_path


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_field(value: object, field_name: str) -> object | None:
    if isinstance(value, dict):
        return value.get(field_name)

    return getattr(value, field_name, None)


def _to_int(value: object | None) -> int:
    if isinstance(value, bool) or value is None:
        return 0

    if isinstance(value, int):
        return max(value, 0)

    if isinstance(value, float):
        return max(int(value), 0)

    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())

    return 0


def _usage_to_dict(usage: object | None) -> dict:
    if usage is None:
        return {}

    if isinstance(usage, dict):
        return usage

    model_dump = getattr(usage, "model_dump", None)
    if callable(model_dump):
        return model_dump()

    return {
        key: value
        for key, value in vars(usage).items()
        if not key.startswith("_")
    }


def _read_usage_records(user_id: str) -> list[TokenUsageRecord]:
    records = read_json(get_user_token_usage_path(user_id), [])

    if not isinstance(records, list):
        return []

    return [TokenUsageRecord(**record) for record in records]


def _write_usage_records(user_id: str, records: list[TokenUsageRecord]) -> None:
    write_json(
        get_user_token_usage_path(user_id),
        [record.model_dump() for record in records],
    )


def _record_to_bucket(bucket_name: str, record: TokenUsageRecord) -> TokenUsageBucket:
    return TokenUsageBucket(
        name=bucket_name,
        inputTokens=record.inputTokens,
        outputTokens=record.outputTokens,
        totalTokens=record.totalTokens,
        requestCount=1,
    )


def _add_record_to_bucket(
    buckets: dict[str, TokenUsageBucket],
    bucket_name: str,
    record: TokenUsageRecord,
) -> None:
    bucket = buckets.get(bucket_name)

    if bucket is None:
        buckets[bucket_name] = _record_to_bucket(bucket_name, record)
        return

    bucket.inputTokens += record.inputTokens
    bucket.outputTokens += record.outputTokens
    bucket.totalTokens += record.totalTokens
    bucket.requestCount += 1


def extract_token_usage_counts(response: object) -> tuple[int, int, int, dict]:
    usage = _get_field(response, "usage")
    raw_usage = _usage_to_dict(usage)

    input_tokens = _to_int(
        _get_field(usage, "input_tokens")
        or _get_field(usage, "prompt_tokens")
    )
    output_tokens = _to_int(
        _get_field(usage, "output_tokens")
        or _get_field(usage, "completion_tokens")
    )
    total_tokens = _to_int(_get_field(usage, "total_tokens"))

    if total_tokens == 0:
        total_tokens = input_tokens + output_tokens

    return input_tokens, output_tokens, total_tokens, raw_usage


def record_openai_token_usage(
    *,
    user_id: str,
    paper_id: str | None,
    feature: TokenUsageFeature,
    model: str,
    response: object,
) -> TokenUsageRecord | None:
    input_tokens, output_tokens, total_tokens, raw_usage = extract_token_usage_counts(
        response
    )

    if total_tokens == 0 and not raw_usage:
        return None

    record = TokenUsageRecord(
        id=str(uuid.uuid4()),
        userId=user_id,
        paperId=paper_id,
        feature=feature,
        model=model,
        inputTokens=input_tokens,
        outputTokens=output_tokens,
        totalTokens=total_tokens,
        rawUsage=raw_usage,
        createdAt=now_iso(),
    )
    records = _read_usage_records(user_id)
    records.append(record)
    _write_usage_records(user_id, records)

    return record


def get_user_token_usage_summary(
    user_id: str,
    recent_limit: int = 25,
) -> TokenUsageSummary:
    records = _read_usage_records(user_id)
    by_feature: dict[str, TokenUsageBucket] = {}
    by_model: dict[str, TokenUsageBucket] = {}
    input_tokens = 0
    output_tokens = 0
    total_tokens = 0

    for record in records:
        input_tokens += record.inputTokens
        output_tokens += record.outputTokens
        total_tokens += record.totalTokens
        _add_record_to_bucket(by_feature, record.feature, record)
        _add_record_to_bucket(by_model, record.model, record)

    recent_records = sorted(
        records,
        key=lambda record: record.createdAt,
        reverse=True,
    )[:recent_limit]

    return TokenUsageSummary(
        userId=user_id,
        inputTokens=input_tokens,
        outputTokens=output_tokens,
        totalTokens=total_tokens,
        requestCount=len(records),
        byFeature=sorted(
            by_feature.values(),
            key=lambda bucket: bucket.totalTokens,
            reverse=True,
        ),
        byModel=sorted(
            by_model.values(),
            key=lambda bucket: bucket.totalTokens,
            reverse=True,
        ),
        recentRecords=recent_records,
    )
