"""THE CREW API: the judged portfolio endpoints and the crew endpoints.

Layers, top to bottom (docs/decisions/0001-layered-api.md):
  routes/       HTTP only: parse, call a service, map errors to status codes
  services/     business logic
  repository.py the only reader of the organizers' dataset
  models.py     request and response schemas
"""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import crew, judged

app = FastAPI(title="THE CREW", version="0.1.0")
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
