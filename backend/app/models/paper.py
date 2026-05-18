from pydantic import BaseModel


class PaperRecord(BaseModel):
    id: str
    userId: str
    originalFilename: str
    storedFilename: str
    storageKey: str | None = None
    analysisProfileId: str | None = None
    contentType: str
    sizeBytes: int
    createdAt: str
    updatedAt: str


class PaperWithUrls(PaperRecord):
    fileUrl: str
