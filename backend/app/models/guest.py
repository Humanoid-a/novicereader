from pydantic import BaseModel, Field


class GuestSession(BaseModel):
    id: str
    token: str
    userId: str | None = None
    createdAt: str
    updatedAt: str
    paperIds: list[str] = Field(default_factory=list)


class GuestSessionResponse(BaseModel):
    sessionId: str
    sessionToken: str


class EndGuestSessionRequest(BaseModel):
    sessionId: str
    sessionToken: str
