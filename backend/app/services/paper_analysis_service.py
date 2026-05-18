from __future__ import annotations

from datetime import datetime, timezone
import base64
import json
import re
import uuid
from typing import Any

from openai import OpenAI

from app.config import settings
from app.models.paper_analysis import (
    PaperAcademicContext,
    PaperAnalysisProfile,
    PaperAnalysisStatus,
    PaperFigureAnalysis,
    PaperSectionSummary,
)
from app.models.usage import TokenUsageFeature
from app.services.user_service import get_knowledge_profile_summary
from app.services.usage_service import record_openai_token_usage
from app.storage.data_store import (
    get_paper_analysis_profile_record,
    save_paper_analysis_profile_record,
)
from app.storage.pdf_storage import read_pdf_bytes


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_openai_client() -> OpenAI | None:
    if not settings.openai_api_key:
        return None

    return OpenAI(api_key=settings.openai_api_key)


def build_pdf_input_file(paper: dict) -> dict | None:
    pdf_bytes = read_pdf_bytes(paper)

    if pdf_bytes is None:
        return None

    encoded_pdf = base64.b64encode(pdf_bytes).decode("ascii")

    return {
        "type": "input_file",
        "filename": paper["originalFilename"],
        "file_data": f"data:application/pdf;base64,{encoded_pdf}",
    }


def extract_json_from_text(output_text: str) -> Any:
    stripped = output_text.strip()

    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*", "", stripped)
        stripped = re.sub(r"\s*```$", "", stripped)

    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        pass

    match = re.search(r"(\{.*\}|\[.*\])", stripped, re.DOTALL)

    if not match:
        raise ValueError("AI response did not contain JSON")

    return json.loads(match.group(1))


def to_list(value: Any) -> list:
    return value if isinstance(value, list) else []


def to_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def to_optional_int(value: Any) -> int | None:
    if value is None or value == "":
        return None

    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def to_optional_str(value: Any) -> str | None:
    if value is None:
        return None

    stripped = str(value).strip()
    return stripped or None


def build_reader_context_text(user_id: str) -> str:
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


def build_common_prompt_context(paper: dict, user_id: str) -> str:
    return (
        "APP CONTEXT\n"
        "NoviceReader helps beginner readers understand research papers. "
        "The stored profile should later help explain annotations, answer "
        "paper questions, and guide the reader through difficult background.\n\n"
        "READER KNOWLEDGE CONTEXT\n"
        f"{build_reader_context_text(user_id)}\n\n"
        "PAPER METADATA\n"
        f"Filename: {paper['originalFilename']}\n"
        f"Content type: {paper['contentType']}\n"
        f"Size bytes: {paper['sizeBytes']}\n"
    )


def profile_system_prompt() -> str:
    return (
        "You are NoviceReader's paper-profile builder. Analyze the uploaded "
        "research paper for a beginner reader. Be faithful to the paper. "
        "Use the attached PDF as the source of truth. Use general academic "
        "knowledge only for context, and do not invent citations, figures, "
        "section names, or claims. Return valid JSON only."
    )


def call_profile_model(
    *,
    paper: dict,
    user_id: str,
    prompt: str,
    feature: TokenUsageFeature,
) -> Any:
    client = get_openai_client()

    if client is None:
        return None

    content: list[dict] = []
    pdf_input = build_pdf_input_file(paper)

    if pdf_input is not None:
        content.append(pdf_input)

    content.append({"type": "input_text", "text": prompt})

    response = client.responses.create(
        model=settings.openai_model,
        instructions=profile_system_prompt(),
        input=[
            {
                "role": "user",
                "content": content,
            }
        ],
    )
    record_openai_token_usage(
        user_id=user_id,
        paper_id=paper["id"],
        feature=feature,
        model=settings.openai_model,
        response=response,
    )

    return extract_json_from_text(response.output_text)


def generate_section_summaries(paper: dict, user_id: str) -> list[PaperSectionSummary]:
    prompt = (
        "TASK\n"
        "Create a section-by-section summary profile for this paper. Identify "
        "every major named section in the paper. If the paper uses unnumbered "
        "or unusual sections, infer sensible section groups from headings.\n\n"
        f"{build_common_prompt_context(paper, user_id)}\n"
        "OUTPUT JSON SHAPE\n"
        "[\n"
        "  {\n"
        '    "sectionTitle": "exact or inferred section title",\n'
        '    "sectionOrder": 1,\n'
        '    "pageRange": "pages if known, otherwise null",\n'
        '    "contentSummary": "thorough but concise summary of this section",\n'
        '    "mainIdea": "the central point of this section",\n'
        '    "readerTakeaway": "what a beginner should remember",\n'
        '    "keyTerms": ["important terms introduced or used here"]\n'
        "  }\n"
        "]\n\n"
        "Return only valid JSON."
    )
    data = call_profile_model(
        paper=paper,
        user_id=user_id,
        prompt=prompt,
        feature="paper_section_summaries",
    )

    if not isinstance(data, list):
        return []

    return [
        PaperSectionSummary(
            id=str(uuid.uuid4()),
            sectionTitle=str(item.get("sectionTitle") or "Untitled section"),
            sectionOrder=to_int(item.get("sectionOrder"), index),
            pageRange=to_optional_str(item.get("pageRange")),
            contentSummary=str(item.get("contentSummary") or ""),
            mainIdea=str(item.get("mainIdea") or ""),
            readerTakeaway=str(item.get("readerTakeaway") or ""),
            keyTerms=[
                str(term)
                for term in to_list(item.get("keyTerms"))
                if str(term).strip()
            ],
        )
        for index, item in enumerate(data, start=1)
        if isinstance(item, dict)
    ]


def generate_academic_context(paper: dict, user_id: str) -> PaperAcademicContext:
    prompt = (
        "TASK\n"
        "Create an academic-context profile for this paper. Explain the "
        "background needed to understand the paper's main idea, considering "
        "NoviceReader's purpose and the specific reader knowledge profile. "
        "Include related research areas, methods, or named works only when "
        "they are clearly relevant and you are confident. If additional "
        "external research would be useful but you cannot verify it from the "
        "PDF or reliable general knowledge, list it as a background question "
        "instead of fabricating details.\n\n"
        f"{build_common_prompt_context(paper, user_id)}\n"
        "OUTPUT JSON SHAPE\n"
        "{\n"
        '  "overview": "big-picture academic context",\n'
        '  "appPurposeContext": "why this context matters in NoviceReader",\n'
        '  "readerKnowledgeContext": "how the reader profile changes what background matters",\n'
        '  "prerequisiteIdeas": ["concepts to know first"],\n'
        '  "relatedResearchAreas": ["relevant areas or subfields"],\n'
        '  "relatedWorksOrMethods": ["specific related works, methods, or model families if confident"],\n'
        '  "whyThisPaperMatters": "how the paper fits into the research area",\n'
        '  "limitationsOrUncertainties": ["uncertainties or context not safe to overclaim"],\n'
        '  "suggestedBackgroundReadingQuestions": ["questions the reader may need answered next"]\n'
        "}\n\n"
        "Return only valid JSON."
    )
    data = call_profile_model(
        paper=paper,
        user_id=user_id,
        prompt=prompt,
        feature="paper_academic_context",
    )

    if not isinstance(data, dict):
        return placeholder_academic_context(user_id)

    return PaperAcademicContext(
        overview=str(data.get("overview") or ""),
        appPurposeContext=str(data.get("appPurposeContext") or ""),
        readerKnowledgeContext=str(data.get("readerKnowledgeContext") or ""),
        prerequisiteIdeas=[
            str(item)
            for item in to_list(data.get("prerequisiteIdeas"))
            if str(item).strip()
        ],
        relatedResearchAreas=[
            str(item)
            for item in to_list(data.get("relatedResearchAreas"))
            if str(item).strip()
        ],
        relatedWorksOrMethods=[
            str(item)
            for item in to_list(data.get("relatedWorksOrMethods"))
            if str(item).strip()
        ],
        whyThisPaperMatters=str(data.get("whyThisPaperMatters") or ""),
        limitationsOrUncertainties=[
            str(item)
            for item in to_list(data.get("limitationsOrUncertainties"))
            if str(item).strip()
        ],
        suggestedBackgroundReadingQuestions=[
            str(item)
            for item in to_list(data.get("suggestedBackgroundReadingQuestions"))
            if str(item).strip()
        ],
    )


def generate_figure_analyses(paper: dict, user_id: str) -> list[PaperFigureAnalysis]:
    prompt = (
        "TASK\n"
        "Create a figure-by-figure analysis profile for this paper. Include "
        "figures, diagrams, plots, tables, architecture illustrations, and "
        "important visual/equation displays when they are treated like figures. "
        "Explain each figure's significance in the text, how it supports the "
        "paper's main idea, and what a beginner should notice.\n\n"
        f"{build_common_prompt_context(paper, user_id)}\n"
        "OUTPUT JSON SHAPE\n"
        "[\n"
        "  {\n"
        '    "figureLabel": "Figure 1 / Table 1 / Algorithm 1 / inferred label",\n'
        '    "figureOrder": 1,\n'
        '    "pageNumber": 1,\n'
        '    "figureType": "plot/table/diagram/equation/architecture/etc",\n'
        '    "whatItShows": "what is visually or structurally shown",\n'
        '    "significanceInText": "why the paper discusses this figure",\n'
        '    "contributionToMainIdea": "how it supports the main argument",\n'
        '    "howToReadIt": "short guidance for a beginner reader",\n'
        '    "possibleConfusions": ["things a beginner may misunderstand"]\n'
        "  }\n"
        "]\n\n"
        "Return only valid JSON."
    )
    data = call_profile_model(
        paper=paper,
        user_id=user_id,
        prompt=prompt,
        feature="paper_figure_analyses",
    )

    if not isinstance(data, list):
        return []

    return [
        PaperFigureAnalysis(
            id=str(uuid.uuid4()),
            figureLabel=str(item.get("figureLabel") or f"Figure {index}"),
            figureOrder=to_int(item.get("figureOrder"), index),
            pageNumber=to_optional_int(item.get("pageNumber")),
            figureType=to_optional_str(item.get("figureType")),
            whatItShows=str(item.get("whatItShows") or ""),
            significanceInText=str(item.get("significanceInText") or ""),
            contributionToMainIdea=str(item.get("contributionToMainIdea") or ""),
            howToReadIt=str(item.get("howToReadIt") or ""),
            possibleConfusions=[
                str(confusion)
                for confusion in to_list(item.get("possibleConfusions"))
                if str(confusion).strip()
            ],
        )
        for index, item in enumerate(data, start=1)
        if isinstance(item, dict)
    ]


def placeholder_academic_context(user_id: str) -> PaperAcademicContext:
    return PaperAcademicContext(
        overview=(
            "Paper analysis has not been generated yet. Configure the AI "
            "service or retry generation to fill this profile."
        ),
        appPurposeContext=(
            "This field will help NoviceReader adapt explanations and paper "
            "questions to the uploaded paper."
        ),
        readerKnowledgeContext=build_reader_context_text(user_id),
        prerequisiteIdeas=[],
        relatedResearchAreas=[],
        relatedWorksOrMethods=[],
        whyThisPaperMatters="",
        limitationsOrUncertainties=[
            "No AI-generated paper context is currently available."
        ],
        suggestedBackgroundReadingQuestions=[],
    )


def create_placeholder_profile(
    *,
    paper: dict,
    user_id: str,
    status: PaperAnalysisStatus = "placeholder",
    notes: list[str] | None = None,
) -> PaperAnalysisProfile:
    timestamp = now_iso()

    return PaperAnalysisProfile(
        id=str(uuid.uuid4()),
        paperId=paper["id"],
        userId=user_id,
        status=status,
        sectionSummaries=[],
        academicContext=placeholder_academic_context(user_id),
        figureAnalyses=[],
        generationNotes=notes or [],
        createdAt=timestamp,
        updatedAt=timestamp,
    )


def create_paper_analysis_profile_for_paper(
    *,
    user_id: str,
    paper: dict,
) -> PaperAnalysisProfile:
    if get_openai_client() is None:
        profile = create_placeholder_profile(
            paper=paper,
            user_id=user_id,
            notes=["OPENAI_API_KEY is not configured."],
        )
        save_paper_analysis_profile_record(profile.model_dump())
        return profile

    notes: list[str] = []
    timestamp = now_iso()

    try:
        section_summaries = generate_section_summaries(paper, user_id)
    except Exception as error:
        section_summaries = []
        notes.append(f"Section-summary generation failed: {error}")

    try:
        academic_context = generate_academic_context(paper, user_id)
    except Exception as error:
        academic_context = placeholder_academic_context(user_id)
        notes.append(f"Academic-context generation failed: {error}")

    try:
        figure_analyses = generate_figure_analyses(paper, user_id)
    except Exception as error:
        figure_analyses = []
        notes.append(f"Figure-analysis generation failed: {error}")

    profile = PaperAnalysisProfile(
        id=str(uuid.uuid4()),
        paperId=paper["id"],
        userId=user_id,
        status="failed" if notes else "ready",
        sectionSummaries=section_summaries,
        academicContext=academic_context,
        figureAnalyses=figure_analyses,
        generationNotes=notes,
        createdAt=timestamp,
        updatedAt=now_iso(),
    )
    save_paper_analysis_profile_record(profile.model_dump())

    return profile


def get_paper_analysis_profile(
    *,
    user_id: str,
    paper_id: str,
) -> PaperAnalysisProfile:
    profile = get_paper_analysis_profile_record(user_id, paper_id)

    if profile is None:
        from app.services.paper_service import find_paper_or_404

        paper = find_paper_or_404(user_id, paper_id)
        return create_placeholder_profile(
            paper=paper,
            user_id=user_id,
            notes=["No stored paper analysis profile exists yet."],
        )

    return PaperAnalysisProfile(**profile)
