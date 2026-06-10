from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from jose import JWTError
from backend.services.user_db import create_user, get_user_by_email, get_user_by_id
from backend.core.security import hash_password, verify_password, create_access_token, decode_token

router = APIRouter(prefix="/api/auth", tags=["auth"])
_bearer = HTTPBearer(auto_error=False)


class RegisterRequest(BaseModel):
    email: str
    name: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/register")
def register(req: RegisterRequest):
    if not req.email or "@" not in req.email:
        raise HTTPException(400, "올바른 이메일 주소를 입력하세요.")
    if len(req.password) < 6:
        raise HTTPException(400, "비밀번호는 6자 이상이어야 합니다.")
    if not req.name.strip():
        raise HTTPException(400, "이름을 입력하세요.")
    user = create_user(req.email.lower().strip(), req.name.strip(), hash_password(req.password))
    if user is None:
        raise HTTPException(400, "이미 사용 중인 이메일입니다.")
    token = create_access_token(user.id, user.email)
    return {"access_token": token, "name": user.name, "email": user.email}


@router.post("/login")
def login(req: LoginRequest):
    user = get_user_by_email(req.email.lower().strip())
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(401, "이메일 또는 비밀번호가 올바르지 않습니다.")
    token = create_access_token(user.id, user.email)
    return {"access_token": token, "name": user.name, "email": user.email}


@router.get("/me")
def me(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer)):
    if not credentials:
        raise HTTPException(401, "인증이 필요합니다.")
    try:
        payload = decode_token(credentials.credentials)
        user = get_user_by_id(int(payload["sub"]))
        if not user:
            raise HTTPException(401, "사용자를 찾을 수 없습니다.")
        return {"id": user.id, "email": user.email, "name": user.name}
    except JWTError:
        raise HTTPException(401, "유효하지 않은 토큰입니다.")
