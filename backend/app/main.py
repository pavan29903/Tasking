"""FastAPI app. Run with: uv run uvicorn app.main:create_app --factory --reload"""
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import sessionmaker

from .config import Settings
from .db import Base, make_engine
from .routes import auth, meetings, tasks, teams


def create_app(settings: Optional[Settings] = None) -> FastAPI:
    settings = settings or Settings.from_env()
    engine = make_engine(settings.database_url)
    Base.metadata.create_all(engine)  # creates missing tables; see README for schema changes

    app = FastAPI(title="Tasking API", version="0.1.0")
    app.state.settings = settings
    app.state.sessionmaker = sessionmaker(engine, expire_on_commit=False)
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=False,
                       allow_methods=["*"], allow_headers=["*"], expose_headers=["Content-Disposition"])
    for module in (auth, teams, tasks, meetings):
        app.include_router(module.router)

    @app.get("/api/health", tags=["health"])
    def health() -> dict:
        return {"ok": True}

    if settings.frontend_dist.is_dir():  # one server for the built web app and the API
        app.mount("/", StaticFiles(directory=settings.frontend_dist, html=True), name="web")
    return app
