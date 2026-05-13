from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.storage.paths import ensure_base_dirs
from app.routes import papers, annotations, ai, users, guest

ensure_base_dirs()

app = FastAPI(title="NoviceReader Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_origin_regex=settings.frontend_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router)
app.include_router(users.auth_router)
app.include_router(guest.router)
app.include_router(papers.router)
app.include_router(annotations.router)
app.include_router(ai.router)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
