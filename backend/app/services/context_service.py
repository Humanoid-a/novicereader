from app.models.annotation import AnnotationTarget
from app.models.context import DocumentContext, DocumentContextBlock
from app.services.paper_service import find_paper_or_404
from app.storage.paths import get_document_context_path
from app.storage.json_store import read_json
import uuid


def build_context_for_selection(
    user_id: str,
    paper_id: str,
    target: AnnotationTarget,
) -> DocumentContext:
    """
    Central place for building AI context.

    Right now:
    - paper metadata
    - selected text / selected region metadata

    Later:
    - abstract
    - paper summary
    - section summary
    - neighboring paragraphs
    - vector-retrieved chunks
    - user knowledge profile
    """

    paper = find_paper_or_404(user_id, paper_id)

    saved_context = read_json(
        get_document_context_path(user_id, paper_id),
        {
            "paperId": paper_id,
            "userId": user_id,
            "strategy": "selected_plus_metadata",
            "tokenBudgetHint": 4000,
            "blocks": [],
        },
    )

    blocks: list[DocumentContextBlock] = [
        DocumentContextBlock(
            id="paper_metadata",
            type="paper_metadata",
            title="Paper metadata",
            content=(
                f"Original filename: {paper['originalFilename']}\n"
                f"Content type: {paper['contentType']}\n"
                f"Size bytes: {paper['sizeBytes']}"
            ),
        )
    ]

    if target.type == "text":
        blocks.append(
            DocumentContextBlock(
                id=str(uuid.uuid4()),
                type="selected_text",
                title="Selected text",
                content=target.text,
            )
        )
    else:
        blocks.append(
            DocumentContextBlock(
                id=str(uuid.uuid4()),
                type="custom",
                title="Selected visual region",
                content=(
                    f"Region selected on page {target.pageNumber}. "
                    "The cropped image is included separately as image input."
                ),
            )
        )

    # Keep future saved blocks, such as abstract or summary.
    for block in saved_context.get("blocks", []):
        if block.get("type") in ["abstract", "summary", "nearby_text", "user_profile"]:
            blocks.append(DocumentContextBlock(**block))

    return DocumentContext(
        paperId=paper_id,
        userId=user_id,
        blocks=blocks,
        strategy=saved_context.get("strategy", "selected_plus_metadata"),
        tokenBudgetHint=saved_context.get("tokenBudgetHint", 4000),
    )


def context_to_prompt_text(context: DocumentContext) -> str:
    parts = []

    parts.append(f"Context strategy: {context.strategy}")
    parts.append(f"Token budget hint: {context.tokenBudgetHint}")

    for block in context.blocks:
        parts.append(f"\n[{block.type.upper()}] {block.title}\n{block.content}")

    return "\n".join(parts)