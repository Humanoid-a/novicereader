from datetime import datetime, timezone
import uuid

from app.models.annotation import AnnotationTarget
from app.models.chat import (
    QuestionAnswerTurn,
    QuestionConversation,
    QuestionLinkedSelection,
)
from app.storage.data_store import (
    read_question_conversation_records,
    write_question_conversation_records,
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_or_create_question_conversation(
    user_id: str,
    paper_id: str,
) -> QuestionConversation:
    conversations = read_question_conversations(user_id, paper_id)

    if conversations:
        return conversations[0]

    timestamp = now_iso()

    conversation = QuestionConversation(
        id=str(uuid.uuid4()),
        paperId=paper_id,
        userId=user_id,
        createdAt=timestamp,
        updatedAt=timestamp,
    )

    write_question_conversations(user_id, paper_id, [conversation])

    return conversation


def read_question_conversations(
    user_id: str,
    paper_id: str,
) -> list[QuestionConversation]:
    return [
        QuestionConversation(**conversation)
        for conversation in read_question_conversation_records(user_id, paper_id)
    ]


def write_question_conversations(
    user_id: str,
    paper_id: str,
    conversations: list[QuestionConversation],
) -> None:
    write_question_conversation_records(
        user_id,
        paper_id,
        [conversation.model_dump() for conversation in conversations],
    )


def get_or_create_question_conversation_v2(
    user_id: str,
    paper_id: str,
    conversation_id: str | None = None,
) -> tuple[QuestionConversation, list[QuestionConversation]]:
    conversations = read_question_conversations(user_id, paper_id)

    if conversation_id is not None:
        for conversation in conversations:
            if conversation.id == conversation_id:
                return conversation, conversations

    timestamp = now_iso()
    conversation = QuestionConversation(
        id=str(uuid.uuid4()),
        paperId=paper_id,
        userId=user_id,
        createdAt=timestamp,
        updatedAt=timestamp,
    )
    conversations.append(conversation)

    return conversation, conversations


def save_question_turn(
    user_id: str,
    paper_id: str,
    user_message: str,
    ai_response: str,
    conversation_id: str | None = None,
    target: AnnotationTarget | None = None,
    annotation_id: str | None = None,
    annotation_explanation: str | None = None,
) -> tuple[QuestionAnswerTurn, QuestionConversation]:
    conversation, conversations = get_or_create_question_conversation_v2(
        user_id=user_id,
        paper_id=paper_id,
        conversation_id=conversation_id,
    )
    timestamp = now_iso()

    linked_selection = None

    if target is not None:
        linked_selection = QuestionLinkedSelection(
            annotationId=annotation_id,
            annotationTargetId=target.id,
            target=target,
            annotationExplanation=annotation_explanation,
        )

    turn = QuestionAnswerTurn(
        id=str(uuid.uuid4()),
        conversationId=conversation.id,
        paperId=paper_id,
        userId=user_id,
        userMessage=user_message,
        aiResponse=ai_response,
        linkedSelection=linked_selection,
        createdAt=timestamp,
    )

    conversation.turns.append(turn)
    conversation.updatedAt = timestamp

    write_question_conversations(user_id, paper_id, conversations)

    return turn, conversation


def list_question_turns(
    user_id: str,
    paper_id: str,
) -> list[QuestionAnswerTurn]:
    turns: list[QuestionAnswerTurn] = []

    for conversation in read_question_conversations(user_id, paper_id):
        turns.extend(conversation.turns)

    return turns


def list_question_conversations(
    user_id: str,
    paper_id: str,
) -> list[QuestionConversation]:
    return read_question_conversations(user_id, paper_id)


def get_question_conversation(
    user_id: str,
    paper_id: str,
    conversation_id: str | None,
) -> QuestionConversation | None:
    if conversation_id is None:
        return None

    for conversation in read_question_conversations(user_id, paper_id):
        if conversation.id == conversation_id:
            return conversation

    return None


def has_questions_linked_to_target(
    user_id: str,
    paper_id: str,
    target_id: str,
) -> bool:
    return any(
        turn.linkedSelection is not None
        and turn.linkedSelection.annotationTargetId == target_id
        for conversation in read_question_conversations(user_id, paper_id)
        for turn in conversation.turns
    )
