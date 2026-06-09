import asyncio
from fastapi import APIRouter
from backend.services.macro_service import get_macro_snapshot
from backend.services import gemini as gemini_svc
from backend.core.config import settings
import backend.services.market_insight as _mi_svc

router = APIRouter()


@router.get("/market-insight")
async def market_insight_endpoint():
    loop = asyncio.get_event_loop()
    macro = await loop.run_in_executor(None, get_macro_snapshot)
    result = await loop.run_in_executor(None, _mi_svc.get_market_insight, macro)
    return result


@router.post("/market-insight/refresh")
async def market_insight_refresh():
    """캐시 강제 갱신 — 배포 후 즉시 새 추천 종목 반영."""
    _mi_svc._cache = None
    _mi_svc._cache_time = None
    loop = asyncio.get_event_loop()
    macro = await loop.run_in_executor(None, get_macro_snapshot)
    result = await loop.run_in_executor(None, _mi_svc.get_market_insight, macro)
    return {"refreshed": True, "generated_at": result.get("generated_at")}


@router.get("/market-insight/gemini-test")
async def gemini_test():
    """Gemini API 연결 진단 — 키 유효성 및 오류 메시지 반환."""
    key = settings.GEMINI_API_KEY
    if not key:
        return {"ok": False, "error": "GEMINI_API_KEY 환경변수가 설정되지 않았습니다."}
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, gemini_svc._generate, "한국어로 '안녕'이라고만 답하세요."
        )
        return {"ok": True, "response": result, "key_prefix": key[:8] + "..."}
    except Exception as e:
        return {"ok": False, "error": str(e), "key_prefix": key[:8] + "..."}


@router.get("/market-insight/analyze-test")
async def analyze_test():
    """analyze_stock 진단 — 삼성전자로 실제 분석 흐름 전체 테스트."""
    try:
        loop = asyncio.get_event_loop()

        # 1단계: _generate 원문 응답 확인
        test_prompt = """당신은 한국 주식 투자 AI 애널리스트입니다. 삼성전자(005930) 종목을 분석하세요.

[재무] 현재가: 322,000원 | PER: 18.27 | PBR: 1.87 | ROE: 10.85%

위 데이터를 분석하여 아래 JSON 형식으로만 응답하세요. 마크다운(```)을 절대 사용하지 마세요.

{"score": 0.75, "signal": "BUY", "signal_reason": "근거", "summary": "요약", "reasons": ["근거1"]}

score는 0.0~1.0 실수, signal은 BUY/SELL/HOLD, 텍스트는 한국어."""

        raw = await loop.run_in_executor(None, gemini_svc._generate, test_prompt)
        return {"ok": True, "raw_response": raw}
    except Exception as e:
        return {"ok": False, "error": str(e), "error_type": type(e).__name__}
