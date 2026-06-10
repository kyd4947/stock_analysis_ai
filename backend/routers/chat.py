import json
from typing import Optional
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
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


@router.post("/chat/stream")
@limiter.limit("10/minute")
def chat_stream(request: Request, req: ChatRequest):
    def generate():
        try:
            for chunk in gemini_svc.answer_question_stream(
                ticker=req.ticker,
                question=req.question,
                context_summary=req.context_summary or "",
            ):
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        except Exception:
            yield f"data: {json.dumps({'chunk': '답변 생성 중 오류가 발생했습니다.'})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
