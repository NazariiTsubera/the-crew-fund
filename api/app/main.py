"""THE CREW API: the judged portfolio endpoints and the crew endpoints.

The judged endpoints (/health, /portfolio/holdings, /backtest, /screen, /asof) are scored live
by the organizers' checker; they must never depend on Gemini or any other outside service.
"""

from fastapi import FastAPI

app = FastAPI(title="THE CREW", version="0.1.0")


@app.get("/health")
def health() -> dict:
    return {"ok": True}
