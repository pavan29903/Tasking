"""Tasking API package."""
import os

# Windows Smart App Control blocks SQLAlchemy's optional compiled speed-ups on some PCs.
# The pure-Python path behaves the same and is fast enough for a team task list.
os.environ.setdefault("DISABLE_SQLALCHEMY_CEXT_RUNTIME", "1")
