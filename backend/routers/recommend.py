import asyncio
from fastapi import APIRouter, Request
from pydantic import BaseModel
from backend.services import gemini as gemini_svc
from backend.services.macro_service import get_macro_snapshot
from backend.services.stock import get_stock_data
from backend.core.limiter import limiter

router = APIRouter()

# 추천 후보 풀 — 주요 섹터 대표 종목 20개
_CANDIDATES = [
    ("005930", "삼성전자",        "반도체/AI"),
    ("000660", "SK하이닉스",      "반도체/AI"),
    ("035420", "NAVER",           "플랫폼/IT"),
    ("035720", "카카오",          "플랫폼/IT"),
    ("017670", "SK텔레콤",        "플랫폼/IT"),
    ("005380", "현대차",          "자동차"),
    ("000270", "기아",            "자동차"),
    ("006400", "삼성SDI",         "배터리/소재"),
    ("051910", "LG화학",          "배터리/소재"),
    ("373220", "LG에너지솔루션",  "배터리/소재"),
    ("207940", "삼성바이오로직스","바이오"),
    ("068270", "셀트리온",        "바이오"),
    ("105560", "KB금융",          "금융"),
    ("055550", "신한지주",        "금융"),
    ("267260", "HD현대일렉트릭",  "에너지/인프라"),
    ("034020", "두산에너빌리티",  "에너지/인프라"),
    ("005490", "POSCO홀딩스",     "에너지/인프라"),
    ("066570", "LG전자",          "가전/소비재"),
    ("012330", "현대모비스",      "자동차"),
    ("030200", "KT",              "플랫폼/IT"),
]


class RecommendRequest(BaseModel):
    user_profile: dict


@router.post("/recommend")
@limiter.limit("5/minute")
async def recommend(request: Request, req: RecommendRequest):
    loop = asyncio.get_event_loop()

    # 매크로 + 후보 종목 재무 데이터 병렬 수집
    results = await asyncio.gather(
        loop.run_in_executor(None, get_macro_snapshot),
        *[loop.run_in_executor(None, get_stock_data, ticker)
          for ticker, _, _ in _CANDIDATES],
    )
    macro = results[0]
    stock_results = results[1:]

    # 가격 데이터가 있는 종목만 후보에 포함
    candidates = []
    for (ticker, name, sector), stock in zip(_CANDIDATES, stock_results):
        if stock.get("price") or stock.get("name"):
            candidates.append({
                "ticker": ticker,
                "name": name,
                "sector": sector,
                "price": stock.get("price"),
                "per": stock.get("per"),
                "pbr": stock.get("pbr"),
                "roe": stock.get("roe"),
            })

    result = await loop.run_in_executor(
        None, gemini_svc.recommend_stocks, req.user_profile, macro, candidates
    )
    return result
