import re
from fastapi import APIRouter, Query
from backend.services.dart import search_stocks
from backend.services.us_stock import search_us_stocks

router = APIRouter()

_US_TICKER_RE = re.compile(r"^[A-Za-z]{1,5}$")


@router.get("/search")
def search_endpoint(q: str = Query(..., min_length=1), limit: int = Query(10, ge=1, le=30)):
    q = q.strip()
    # 알파벳으로만 구성된 1~5자 → 미국 주식 검색 우선
    if _US_TICKER_RE.match(q):
        us = search_us_stocks(q.upper(), limit)
        kr = search_stocks(q, limit)
        seen: set[str] = set()
        merged = []
        for r in us + kr:
            if r["ticker"] not in seen:
                seen.add(r["ticker"])
                merged.append(r)
        return {"results": merged[:limit]}
    return {"results": search_stocks(q, limit)}
