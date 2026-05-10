from openai import OpenAI
from app.config import settings
from app.models.annotation import (
    AnnotationTarget,
    AiExplanationContent,
)
from app.models.context import DocumentContext
from app.services.context_service import context_to_prompt_text
from app.services.user_service import get_knowledge_profile_summary


def get_openai_client() -> OpenAI | None:
    if not settings.openai_api_key:
        return None

    return OpenAI(api_key=settings.openai_api_key)


def placeholder_explanation(
    target: AnnotationTarget,
    prompt: str,
    context: DocumentContext,
) -> AiExplanationContent:
    if target.type == "text":
        main = (
            "Placeholder AI explanation:\n\n"
            "You selected a text passage from the paper. "
            "This is where the OpenAI explanation will appear once your API key is configured.\n\n"
            f"User prompt: {prompt}\n\n"
            f"Selected text preview:\n{target.text[:900]}"
        )
    else:
        main = (
            "Placeholder AI visual explanation:\n\n"
            f"You selected a cropped region on page {target.pageNumber}. "
            "This is where the visual explanation will appear once your API key is configured.\n\n"
            f"User prompt: {prompt}"
        )

    return AiExplanationContent(
        mainExplanation=main,
        knowledgePoints=[],
        followUpConversation=[],
        relatedConcepts=[],
    )


def build_explanation_system_prompt() -> str:
    return """
You are NoviceReader, an AI research paper reading helper.

Your audience is the specific reader described in the user knowledge section.

Your current task is to write a saved annotation explanation for a selected
piece of a research paper. The selected content may be highlighted text or a
cropped visual region such as an equation, figure, or table.

Write the final answer as a short annotation from the paper's point of view:
- Explain what the paper is saying here, as if translating the authors' point
  into clearer language.
- Do not pretend to be the actual authors and do not add claims that are not in
  the selected content or supplied context.
- Preserve the meaning, uncertainty, and scope of the paper.
- Rephrase first; add explanation only where the reader likely needs it.
- Use the reader's knowledge profile to decide what terms, symbols, or concepts
  need a brief definition.
- Keep it concise enough to display beside the PDF.
- If it is an equation, explain the symbols and intuition briefly.
- If it is a figure/table, explain what the paper wants the reader to notice.
- Avoid pretending you know the whole paper if the context is limited.

Return only the annotation text in plain text.
"""


def build_user_knowledge_prompt_text(user_id: str) -> str:
    summary = get_knowledge_profile_summary(user_id)

    parts = [
        summary.overview,
        f"Assumed level: {summary.assumedLevel}.",
    ]

    if summary.assumptions:
        parts.append("Assumptions: " + " ".join(summary.assumptions))

    if summary.knownInformation:
        parts.append("Known information: " + " ".join(summary.knownInformation))

    if summary.knowledgeGaps:
        parts.append("Knowledge gaps: " + " ".join(summary.knowledgeGaps))

    parts.append("Explanation guidance: " + summary.explanationGuidance)

    return "\n".join(parts)


def build_annotation_explanation_prompt(
    target: AnnotationTarget,
    prompt: str,
    context: DocumentContext,
) -> str:
    context_text = context_to_prompt_text(context)
    user_knowledge_text = build_user_knowledge_prompt_text(context.userId)

    if target.type == "text":
        selected_content = target.text
    else:
        selected_content = (
            f"Cropped visual region on page {target.pageNumber}. "
            "Use the image input and document context to explain it."
        )

    return (
        "TASK\n"
        "Create a short saved annotation explanation for the user's selected "
        "research-paper content. The annotation should explain what the paper "
        "is saying in this selected part, in clearer language for this reader.\n\n"
        "TASK CONTEXT\n"
        "NoviceReader helps beginners read research papers. This explanation "
        "will be displayed next to the PDF after the user highlights text or "
        "selects a cropped visual region. The explanation should feel like a "
        "plain-language rephrasing of the paper's own point, not a separate "
        "lecture unless extra explanation is needed.\n\n"
        "USER KNOWLEDGE\n"
        f"{user_knowledge_text}\n\n"
        "DOCUMENT CONTEXT\n"
        f"{context_text}\n\n"
        "USER REQUEST\n"
        f"{prompt}\n\n"
        "SELECTED CONTENT\n"
        f"{selected_content}\n\n"
        "OUTPUT INSTRUCTIONS\n"
        "Write one short annotation. Use the same perspective as the paper: "
        "state what this part is trying to say or show. Rephrase it in a more "
        "understandable way for the reader, and add brief explanatory detail "
        "only when the user knowledge profile suggests the reader may need it. "
        "Keep the meaning faithful to the selected content and context. Return "
        "only the annotation explanation text."
    )


def call_openai_for_explanation(
    target: AnnotationTarget,
    prompt: str,
    context: DocumentContext,
) -> AiExplanationContent:
    client = get_openai_client()

    if client is None:
        return placeholder_explanation(target, prompt, context)

    user_text = build_annotation_explanation_prompt(
        target=target,
        prompt=prompt,
        context=context,
    )

    content: list[dict] = [
        {
            "type": "input_text",
            "text": user_text,
        }
    ]

    if target.type == "region" and target.imageDataUrl:
        content.append(
            {
                "type": "input_image",
                "image_url": target.imageDataUrl,
            }
        )

    response = client.responses.create(
        model=settings.openai_model,
        instructions=build_explanation_system_prompt(),
        input=[
            {
                "role": "user",
                "content": content,
            }
        ],
    )

    explanation_text = response.output_text

    return AiExplanationContent(
        mainExplanation=explanation_text,
        knowledgePoints=[],
        followUpConversation=[],
        relatedConcepts=[],
    )


def call_openai_chat(
    message: str,
    context: DocumentContext,
) -> str:
    """
    Shared handler for future document chat.
    For now, this is simple. Later it can support:
    - chat history
    - annotation-linked questions
    - user profile personalization
    - retrieved paper context
    """

    client = get_openai_client()

    if client is None:
        return (
            "Placeholder chat response:\n\n"
            "The shared AI chat handler is working, but OPENAI_API_KEY is not configured."
        )

    response = client.responses.create(
        model=settings.openai_model,
        instructions=build_explanation_system_prompt(),
        input=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            f"Message:\n{message}\n\n"
                            f"Document context:\n{context_to_prompt_text(context)}"
                        ),
                    }
                ],
            }
        ],
    )

    return response.output_text
