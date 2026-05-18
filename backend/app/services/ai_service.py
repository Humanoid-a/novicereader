from openai import OpenAI
import base64
import json
import re

from app.config import settings
from app.models.annotation import (
    AnnotationTarget,
    AiAnnotation,
    AiExplanationContent,
)
from app.models.chat import QuestionAnswerTurn
from app.models.context import DocumentContext
from app.models.user import UserKnowledgeProfile
from app.models.usage import TokenUsageFeature
from app.services.context_service import context_to_prompt_text
from app.services.paper_service import find_paper_or_404
from app.services.user_service import DEFAULT_KNOWLEDGE_DESCRIPTION, get_user_profile
from app.services.usage_service import record_openai_token_usage
from app.storage.pdf_storage import read_pdf_bytes


FOLLOW_UP_EXPLANATION_TAG = "novicereader_followupexplanationtag"
FOLLOW_UP_EXPLANATION_PATTERN = re.compile(
    rf"<{FOLLOW_UP_EXPLANATION_TAG}>(.*?)</{FOLLOW_UP_EXPLANATION_TAG}>",
    re.DOTALL,
)
ANNOTATION_NAME_TAG = "novicereader_annotationnametag"
ANNOTATION_NAME_PATTERN = re.compile(
    rf"<{ANNOTATION_NAME_TAG}>(.*?)</{ANNOTATION_NAME_TAG}>",
    re.DOTALL,
)
MATH_FORMATTING_INSTRUCTIONS = r"""
Math formatting:
- Write ordinary prose as text, but put mathematical variables, symbols,
  formulas, and equations in LaTeX math delimiters so the app can render them.
- Use \( ... \) for inline math such as \(x_i\), \(p < 0.05\), or \(\alpha\).
- Use \[ ... \] for standalone, important, or multi-step equations.
- Keep ordinary words outside math unless they are part of a formula.
- Do not leave raw LaTeX commands outside math delimiters.
""".strip()
ANNOTATION_JSON_OUTPUT_INSTRUCTIONS = """
Return exactly one valid JSON object and nothing else. Do not wrap it in
markdown fences.

JSON shape:
{
  "mainExplanation": "visible text shown to the reader",
  "annotationName": "short title, 3 to 8 words",
  "followUpPoints": ["optional concrete follow-up point", "..."]
}

Rules:
- Put all visible reader-facing prose only in mainExplanation.
- Do not include annotationName or followUpPoints inside mainExplanation.
- Do not use XML, HTML, markdown, or hidden marker tags for metadata.
- followUpPoints must be an array of 2 to 5 short strings when useful, or an
  empty array when no useful follow-up exists.
- Use normal JSON escaping for newlines and quotes.
""".strip()
ANNOTATION_RESPONSE_TEXT_FORMAT = {
    "format": {
        "type": "json_schema",
        "name": "novicereader_annotation_response",
        "strict": True,
        "description": (
            "Structured annotation content for the NoviceReader PDF reader."
        ),
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "mainExplanation": {
                    "type": "string",
                    "description": (
                        "The visible reader-facing explanation or summary text."
                    ),
                },
                "annotationName": {
                    "type": "string",
                    "description": "A concise 3 to 8 word saved annotation title.",
                },
                "followUpPoints": {
                    "type": "array",
                    "description": (
                        "Optional short concepts the reader may ask about next."
                    ),
                    "items": {"type": "string"},
                },
            },
            "required": [
                "mainExplanation",
                "annotationName",
                "followUpPoints",
            ],
        },
    },
}
ANNOTATION_JSON_OBJECT_TEXT_FORMAT = {
    "format": {
        "type": "json_object",
    },
}


def normalize_selection_targets(
    target: AnnotationTarget | None = None,
    targets: list[AnnotationTarget] | None = None,
) -> list[AnnotationTarget]:
    if targets:
        return targets

    return [target] if target is not None else []


def describe_selection_targets(targets: list[AnnotationTarget]) -> str:
    if not targets:
        return "No selected content was provided."

    parts: list[str] = []

    for index, target in enumerate(targets, start=1):
        if target.type == "text":
            parts.append(f"Selection {index}: highlighted text\n{target.text}")
        else:
            parts.append(
                f"Selection {index}: cropped visual region on page {target.pageNumber}. "
                "Use the corresponding image input and document context to explain it."
            )

    return "\n\n".join(parts)


def clean_annotation_name(value: str) -> str:
    cleaned = re.sub(r"\s+", " ", value).strip().strip("\"'`“”‘’")

    if len(cleaned) <= 64:
        return cleaned

    return cleaned[:61].rstrip() + "..."


def fallback_annotation_name(targets: list[AnnotationTarget]) -> str:
    if not targets:
        return "Selected content"

    if len(targets) > 1:
        if all(target.type == "region" for target in targets):
            return "Selected regions"

        if all(target.type == "text" for target in targets):
            return "Highlighted text"

        return "Mixed selection"

    target = targets[0]

    if target.type == "region":
        return f"Region on page {target.pageNumber}"

    words = re.findall(r"\w+(?:[-']\w+)?", target.text)
    if not words:
        return "Highlighted text"

    return clean_annotation_name(" ".join(words[:6]))


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


def should_retry_without_annotation_schema(error: Exception) -> bool:
    if isinstance(error, TypeError):
        return True

    message = f"{error.__class__.__name__}: {error}".lower()
    format_terms = (
        "text.format",
        "response_format",
        "json_schema",
        "json_object",
        "structured output",
        "structured outputs",
    )

    return any(term in message for term in format_terms)


def create_annotation_response(
    client: OpenAI,
    *,
    instructions: str,
    content: list[dict],
) -> object:
    input_payload = [
        {
            "role": "user",
            "content": content,
        }
    ]
    request_kwargs = {
        "model": settings.openai_model,
        "instructions": instructions,
        "input": input_payload,
    }

    try:
        return client.responses.create(
            **request_kwargs,
            text=ANNOTATION_RESPONSE_TEXT_FORMAT,
        )
    except Exception as error:
        if not should_retry_without_annotation_schema(error):
            raise

    try:
        return client.responses.create(
            **request_kwargs,
            text=ANNOTATION_JSON_OBJECT_TEXT_FORMAT,
        )
    except Exception as error:
        if not should_retry_without_annotation_schema(error):
            raise

    return client.responses.create(**request_kwargs)


def placeholder_explanation(
    targets: list[AnnotationTarget],
    prompt: str,
    context: DocumentContext,
) -> AiExplanationContent:
    selected_preview = describe_selection_targets(targets)[:1200]
    main = (
        "Placeholder AI explanation:\n\n"
        f"You selected {len(targets)} item(s) from the paper. "
        "This is where the OpenAI explanation will appear once your API key is configured.\n\n"
        f"User prompt: {prompt}\n\n"
        f"Selected content preview:\n{selected_preview}"
    )

    return AiExplanationContent(
        mainExplanation=main,
        annotationName=fallback_annotation_name(targets),
        knowledgePoints=[],
        followUpConversation=[],
        relatedConcepts=[],
    )


def placeholder_summary(
    targets: list[AnnotationTarget],
    prompt: str,
    context: DocumentContext,
) -> AiExplanationContent:
    selected_preview = describe_selection_targets(targets)[:1200]
    main = (
        "Placeholder AI summary:\n\n"
        f"You selected {len(targets)} item(s) from the paper. "
        "This is where the OpenAI summary will appear once your API key is configured.\n\n"
        f"User prompt: {prompt}\n\n"
        f"Selected content preview:\n{selected_preview}"
    )

    return AiExplanationContent(
        mainExplanation=main,
        annotationName=fallback_annotation_name(targets),
        knowledgePoints=[],
        followUpConversation=[],
        relatedConcepts=[],
    )


def extract_json_object_from_text(text: str) -> dict | None:
    stripped_text = text.strip()

    if stripped_text.startswith("```"):
        stripped_text = re.sub(r"^```(?:json)?\s*", "", stripped_text, flags=re.IGNORECASE)
        stripped_text = re.sub(r"\s*```$", "", stripped_text)

    decoder = json.JSONDecoder()

    for index, character in enumerate(stripped_text):
        if character != "{":
            continue

        try:
            value, _ = decoder.raw_decode(stripped_text[index:])
        except json.JSONDecodeError:
            continue

        if isinstance(value, dict):
            return value

    return None


def parse_structured_ai_annotation_output(
    output_text: str,
    targets: list[AnnotationTarget],
) -> AiExplanationContent | None:
    payload = extract_json_object_from_text(output_text)

    if payload is None:
        return None

    main_explanation = str(
        payload.get("mainExplanation")
        or payload.get("explanation")
        or payload.get("summary")
        or payload.get("visibleText")
        or ""
    ).strip()
    main_explanation = ANNOTATION_NAME_PATTERN.sub("", main_explanation)
    main_explanation = FOLLOW_UP_EXPLANATION_PATTERN.sub("", main_explanation)
    main_explanation = re.sub(r"\n{3,}", "\n\n", main_explanation).strip()
    annotation_name = clean_annotation_name(
        str(
            payload.get("annotationName")
            or payload.get("name")
            or payload.get("title")
            or ""
        )
    )
    raw_follow_up_points = (
        payload.get("followUpPoints")
        or payload.get("follow_up_points")
        or payload.get("relatedConcepts")
        or payload.get("followUps")
        or []
    )

    if not isinstance(raw_follow_up_points, list):
        raw_follow_up_points = []

    follow_up_points: list[str] = []
    seen_follow_up_points: set[str] = set()

    for raw_point in raw_follow_up_points:
        point = re.sub(r"\s+", " ", str(raw_point)).strip()

        if not point:
            continue

        point_key = point.casefold()
        if point_key in seen_follow_up_points:
            continue

        seen_follow_up_points.add(point_key)
        follow_up_points.append(point)

    if not main_explanation:
        return None

    return AiExplanationContent(
        mainExplanation=main_explanation,
        annotationName=annotation_name or fallback_annotation_name(targets),
        knowledgePoints=[],
        followUpConversation=[],
        relatedConcepts=follow_up_points[:5],
    )


def parse_ai_annotation_output(
    output_text: str,
    targets: list[AnnotationTarget],
) -> AiExplanationContent:
    structured_output = parse_structured_ai_annotation_output(
        output_text,
        targets,
    )

    if structured_output is not None:
        return structured_output

    annotation_name_matches = [
        clean_annotation_name(match)
        for match in ANNOTATION_NAME_PATTERN.findall(output_text)
        if clean_annotation_name(match)
    ]
    follow_up_points = [
        match.strip()
        for match in FOLLOW_UP_EXPLANATION_PATTERN.findall(output_text)
        if match.strip()
    ]
    visible_explanation = ANNOTATION_NAME_PATTERN.sub("", output_text)
    visible_explanation = FOLLOW_UP_EXPLANATION_PATTERN.sub("", visible_explanation)
    visible_explanation = re.sub(r"\n{3,}", "\n\n", visible_explanation).strip()

    return AiExplanationContent(
        mainExplanation=visible_explanation,
        annotationName=annotation_name_matches[0] if annotation_name_matches else fallback_annotation_name(targets),
        knowledgePoints=[],
        followUpConversation=[],
        relatedConcepts=follow_up_points,
    )


def _get_field(value: object, field_name: str) -> object | None:
    if isinstance(value, dict):
        return value.get(field_name)

    return getattr(value, field_name, None)


def infer_annotation_response_kind_from_prompt(prompt: str) -> str:
    prompt_text = prompt.strip().lower()

    if (
        prompt_text.startswith("summarize")
        or prompt_text.startswith("summary")
        or " summarize " in prompt_text
        or " summary " in prompt_text
    ):
        return "summary"

    return "explanation"


def infer_annotation_response_kind_for_prompt(annotation: AiAnnotation) -> str:
    response_kind = _get_field(annotation, "responseKind")

    if response_kind == "summary":
        return "summary"

    prompt = str(_get_field(annotation, "prompt") or "")
    return infer_annotation_response_kind_from_prompt(prompt)


def infer_annotation_version_response_kind_for_prompt(version: object) -> str:
    response_kind = _get_field(version, "responseKind")

    if response_kind in ("explanation", "summary"):
        return str(response_kind)

    prompt = str(_get_field(version, "prompt") or "")
    return infer_annotation_response_kind_from_prompt(prompt)


def get_latest_annotation_version_for_prompt(
    annotation: AiAnnotation,
    kind: str,
) -> object | None:
    versions = list(_get_field(annotation, "versions") or [])
    matching_versions = [
        version
        for version in versions
        if infer_annotation_version_response_kind_for_prompt(version) == kind
    ]

    if not matching_versions:
        return None

    return sorted(
        matching_versions,
        key=lambda version: str(_get_field(version, "createdAt") or ""),
        reverse=True,
    )[0]


def get_annotation_response_content_for_prompt(
    annotation: AiAnnotation,
    kind: str,
) -> object | None:
    if kind == "summary":
        summary = _get_field(annotation, "summary")

        if str(_get_field(summary, "mainExplanation") or "").strip():
            return summary

        summary_version = get_latest_annotation_version_for_prompt(
            annotation,
            "summary",
        )

        if summary_version is not None:
            return _get_field(summary_version, "explanation")

        if infer_annotation_response_kind_for_prompt(annotation) == "summary":
            return _get_field(annotation, "explanation")

        return None

    explanation_version = get_latest_annotation_version_for_prompt(
        annotation,
        "explanation",
    )

    if explanation_version is not None:
        return _get_field(explanation_version, "explanation")

    if infer_annotation_response_kind_for_prompt(annotation) == "summary":
        return None

    return _get_field(annotation, "explanation")


def format_annotation_content_part_for_prompt(
    explanation: AiExplanationContent | object,
    part_label: str,
) -> str:
    sections: list[str] = []
    main_explanation = str(_get_field(explanation, "mainExplanation") or "").strip()

    if main_explanation:
        sections.append(f"{part_label}:\n" + main_explanation)

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
        sections.append(f"{part_label} follow-ups:\n" + "\n".join(follow_up_lines))

    return "\n\n".join(sections)


def format_annotation_explanation_for_prompt(
    explanation: AiExplanationContent | str | None,
) -> str:
    if explanation is None:
        return "No saved annotation explanation was provided."

    if isinstance(explanation, str):
        return explanation.strip() or "No saved annotation explanation was provided."

    return (
        format_annotation_content_part_for_prompt(explanation, "Explanation part")
        or "No saved annotation explanation was provided."
    )


def format_annotation_context_for_prompt(
    annotation: AiAnnotation | None,
    fallback: AiExplanationContent | str | None = None,
) -> str | None:
    if annotation is None:
        if fallback is None:
            return None

        return format_annotation_explanation_for_prompt(fallback)

    sections: list[str] = []
    summary = get_annotation_response_content_for_prompt(annotation, "summary")
    explanation = get_annotation_response_content_for_prompt(
        annotation,
        "explanation",
    )

    if summary is not None:
        summary_text = format_annotation_content_part_for_prompt(
            summary,
            "Summary part",
        )

        if summary_text:
            sections.append(summary_text)

    if explanation is not None:
        explanation_text = format_annotation_content_part_for_prompt(
            explanation,
            "Explanation part",
        )

        if explanation_text:
            sections.append(explanation_text)

    if sections:
        return "\n\n".join(sections)

    if fallback is not None:
        return format_annotation_explanation_for_prompt(fallback)

    return None


def build_explanation_system_prompt() -> str:
    return f"""
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

{MATH_FORMATTING_INSTRUCTIONS}

Follow-up points should be concrete concepts, phrases, mechanisms, assumptions,
or related background ideas from or near the selected section. Choose points
based on what this reader may not know yet or may naturally be curious about.

{ANNOTATION_JSON_OUTPUT_INSTRUCTIONS}
"""


def build_summary_system_prompt() -> str:
    return f"""
You are NoviceReader, an AI research paper reading helper.

Your audience is the specific reader described in the user knowledge section.

Your current task is to write a saved annotation summary for a selected piece
of a research paper. The selected content may be highlighted text or a cropped
visual region such as an equation, figure, or table.

Write the visible summary directly, briefly, and from the authors' perspective:
- Treat the user's prompt as the strongest clue about what kind of summary they
  want.
- Say what the authors are doing or arguing in this selected section.
- Hit the selected section's main idea first.
- Then state why this section is significant inside the paper: how it supports
  the paper's argument, method, evidence, result, or transition.
- Use document context to infer the part's role in the paper, but do not
  overclaim. If the broader role is unclear, summarize the local significance
  visible from the selected content and nearby context.
- Condense the selection into the key claim, relationship, result, method, or
  evidence.
- Use the reader's knowledge profile only to choose plain wording and decide
  whether one very short term clarification is needed.
- Do not turn the answer into a full explanation, tutorial, or background note.
- Keep the visible summary to one short paragraph, usually 1 to 3 sentences.
- Avoid phrases like "this section is about" when a direct author-perspective
  sentence is clearer.
- Preserve the original meaning, uncertainty, and scope.
- Do not add claims that are not supported by the selected content or supplied
  context.
- If the selected content is an equation, summarize what it represents and why
  it matters for the paper's reasoning.
- If the selected content is a figure/table, summarize what the reader should
  take away from it and why that takeaway matters in the paper.
- Avoid pretending you know the whole paper if the context is limited.

{MATH_FORMATTING_INSTRUCTIONS}

Follow-up points should be concrete concepts, phrases, mechanisms, assumptions,
or related background ideas from or near the selected section. Choose points
based on what this reader may not know yet or may naturally be curious about.

The annotationName should read like a clear summary title: concise, 3 to 8
words, focused on the selected part's main idea and paper-level significance.
Avoid generic names like "Summary" or "Selected content." Do not write it as an
explanation title.

{ANNOTATION_JSON_OUTPUT_INSTRUCTIONS}
"""


def build_user_knowledge_prompt_text(
    user_id: str,
    knowledge_profile: UserKnowledgeProfile | None = None,
) -> str:
    profile = knowledge_profile or get_user_profile(user_id).knowledgeProfile
    description = profile.backgroundSummary.strip() or DEFAULT_KNOWLEDGE_DESCRIPTION
    domains = ", ".join(profile.knownDomains) if profile.knownDomains else "none provided"
    weak_areas = ", ".join(profile.weakAreas) if profile.weakAreas else "none provided"

    return "\n".join(
        [
            f"Brief description: {description}",
            f"Knowledge domains: {domains}",
            f"Weak areas: {weak_areas}",
        ]
    )


def build_annotation_explanation_prompt(
    targets: list[AnnotationTarget],
    prompt: str,
    context: DocumentContext,
    knowledge_profile: UserKnowledgeProfile | None = None,
) -> str:
    context_text = context_to_prompt_text(context)
    user_knowledge_text = build_user_knowledge_prompt_text(
        context.userId,
        knowledge_profile,
    )

    selected_content = describe_selection_targets(targets)

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
        "Write a concise, readable rephrasing for this reader. Start from what "
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
        f"{MATH_FORMATTING_INSTRUCTIONS}\n\n"
        "Add 2 to 5 optional follow-up explanation points when useful. These "
        "points should name things within or closely related to the selected "
        "section that the reader may need explained next.\n\n"
        "Add exactly one short annotation name for this saved annotation. The "
        "name should be concise, 3 to 8 words, and capture what the selected "
        "content is mainly about.\n\n"
        f"{ANNOTATION_JSON_OUTPUT_INSTRUCTIONS}"
    )


def build_annotation_summary_prompt(
    targets: list[AnnotationTarget],
    prompt: str,
    context: DocumentContext,
    knowledge_profile: UserKnowledgeProfile | None = None,
) -> str:
    context_text = context_to_prompt_text(context)
    user_knowledge_text = build_user_knowledge_prompt_text(
        context.userId,
        knowledge_profile,
    )

    selected_content = describe_selection_targets(targets)

    return (
        "TASK\n"
        "Create a short saved annotation summary for the user's selected "
        "research-paper content. The summary should help this specific reader "
        "quickly remember the selected part's main idea and why it matters "
        "inside the paper.\n\n"
        "TASK CONTEXT\n"
        "NoviceReader helps beginners read research papers. This summary will "
        "be displayed next to the PDF after the user highlights text or selects "
        "a cropped visual region. Use the reader's knowledge profile and the "
        "selected-section context to identify the selected part's role in the "
        "paper: whether it supports an argument, defines a method, presents "
        "evidence, reports a result, motivates a transition, or clarifies a "
        "concept. Keep the focus on summarizing, not teaching the whole "
        "concept.\n\n"
        "USER KNOWLEDGE\n"
        f"{user_knowledge_text}\n\n"
        "DOCUMENT CONTEXT\n"
        f"{context_text}\n\n"
        "USER REQUEST\n"
        f"{prompt}\n\n"
        "SELECTED CONTENT\n"
        f"{selected_content}\n\n"
        "OUTPUT INSTRUCTIONS\n"
        "Write a direct, short, concise summary from the authors' "
        "perspective. Say what the authors are doing or arguing in this "
        "selected section, then why this section is significant inside the "
        "paper: how it helps the paper's argument, method, evidence, result, or "
        "flow. Mention only the key details needed to preserve the original "
        "meaning, uncertainty, and scope. If the user asks for a specific kind "
        "of summary, follow that request while staying faithful to the selected "
        "content. Use simple wording, but do not expand into a full "
        "explanation. Keep the visible summary to one short paragraph, usually "
        "1 to 3 sentences. Avoid broad background and avoid adding new claims. "
        "Avoid phrases like \"this section is about\" when a direct "
        "author-perspective sentence is clearer. "
        "If the selected context is not enough to know the larger paper-level "
        "role, say what it appears to do in the selected or nearby context.\n\n"
        f"{MATH_FORMATTING_INSTRUCTIONS}\n\n"
        "Add 2 to 5 optional follow-up explanation points when useful. These "
        "points should name things within or closely related to the selected "
        "section that the reader may need explained next.\n\n"
        "Also add exactly one short summary annotation name for this saved "
        "summary. The name should read like a clear summary title: concise, 3 "
        "to 8 words, focused on the selected part's main idea and paper-level "
        "significance. Avoid generic names like \"Summary\" or \"Selected "
        "content.\" Do not write it as an explanation title.\n\n"
        f"{ANNOTATION_JSON_OUTPUT_INSTRUCTIONS}"
    )


def call_openai_for_explanation(
    target: AnnotationTarget | None = None,
    prompt: str = "",
    context: DocumentContext | None = None,
    targets: list[AnnotationTarget] | None = None,
    knowledge_profile: UserKnowledgeProfile | None = None,
) -> AiExplanationContent:
    selected_targets = normalize_selection_targets(target=target, targets=targets)
    client = get_openai_client()

    if context is None:
        raise ValueError("Document context is required")

    if client is None:
        return placeholder_explanation(selected_targets, prompt, context)

    user_text = build_annotation_explanation_prompt(
        targets=selected_targets,
        prompt=prompt,
        context=context,
        knowledge_profile=knowledge_profile,
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

    for selected_target in selected_targets:
        if selected_target.type == "region" and selected_target.imageDataUrl:
            content.append(
                {
                    "type": "input_image",
                    "image_url": selected_target.imageDataUrl,
                }
            )

    response = create_annotation_response(
        client,
        instructions=build_explanation_system_prompt(),
        content=content,
    )
    record_response_token_usage(
        context=context,
        feature="annotation_explanation",
        response=response,
    )

    return parse_ai_annotation_output(response.output_text, selected_targets)


def call_openai_for_summary(
    target: AnnotationTarget | None = None,
    prompt: str = "",
    context: DocumentContext | None = None,
    targets: list[AnnotationTarget] | None = None,
    knowledge_profile: UserKnowledgeProfile | None = None,
) -> AiExplanationContent:
    selected_targets = normalize_selection_targets(target=target, targets=targets)
    client = get_openai_client()

    if context is None:
        raise ValueError("Document context is required")

    if client is None:
        return placeholder_summary(selected_targets, prompt, context)

    user_text = build_annotation_summary_prompt(
        targets=selected_targets,
        prompt=prompt,
        context=context,
        knowledge_profile=knowledge_profile,
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

    for selected_target in selected_targets:
        if selected_target.type == "region" and selected_target.imageDataUrl:
            content.append(
                {
                    "type": "input_image",
                    "image_url": selected_target.imageDataUrl,
                }
            )

    response = create_annotation_response(
        client,
        instructions=build_summary_system_prompt(),
        content=content,
    )
    record_response_token_usage(
        context=context,
        feature="annotation_summary",
        response=response,
    )

    return parse_ai_annotation_output(response.output_text, selected_targets)


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
    return f"""
You are NoviceReader, an AI research paper reading helper.

This task is different from writing the original annotation.

The user clicked a follow-up point that was extracted from a saved annotation.
Your job is to explain that clicked point directly.

Do not rephrase the selected paper text again unless it is needed for context.
Do not produce more follow-up tags. Do not answer as if you are creating a new
annotation version.

Write a focused explanation:
- Identify the central idea or question behind the clicked point.
- Explain the missing background concept the reader likely needs.
- Explain the mechanism, especially for why/how questions.
- Connect the explanation back to the saved annotation and selected paper
  section.
- Use the reader knowledge profile to choose the right level.
- Use one concrete example if it makes the mechanism easier to understand.
- Be concise, but complete enough that the reader understands the clicked point.

{MATH_FORMATTING_INSTRUCTIONS}
"""


def build_follow_up_prompt(
    follow_up_point: str,
    annotation_prompt: str,
    annotation_explanation: AiExplanationContent | str | None,
    context: DocumentContext,
    knowledge_profile: UserKnowledgeProfile | None = None,
) -> str:
    user_knowledge_text = build_user_knowledge_prompt_text(
        context.userId,
        knowledge_profile,
    )
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
        "it matters in this local context.\n\n"
        f"{MATH_FORMATTING_INSTRUCTIONS}"
    )


def call_openai_for_follow_up_explanation(
    target: AnnotationTarget | None,
    follow_up_point: str,
    annotation_prompt: str,
    annotation_explanation: AiExplanationContent | str | None,
    context: DocumentContext,
    targets: list[AnnotationTarget] | None = None,
    knowledge_profile: UserKnowledgeProfile | None = None,
) -> AiExplanationContent:
    selected_targets = normalize_selection_targets(target=target, targets=targets)
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
                knowledge_profile=knowledge_profile,
            ),
        }
    )

    for selected_target in selected_targets:
        if selected_target.type == "region" and selected_target.imageDataUrl:
            content.append(
                {
                    "type": "input_image",
                    "image_url": selected_target.imageDataUrl,
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
                "SAVED AI ANNOTATION CONTEXT FOR THIS SELECTION",
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
    knowledge_profile: UserKnowledgeProfile | None = None,
) -> str:
    user_knowledge_text = build_user_knowledge_prompt_text(
        context.userId,
        knowledge_profile,
    )
    context_text = context_to_prompt_text(context)
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
        "annotation context when present. If the selected annotation is attached, "
        "treat it as important context for what the user is asking about. "
        "When both are present, the Summary part is the saved summary and the "
        "Explanation part is the saved explanation. "
        "Answer clearly for this reader.\n\n"
        f"{MATH_FORMATTING_INSTRUCTIONS}\n\n"
        "When answering, consider the academic context of the paper and research for additional information if needed."
    )


def build_ask_question_input_content(
    message: str,
    context: DocumentContext,
    target: AnnotationTarget | None,
    annotation_explanation: str | None,
    previous_turns: list[QuestionAnswerTurn] | None = None,
    knowledge_profile: UserKnowledgeProfile | None = None,
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
                knowledge_profile=knowledge_profile,
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
    knowledge_profile: UserKnowledgeProfile | None = None,
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
        knowledge_profile=knowledge_profile,
    )

    response = client.responses.create(
        model=settings.openai_model,
        instructions=(
            "You are NoviceReader, an AI research paper reading helper. "
            "Answer the user's question using the full PDF, the provided "
            "document context, the user's knowledge profile, and any selected "
            "quote or saved annotation explanation. Be clear, accurate, and "
            "beginner-friendly. If a selected quote or region is attached, "
            "treat it as especially relevant context. "
            f"{MATH_FORMATTING_INSTRUCTIONS}"
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
    knowledge_profile: UserKnowledgeProfile | None = None,
    **_: object,
) -> str:
    user_knowledge_text = build_user_knowledge_prompt_text(
        context.userId,
        knowledge_profile,
    )
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
        "provided, and any saved annotation summary or explanation material to answer the "
        "question clearly.\n\n"
        "USER KNOWLEDGE\n"
        f"{user_knowledge_text}\n\n"
        "DOCUMENT CONTEXT\n"
        f"{context_text}\n\n"
        "SELECTED ANNOTATION REFERENCE\n"
        f"{selected_annotation_text}\n\n"
        "ANNOTATION SUMMARY, EXPLANATION, AND FOLLOW-UPS\n"
        f"{annotation_explanation_text}\n\n"
        "PREVIOUS CONVERSATION\n"
        f"{previous_turns_text}\n\n"
        "USER QUESTION\n"
        f"{message}\n\n"
        "OUTPUT INSTRUCTIONS\n"
        "Answer the user's current question directly. If a "
        "selected annotation is provided, use it as local context. Treat the "
        "Summary part as the saved summary and the Explanation part as the "
        "saved explanation. Include both parts when present, along with "
        "follow-up questions and saved follow-up explanations when they clarify "
        "what the user already saw. "
        "Consider the reader's knowledge level, explain missing background "
        "only when needed, and use a concrete example when it helps.\n\n"
        f"{MATH_FORMATTING_INSTRUCTIONS}"
    )
