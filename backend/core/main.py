import asyncio
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.core.limiter import limiter, _rate_limit_exceeded_handler, RateLimitExceeded
from backend.routers import screen, macro, chat, search, market_insight, prices, recommend, entry_exit

# ALLOWED_ORIGINS 환경변수: 쉼표로 구분된 허용 도메인 목록
# 예: https://your-app.vercel.app,https://your-custom-domain.com
_raw = os.getenv("ALLOWED_ORIGINS", "")
ALLOWED_ORIGINS = [o.strip() for o in _raw.split(",") if o.strip()]
if not ALLOWED_ORIGINS:
    ALLOWED_ORIGINS = ["*"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    loop = asyncio.get_event_loop()
    try:
        await asyncio.wait_for(
            loop.run_in_executor(None, _warmup_dart),
            timeout=65,
        )
    except asyncio.TimeoutError:
        pass
    yield


def _warmup_dart():
    try:
        from backend.services.dart import _corp_info_map
        _corp_info_map()
    except Exception:
        pass


app = FastAPI(title="Stock Analysis AI", version="1.0.0", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Accept", "Authorization"],
)

app.include_router(screen.router, prefix="/api")
app.include_router(macro.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(market_insight.router, prefix="/api")
app.include_router(prices.router, prefix="/api")
app.include_router(recommend.router, prefix="/api")
app.include_router(entry_exit.router, prefix="/api")

@app.get("/")
async def root():
    return {"status": "ok", "message": "Stock Analysis AI Backend"}
