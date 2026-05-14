from openai import OpenAI
import base64
import re

from app.config import settings
from app.models.annotation import (
    AnnotationTarget,
    AiExplanationContent,
)
from app.models.chat import QuestionAnswerTurn
from app.models.context import DocumentContext
from app.models.usage import TokenUsageFeature
from app.services.context_service import context_to_prompt_text
from app.services.paper_service import find_paper_or_404
from app.services.user_service import get_knowledge_profile_summary
from app.services.usage_service import record_openai_token_usage
from app.storage.pdf_storage import read_pdf_bytes


FOLLOW_UP_EXPLANATION_TAG = "novicereader_followupexplanationtag"
FOLLOW_UP_EXPLANATION_PATTERN = re.compile(
    rf"<{FOLLOW_UP_EXPLANATION_TAG}>(.*?)</{FOLLOW_UP_EXPLANATION_TAG}>",
    re.DOTALL,
)


def build_pdf_input_file(context: DocumentContext) -> dict | None:
    paper = find_paper_or_404(context.userId, context.paperId)
    pdf_bytes = read_pdf_bytes(paper)

    if pdf_bytes is None:
        return None

    encoded_pdf = base64.b64encode(pdf_bytes).decode("ascii")

    return {
        "type": "input_file",
        "filename": paper["originalFilename"],
        "file_data": f"data:application/pdf;base64,{encoded_pdf}",
    }


def get_openai_client() -> OpenAI | None:
    if not settings.openai_api_key:
        return None

    return OpenAI(api_key=settings.openai_api_key)


def record_response_token_usage(
    *,
    context: DocumentContext,
    feature: TokenUsageFeature,
    response: object,
) -> None:
    record_openai_token_usage(
        user_id=context.userId,
        paper_id=context.paperId,
        feature=feature,
        model=settings.openai_model,
        response=response,
    )


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


def parse_ai_annotation_output(output_text: str) -> AiExplanationContent:
    follow_up_points = [
        match.strip()
        for match in FOLLOW_UP_EXPLANATION_PATTERN.findall(output_text)
        if match.strip()
    ]
    visible_explanation = FOLLOW_UP_EXPLANATION_PATTERN.sub("", output_text)
    visible_explanation = re.sub(r"\n{3,}", "\n\n", visible_explanation).strip()

    return AiExplanationContent(
        mainExplanation=visible_explanation,
        knowledgePoints=[],
        followUpConversation=[],
        relatedConcepts=follow_up_points,
    )


def _get_field(value: object, field_name: str) -> object | None:
    if isinstance(value, dict):
        return value.get(field_name)

    return getattr(value, field_name, None)


def format_annotation_explanation_for_prompt(
    explanation: AiExplanationContent | str | None,
) -> str:
    if explanation is None:
        return "No saved annotation explanation was provided."

    if isinstance(explanation, str):
        return explanation.strip() or "No saved annotation explanation was provided."

    sections: list[str] = []
    main_explanation = str(_get_field(explanation, "mainExplanation") or "").strip()

    if main_explanation:
        sections.append("Saved annotation explanation:\n" + main_explanation)

    related_concepts = list(_get_field(explanation, "relatedConcepts") or [])
    saved_follow_ups = list(_get_field(explanation, "followUpExplanations") or [])
    saved_by_prompt = {
        str(_get_field(item, "prompt") or "").strip().casefold(): item
        for item in saved_follow_ups
        if str(_get_field(item, "prompt") or "").strip()
    }
    printed_saved_prompts: set[str] = set()
    follow_up_lines: list[str] = []

    for concept in related_concepts:
        prompt_text = str(concept).strip()
        if not prompt_text:
            continue

        prompt_key = prompt_text.casefold()
        printed_saved_prompts.add(prompt_key)
        follow_up_lines.append(f"- Follow-up question: {prompt_text}")

        saved_item = saved_by_prompt.get(prompt_key)
        saved_response = str(_get_field(saved_item, "response") or "").strip()
        if saved_response:
            follow_up_lines.append(f"  Saved follow-up explanation: {saved_response}")

    for item in saved_follow_ups:
        prompt_text = str(_get_field(item, "prompt") or "").strip()
        if not prompt_text:
            continue

        prompt_key = prompt_text.casefold()
        if prompt_key in printed_saved_prompts:
            continue

        follow_up_lines.append(f"- Follow-up question: {prompt_text}")
        saved_response = str(_get_field(item, "response") or "").strip()
        if saved_response:
            follow_up_lines.append(f"  Saved follow-up explanation: {saved_response}")

    if follow_up_lines:
        sections.append("Annotation follow-up questions and saved explanations:\n" + "\n".join(follow_up_lines))

    return "\n\n".join(sections) or "No saved annotation explanation was provided."


def build_explanation_system_prompt() -> str:
    return """
You are NoviceReader, an AI research paper reading helper.

Your audience is the specific reader described in the user knowledge section.

Your current task is to write a saved annotation explanation for a selected
piece of a research paper. The selected content may be highlighted text or a
cropped visual region such as an equation, figure, or table.

Write the final answer as a concise reader-centered rephrasing:
- Treat the user's prompt as the strongest clue about what they are confused
  about or trying to learn.
- If the user's prompt is a follow-up question about a concept, mechanism, or
  phrase, answer that central question directly instead of only rephrasing the
  selected text.
- For follow-up why/how questions, explain the mechanism: what process is
  happening, why that process leads to the stated result, and how it connects
  back to the selected paper section.
- Use the reader's knowledge profile and the document context to infer what the
  reader likely does not understand in the selected content.
- Mostly rephrase the selected content in easier, more understandable language.
- Keep the rephrasing faithful to the original selected text: preserve the same
  meaning, relationships, uncertainty, and scope.
- Add brief explanations inside or after the rephrasing only where the reader
  likely needs them to understand the selected content.
- Define only the terms, symbols, assumptions, or mechanisms that block
  understanding of this exact selection.
- Give a concrete example or analogy only if the rephrasing would still be
  unclear without it.
- Preserve the meaning, uncertainty, and scope of the selected content.
- Do not add claims that are not supported by the selected content or supplied
  context.
- Avoid generic background, restating the whole selection, or lecturing beyond
  what the user asked.
- If it is an equation, explain the symbols and intuition briefly.
- If it is a figure/table, explain what the reader should notice.
- Avoid pretending you know the whole paper if the context is limited.
- Your response should be short, but sufficient for the reader to understand the selected content and answer their question.
- Your response should consider the academic context of the paper, and related work if needed.

After the visible annotation text, include a few optional follow-up points that
the reader may want explained next. Each point must be wrapped exactly like:
<novicereader_followupexplanationtag>point to explain</novicereader_followupexplanationtag>

Follow-up points should be concrete concepts, phrases, mechanisms, assumptions,
or related background ideas from or near the selected section. Choose points
based on what this reader may not know yet or may naturally be curious about.


Do not mention the tags in the visible annotation text. The application will
extract the tagged points and hide the tags from the displayed explanation.
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
        "research-paper content. The annotation should help this specific "
        "reader understand the selected part.\n\n"
        "TASK CONTEXT\n"
        "NoviceReader helps beginners read research papers. This explanation "
        "will be displayed next to the PDF after the user highlights text or "
        "selects a cropped visual region. Use the reader's knowledge profile "
        "and the selected-section context to decide what needs explanation and "
        "what can stay implicit."
        "Your explanation should consider what the reader not understand or needs explanation "
        "about the selected area to explain.\n\n"
        "USER KNOWLEDGE\n"
        f"{user_knowledge_text}\n\n"
        "DOCUMENT CONTEXT\n"
        f"{context_text}\n\n"
        "USER REQUEST\n"
        f"{prompt}\n\n"
        "SELECTED CONTENT\n"
        f"{selected_content}\n\n"
        "OUTPUT INSTRUCTIONS\n"
        "Write a concise plain-text rephrasing for this reader. Start from what "
        "the user is asking for, then consider what the reader likely does not "
        "understand yet based on the user knowledge profile and selected "
        "content. If the user is asking a follow-up why/how question, answer "
        "the central question directly by explaining the mechanism and the "
        "missing background idea, then connect it back to the selected section. "
        "Otherwise, mostly rephrase the selected content in easier language, "
        "while preserving the original meaning and scope. Add short "
        "explanations only for the specific terms, steps, or assumptions that "
        "the reader likely needs. Avoid broad background and avoid adding new "
        "claims. Use an example when it is the clearest way to explain the "
        "mechanism.\n\n"
        "After the visible annotation, add 2 to 5 optional follow-up explanation "
        "points when useful. Wrap each point in "
        f"<{FOLLOW_UP_EXPLANATION_TAG}> and </{FOLLOW_UP_EXPLANATION_TAG}>. "
        "These tagged points should name things within or closely related to "
        "the selected section that the reader may need explained next. The "
        "visible annotation must still read naturally without mentioning those "
        "tags."
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

    content: list[dict] = []

    pdf_input_file = build_pdf_input_file(context)

    if pdf_input_file is not None:
        content.append(pdf_input_file)

    content.append(
        {
            "type": "input_text",
            "text": user_text,
        }
    )

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
    record_response_token_usage(
        context=context,
        feature="annotation_explanation",
        response=response,
    )

    return parse_ai_annotation_output(response.output_text)


def placeholder_follow_up_explanation(
    follow_up_point: str,
    annotation_explanation: AiExplanationContent | str | None,
) -> AiExplanationContent:
    annotation_explanation_text = format_annotation_explanation_for_prompt(
        annotation_explanation
    )

    return AiExplanationContent(
        mainExplanation=(
            "Placeholder follow-up explanation:\n\n"
            f"Follow-up point: {follow_up_point}\n\n"
            "This is where a focused explanation of the clicked concept will "
            "appear once your API key is configured.\n\n"
            f"Previous annotation preview:\n{annotation_explanation_text[:600]}"
        ),
        knowledgePoints=[],
        followUpConversation=[],
        relatedConcepts=[],
    )


def build_follow_up_system_prompt() -> str:
    return """
You are NoviceReader, an AI research paper reading helper.

This task is different from writing the original annotation.

The user clicked a follow-up point that was extracted from a saved annotation.
Your job is to explain that clicked point directly.

Do not rephrase the selected paper text again unless it is needed for context.
Do not produce more follow-up tags. Do not answer as if you are creating a new
annotation version.

Write a focused plain-text explanation:
- Identify the central idea or question behind the clicked point.
- Explain the missing background concept the reader likely needs.
- Explain the mechanism, especially for why/how questions.
- Connect the explanation back to the saved annotation and selected paper
  section.
- Use the reader knowledge profile to choose the right level.
- Use one concrete example if it makes the mechanism easier to understand.
- Be concise, but complete enough that the reader understands the clicked point.
"""


def build_follow_up_prompt(
    follow_up_point: str,
    annotation_prompt: str,
    annotation_explanation: AiExplanationContent | str | None,
    context: DocumentContext,
) -> str:
    user_knowledge_text = build_user_knowledge_prompt_text(context.userId)
    context_text = context_to_prompt_text(context)
    annotation_explanation_text = format_annotation_explanation_for_prompt(annotation_explanation)

    return (
        "FOLLOW-UP POINT\n"
        f"{follow_up_point}\n\n"
        "USER KNOWLEDGE\n"
        f"{user_knowledge_text}\n\n"
        "DOCUMENT CONTEXT\n"
        f"{context_text}\n\n"
        "ORIGINAL ANNOTATION REQUEST\n"
        f"{annotation_prompt}\n\n"
        "SAVED ANNOTATION EXPLANATION\n"
        f"{annotation_explanation_text}\n\n"
        "OUTPUT INSTRUCTIONS\n"
        "Explain the clicked follow-up point directly. Do not rewrite the "
        "saved annotation. Explain what the point means, what missing idea a "
        "beginner needs in order to understand it, why/how it works, and why "
        "it matters in this local context. Use plain text only."
    )


def call_openai_for_follow_up_explanation(
    target: AnnotationTarget,
    follow_up_point: str,
    annotation_prompt: str,
    annotation_explanation: AiExplanationContent | str | None,
    context: DocumentContext,
) -> AiExplanationContent:
    client = get_openai_client()

    if client is None:
        return placeholder_follow_up_explanation(
            follow_up_point=follow_up_point,
            annotation_explanation=annotation_explanation,
        )

    content: list[dict] = []

    pdf_input_file = build_pdf_input_file(context)

    if pdf_input_file is not None:
        content.append(pdf_input_file)

    content.append(
        {
            "type": "input_text",
            "text": build_follow_up_prompt(
                follow_up_point=follow_up_point,
                annotation_prompt=annotation_prompt,
                annotation_explanation=annotation_explanation,
                context=context,
            ),
        }
    )

    if target.type == "region" and target.imageDataUrl:
        content.append(
            {
                "type": "input_image",
                "image_url": target.imageDataUrl,
            }
        )

    response = client.responses.create(
        model=settings.openai_model,
        instructions=build_follow_up_system_prompt(),
        input=[
            {
                "role": "user",
                "content": content,
            }
        ],
    )
    record_response_token_usage(
        context=context,
        feature="follow_up_explanation",
        response=response,
    )

    return AiExplanationContent(
        mainExplanation=response.output_text.strip(),
        knowledgePoints=[],
        followUpConversation=[],
        relatedConcepts=[],
    )


def build_selected_quote_prompt_text(
    target: AnnotationTarget | None,
    annotation_explanation: str | None,
) -> str:
    if target is None:
        return "No selected annotation or quote is attached to this question."

    if target.type == "text":
        selected_content = target.text
    else:
        selected_content = (
            f"Cropped visual region on page {target.pageNumber}. "
            "Use the attached image input if available."
        )

    parts = [
        "SELECTED QUOTE OR REGION",
        selected_content,
    ]

    if annotation_explanation:
        parts.extend(
            [
                "",
                "SAVED AI EXPLANATION FOR THIS SELECTION",
                annotation_explanation,
            ]
        )

    return "\n".join(parts)


def build_ask_question_prompt(
    message: str,
    context: DocumentContext,
    target: AnnotationTarget | None,
    annotation_explanation: str | None,
    previous_turns: list[QuestionAnswerTurn] | None = None,
) -> str:
    user_knowledge_text = build_user_knowledge_prompt_text(context.userId)
    context_text = context_to_prompt_text(context)
    annotation_explanation_text = format_annotation_explanation_for_prompt(annotation_explanation)
    selected_quote_text = build_selected_quote_prompt_text(
        target=target,
        annotation_explanation=annotation_explanation,
    )

    previous_conversation_text = "No previous conversation turns."

    if previous_turns:
        previous_conversation_text = "\n\n".join(
            [
                f"User: {turn.userMessage}\nAI: {turn.aiResponse}"
                for turn in previous_turns[-6:]
            ]
        )

    return (
        "TASK\n"
        "Answer the user's question or request about this research paper.\n\n"
        "PREVIOUS CONVERSATION\n"
        f"{previous_conversation_text}\n\n"
        "USER QUESTION\n"
        f"{message}\n\n"
        "USER KNOWLEDGE\n"
        f"{user_knowledge_text}\n\n"
        "DOCUMENT CONTEXT\n"
        f"{context_text}\n\n"
        f"{selected_quote_text}\n\n"
        "OUTPUT INSTRUCTIONS\n"
        "Use the full PDF, the selected quote or region, and the saved AI "
        "explanation when present. If the selected annotation is attached, "
        "treat it as important context for what the user is asking about. "
        "Answer clearly in plain text for this reader."
        "When answering, consider the academic context of the paper and research for additional information if needed."
    )


def build_ask_question_input_content(
    message: str,
    context: DocumentContext,
    target: AnnotationTarget | None,
    annotation_explanation: str | None,
    previous_turns: list[QuestionAnswerTurn] | None = None,
) -> list[dict]:
    content: list[dict] = []

    pdf_input_file = build_pdf_input_file(context)

    if pdf_input_file is not None:
        content.append(pdf_input_file)

    content.append(
        {
            "type": "input_text",
            "text": build_ask_question_prompt(
                message=message,
                context=context,
                target=target,
                annotation_explanation=annotation_explanation,
                previous_turns=previous_turns,
            ),
        }
    )

    if target is not None and target.type == "region" and target.imageDataUrl:
        content.append(
            {
                "type": "input_image",
                "image_url": target.imageDataUrl,
            }
        )

    return content


def call_openai_for_question(
    message: str,
    context: DocumentContext,
    target: AnnotationTarget | None = None,
    annotation_explanation: AiExplanationContent | str | None = None,
    previous_turns: list[QuestionAnswerTurn] | None = None,
) -> str:
    client = get_openai_client()

    if client is None:
        return (
            "Placeholder question response:\n\n"
            "This is where the AI answer will appear once your API key is configured."
        )

    content = build_ask_question_input_content(
        message=message,
        context=context,
        target=target,
        annotation_explanation=annotation_explanation,
        previous_turns=previous_turns,
    )

    response = client.responses.create(
        model=settings.openai_model,
        instructions=(
            "You are NoviceReader, an AI research paper reading helper. "
            "Answer the user's question using the full PDF, the provided "
            "document context, the user's knowledge profile, and any selected "
            "quote or saved annotation explanation. Be clear, accurate, and "
            "beginner-friendly. If a selected quote or region is attached, "
            "treat it as especially relevant context. Use plain text."
        ),
        input=[
            {
                "role": "user",
                "content": content,
            }
        ],
    )
    record_response_token_usage(
        context=context,
        feature="ask_question",
        response=response,
    )

    return response.output_text.strip()


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
    record_response_token_usage(
        context=context,
        feature="document_chat",
        response=response,
    )

    return response.output_text


def _format_annotation_target_for_prompt(target: AnnotationTarget | None) -> str:
    if target is None:
        return "No selected annotation was provided."

    if target.type == "text":
        return (
            "Selected annotation type: highlighted text\n"
            f"Selected text:\n{target.text}"
        )

    return (
        "Selected annotation type: cropped visual region\n"
        f"Page: {target.pageNumber}\n"
        "Use the PDF and attached image, when present, to understand this region."
    )


def _format_previous_question_turns(previous_turns: list[object] | None) -> str:
    if not previous_turns:
        return "No previous messages in this conversation."

    lines: list[str] = []
    for index, turn in enumerate(previous_turns, start=1):
        user_message = str(
            _get_field(turn, "message")
            or _get_field(turn, "question")
            or _get_field(turn, "userMessage")
            or ""
        ).strip()
        ai_answer = str(
            _get_field(turn, "answer")
            or _get_field(turn, "response")
            or _get_field(turn, "aiResponse")
            or ""
        ).strip()

        if user_message:
            lines.append(f"Turn {index} user question:\n{user_message}")
        if ai_answer:
            lines.append(f"Turn {index} AI answer:\n{ai_answer}")

    return "\n\n".join(lines) or "No previous messages in this conversation."


def build_ask_question_prompt(
    message: str,
    context: DocumentContext,
    target: AnnotationTarget | None = None,
    annotation_explanation: AiExplanationContent | str | None = None,
    previous_turns: list[object] | None = None,
    **_: object,
) -> str:
    user_knowledge_text = build_user_knowledge_prompt_text(context.userId)
    context_text = context_to_prompt_text(context)
    selected_annotation_text = _format_annotation_target_for_prompt(target)
    annotation_explanation_text = format_annotation_explanation_for_prompt(
        annotation_explanation
    )
    previous_turns_text = _format_previous_question_turns(previous_turns)

    return (
        "TASK\n"
        "Answer the reader's question about this research paper.\n\n"
        "TASK CONTEXT\n"
        "NoviceReader helps beginners understand research papers. Use the PDF, "
        "document context, reader knowledge profile, selected annotation if "
        "provided, and any saved annotation explanation material to answer the "
        "question clearly.\n\n"
        "USER KNOWLEDGE\n"
        f"{user_knowledge_text}\n\n"
        "DOCUMENT CONTEXT\n"
        f"{context_text}\n\n"
        "SELECTED ANNOTATION REFERENCE\n"
        f"{selected_annotation_text}\n\n"
        "ANNOTATION EXPLANATION AND FOLLOW-UPS\n"
        f"{annotation_explanation_text}\n\n"
        "PREVIOUS CONVERSATION\n"
        f"{previous_turns_text}\n\n"
        "USER QUESTION\n"
        f"{message}\n\n"
        "OUTPUT INSTRUCTIONS\n"
        "Answer the user's current question directly in plain text. If a "
        "selected annotation is provided, use it as local context and include "
        "the saved annotation explanation, follow-up questions, and any saved "
        "follow-up explanations when they clarify what the user already saw. "
        "Consider the reader's knowledge level, explain missing background "
        "only when needed, and use a concrete example when it helps."
    )
