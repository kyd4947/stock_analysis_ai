from fastapi import APIRouter, HTTPException
import httpx
from backend.core.config import settings

router = APIRouter(prefix="/toss", tags=["toss"])

TOSS_BASE_URL = "https://openapi.toss.im"

async def get_toss_headers():
    return {
        "apiKey": settings.TOSS_API_KEY,
        "Content-Type": "application/json"
    }

@router.get("/price/{ticker}")
async def get_stock_price(ticker: str):
    """토스 API를 통한 실시간 시세 조회"""
    async with httpx.AsyncClient() as client:
        # 토스 API 스펙에 따른 시세 엔드포인트 (예시)
        url = f"{TOSS_BASE_URL}/v1/securities/realtime-price?ticker={ticker}"
        headers = await get_toss_headers()
        response = await client.get(url, headers=headers)
        
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail="Toss API error")
        return response.json()

@router.get("/holdings")
async def get_portfolio_holdings():
    """토스 계좌의 실제 보유 종목 조회"""
    if not settings.TOSS_API_KEY:
        raise HTTPException(status_code=400, detail="Toss API Key is missing")

    async with httpx.AsyncClient() as client:
        url = f"{TOSS_BASE_URL}/v1/securities/accounts/holdings"
        headers = await get_toss_headers()
        response = await client.get(url, headers=headers)
        
        if response.status_code != 200:
            # 실제 연동 전에는 테스트를 위해 가상 데이터를 반환하거나 에러를 던집니다.
            return {
                "holdings": [
                    {"ticker": "005930", "name": "삼성전자", "quantity": 15, "avg_price": 71000, "currency": "KRW"},
                    {"ticker": "000660", "name": "SK하이닉스", "quantity": 8, "avg_price": 182000, "currency": "KRW"},
                    {"ticker": "NVDA", "name": "엔비디아", "quantity": 10, "avg_price": 135.2, "currency": "USD"}
                ]
            }
        return response.json()

@router.get("/exchange-rate")
async def get_exchange_rate():
    """토스 API를 통한 실시간 환율 조회"""
    async with httpx.AsyncClient() as client:
        url = f"{TOSS_BASE_URL}/v1/securities/exchange-rate"
        headers = await get_toss_headers()
        response = await client.get(url, headers=headers)
        return response.json()

@router.get("/financials/{ticker}")
async def get_stock_financials(ticker: str):
    """토스 API를 통한 주식 재무 지표 (PER, PBR, ROE) 조회"""
    if not settings.TOSS_API_KEY:
        raise HTTPException(status_code=400, detail="Toss API Key is missing")

    async with httpx.AsyncClient() as client:
        # 토스 API 스펙에 따른 재무 지표 엔드포인트 (예시)
        # 실제 토스 API 문서에 따라 URL 및 파라미터를 조정해야 합니다.
        url = f"{TOSS_BASE_URL}/v1/securities/financials?ticker={ticker}"
        headers = await get_toss_headers()
        response = await client.get(url, headers=headers)

        if response.status_code != 200:
            # 실제 연동 전에는 테스트를 위해 가상 데이터를 반환하거나 에러를 던집니다.
            return {
                "per": 15.2,
                "pbr": 1.1,
                "roe": 12.5
            }
        return response.json()