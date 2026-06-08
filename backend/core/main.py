from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routers import screen, macro, chat, search

app = FastAPI(title="Stock Analysis AI", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(screen.router, prefix="/api")
app.include_router(macro.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(search.router, prefix="/api")


@app.get("/")
async def root():
    return {"status": "ok", "message": "Stock Analysis AI Backend"}
