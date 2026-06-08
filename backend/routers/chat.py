from typing import Optional
from fastapi import APIRouter, Request
from pydantic import BaseModel, field_validator
from backend.services import gemini as gemini_svc
from backend.core.limiter import limiter

router = APIRouter()


class ChatRequest(BaseModel):
    ticker: str
    question: str
    context_summary: Optional[str] = None

    @field_validator("question")
    @classmethod
    def validate_question(cls, v: str) -> str:
        if len(v) > 500:
            raise ValueError("질문은 500자 이내로 입력해주세요.")
        return v


@router.post("/chat")
@limiter.limit("10/minute")
def chat(request: Request, req: ChatRequest):
    answer = gemini_svc.answer_question(
        ticker=req.ticker,
        question=req.question,
        context_summary=req.context_summary or "",
    )
    return {"answer": answer}
