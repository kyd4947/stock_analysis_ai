from fastapi import APIRouter, Query
from backend.services.dart import search_stocks

router = APIRouter()


@router.get("/search")
def search_endpoint(q: str = Query(..., min_length=1), limit: int = Query(10, ge=1, le=30)):
    results = search_stocks(q, limit)
    return {"results": results}
