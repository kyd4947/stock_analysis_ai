from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.core.auth import create_token, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    password: str


class LoginResponse(BaseModel):
    token: str
    expires_in: int


@router.post("/login")
async def login(req: LoginRequest):
    if not verify_password(req.password):
        raise HTTPException(status_code=401, detail="Invalid password")
    return LoginResponse(token=create_token(), expires_in=86400 * 7)
