"""THE CREW API: the judged portfolio endpoints and the crew endpoints.

Layers, top to bottom (docs/decisions/0001-layered-api.md):
  routes/       HTTP only: parse, call a service, map errors to status codes
  services/     business logic
  repository.py the only reader of the organizers' dataset
  models.py     request and response schemas
"""

import os
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import repository
from app.routes import crew, judged


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Fill the day-file mirror in the background; requests never wait on it.
    threading.Thread(target=repository.warm_mirror, daemon=True).start()
    yield


app = FastAPI(title="THE CREW", version="0.1.0", lifespan=lifespan)
# The War Room is served from its own origin; the judged checker sends no Origin header.
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get(
        "CORS_ORIGINS", "https://crewfund.vodka,http://localhost:3000"
    ).split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
app.include_router(judged.router)
app.include_router(crew.router)
