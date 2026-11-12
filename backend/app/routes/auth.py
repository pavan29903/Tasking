from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import User
from ..schemas import AuthOut, LoginIn, RegisterIn, UserOut
from ..security import create_token, current_user, hash_password, verify_password

router = APIRouter(prefix="/api", tags=["auth"])


def _auth(request: Request, user: User) -> AuthOut:
    s = request.app.state.settings
    return AuthOut(token=create_token(user.id, s.secret_key, s.token_hours), user=UserOut.model_validate(user))


@router.post("/auth/register", response_model=AuthOut, status_code=201)
def register(body: RegisterIn, request: Request, db: Session = Depends(get_db)) -> AuthOut:
    if db.scalar(select(User).where(User.email == body.email)):
        raise HTTPException(409, "An account with this email already exists. Sign in instead.")
    user = User(name=body.name, email=body.email, password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    return _auth(request, user)


@router.post("/auth/login", response_model=AuthOut)
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)) -> AuthOut:
    user = db.scalar(select(User).where(User.email == body.email))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Email or password is incorrect")
    return _auth(request, user)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)) -> User:
    return user
