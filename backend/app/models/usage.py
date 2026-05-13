from pydantic import BaseModel, Field
from typing import Literal


TokenUsageFeature = Literal[
    "annotation_explanation",
    "follow_up_explanation",
    "ask_question",
    "document_chat",
]


class TokenUsageRecord(BaseModel):
    id: str
    userId: str
    paperId: str | None = None
    feature: TokenUsageFeature
    model: str
    inputTokens: int = 0
    outputTokens: int = 0
    totalTokens: int = 0
    rawUsage: dict = Field(default_factory=dict)
    createdAt: str


class TokenUsageBucket(BaseModel):
    name: str
    inputTokens: int = 0
    outputTokens: int = 0
    totalTokens: int = 0
    requestCount: int = 0


class TokenUsageSummary(BaseModel):
    userId: str
    inputTokens: int = 0
    outputTokens: int = 0
    totalTokens: int = 0
    requestCount: int = 0
    byFeature: list[TokenUsageBucket] = Field(default_factory=list)
    byModel: list[TokenUsageBucket] = Field(default_factory=list)
    recentRecords: list[TokenUsageRecord] = Field(default_factory=list)
