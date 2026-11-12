"""Settings come from environment variables, optionally loaded from backend/.env."""
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import List

BASE_DIR = Path(__file__).resolve().parent.parent
DEV_SECRET = "dev-only-secret-change-me-before-you-deploy"


def load_env_file(path: Path) -> None:
    """Minimal .env reader: KEY=value lines; real environment variables win."""
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _list(value: str) -> List[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass
class Settings:
    database_url: str = f"sqlite:///{(BASE_DIR / 'tasking.db').as_posix()}"
    secret_key: str = DEV_SECRET
    app_env: str = "development"
    token_hours: int = 24 * 14
    app_url: str = "https://YOUR-TASKING-DOMAIN.example"
    cors_origins: List[str] = field(default_factory=lambda: [
        "http://localhost:5173", "http://127.0.0.1:5173", "capacitor://localhost", "http://localhost"])
    frontend_dist: Path = BASE_DIR.parent / "frontend" / "dist"
    max_upload_bytes: int = 5 * 1024 * 1024

    @classmethod
    def from_env(cls) -> "Settings":
        load_env_file(BASE_DIR / ".env")
        s = cls()
        env = {k: v for k, v in os.environ.items() if v.strip()}  # "KEY=" (blank) means "use the default"
        s.database_url = env.get("DATABASE_URL", s.database_url)
        s.secret_key = env.get("SECRET_KEY", s.secret_key)
        s.app_env = env.get("APP_ENV", s.app_env)
        s.token_hours = int(env.get("TOKEN_HOURS", s.token_hours))
        s.app_url = env.get("APP_URL", s.app_url)
        if "CORS_ORIGINS" in env:
            s.cors_origins = _list(env["CORS_ORIGINS"])
        if "FRONTEND_DIST" in env:
            s.frontend_dist = Path(env["FRONTEND_DIST"])
        s.validate()
        return s

    def validate(self) -> None:
        if self.app_env == "production" and (self.secret_key == DEV_SECRET or len(self.secret_key) < 32):
            raise RuntimeError("Set SECRET_KEY to a random value of 32+ characters before running with "
                               "APP_ENV=production (python -c \"import secrets; print(secrets.token_urlsafe(48))\")")
