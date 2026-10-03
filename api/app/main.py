"""THE CREW API: the judged portfolio endpoints and the crew endpoints.

Layers, top to bottom (docs/decisions/0001-layered-api.md):
  routes/       HTTP only: parse, call a service, map errors to status codes
  services/     business logic
  repository.py the only reader of the organizers' dataset
  models.py     request and response schemas
"""

from fastapi import FastAPI

from app.routes import crew, judged

app = FastAPI(title="THE CREW", version="0.1.0")
app.include_router(judged.router)
app.include_router(crew.router)
