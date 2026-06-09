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
    """사용 가능한 Gemini 모델 목록 + 각 모델 호출 테스트."""
    from google import genai as _genai
    key = settings.GEMINI_API_KEY
    if not key:
        return {"ok": False, "error": "GEMINI_API_KEY 없음"}

    results = {}

    # api_version별로 모델 목록 조회
    for ver in ["v1", "v1beta", "v1alpha"]:
        try:
            client = _genai.Client(
                api_key=key,
                http_options={"api_version": ver},
            )
            models = [m.name for m in client.models.list()]
            results[ver] = {"models": models[:10]}
        except Exception as e:
            results[ver] = {"error": str(e)[:200]}

    # 각 버전에서 간단한 생성 테스트
    for ver in ["v1", "v1beta"]:
        for model_name in ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]:
            try:
                client = _genai.Client(api_key=key, http_options={"api_version": ver})
                resp = client.models.generate_content(model=model_name, contents="hi")
                results[f"{ver}/{model_name}"] = {"ok": True, "response": resp.text[:50]}
                break
            except Exception as e:
                results[f"{ver}/{model_name}"] = {"ok": False, "error": str(e)[:150]}

    return results
