"""FastAPI app. Run with: uv run uvicorn app.main:create_app --factory --reload"""
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import sessionmaker

from .config import Settings
from .db import Base, add_missing_columns, make_engine
from .routes import auth, calendar, meetings, tasks, teams, today


def create_app(settings: Optional[Settings] = None) -> FastAPI:
    settings = settings or Settings.from_env()
    engine = make_engine(settings.database_url)
    Base.metadata.create_all(engine)  # creates missing tables
    add_missing_columns(engine)  # and new optional columns on existing ones; anything bigger needs a migration

    app = FastAPI(title="Tasking API", version="0.1.0")
    app.state.settings = settings
    app.state.sessionmaker = sessionmaker(engine, expire_on_commit=False)
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=False,
                       allow_methods=["*"], allow_headers=["*"], expose_headers=["Content-Disposition"])
    for module in (auth, teams, tasks, meetings, calendar, today):
        app.include_router(module.router)

    @app.get("/api/health", tags=["health"])
    def health() -> dict:
        return {"ok": True}

    if settings.frontend_dist.is_dir():  # one server for the built web app and the API
        app.mount("/", StaticFiles(directory=settings.frontend_dist, html=True), name="web")
    return app
