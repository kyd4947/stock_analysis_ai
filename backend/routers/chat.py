from typing import Optional
from fastapi import APIRouter
from pydantic import BaseModel
from backend.services import gemini as gemini_svc

router = APIRouter()


class ChatRequest(BaseModel):
    ticker: str
    question: str
    context_summary: Optional[str] = None


@router.post("/chat")
def chat(req: ChatRequest):
    answer = gemini_svc.answer_question(
        ticker=req.ticker,
        question=req.question,
        context_summary=req.context_summary or "",
    )
    return {"answer": answer}
