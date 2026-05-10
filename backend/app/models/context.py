from pydantic import BaseModel, Field
from typing import List, Optional, Literal


class DocumentContextBlock(BaseModel):
    id: str
    type: Literal[
        "paper_metadata",
        "abstract",
        "summary",
        "selected_text",
        "nearby_text",
        "user_profile",
        "custom"
    ]
    title: str
    content: str


class DocumentContext(BaseModel):
    paperId: str
    userId: str

    """
    Context blocks are intentionally modular.

    Later we can add:
    - abstract-only context
    - whole-paper summary
    - section summaries
    - nearby paragraphs
    - retrieved chunks from embeddings
    - user knowledge profile
    """

    blocks: List[DocumentContextBlock] = Field(default_factory=list)

    strategy: Literal[
        "minimal",
        "selected_plus_metadata",
        "selected_plus_summary",
        "retrieval_augmented"
    ] = "selected_plus_metadata"

    tokenBudgetHint: int = 4000