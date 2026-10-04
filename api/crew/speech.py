"""Server-side ElevenLabs speech generation for recruiter replies."""

from __future__ import annotations

import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

# ElevenLabs' premade "Rachel" voice, available on every account.
DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM"


class SpeechError(RuntimeError):
    """Speech generation could not be completed."""


def synthesize(text: str) -> bytes:
    # The VPS .env names the key ELEVEN_LABS_KEY; accept both spellings.
    api_key = os.environ.get("ELEVENLABS_API_KEY") or os.environ.get("ELEVEN_LABS_KEY")
    voice_id = os.environ.get("ELEVENLABS_VOICE_ID") or DEFAULT_VOICE
    if not api_key:
        raise SpeechError("ElevenLabs is not configured; set ELEVENLABS_API_KEY")

    request = Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128",
        data=json.dumps({"text": text, "model_id": "eleven_multilingual_v2"}).encode(),
        headers={"xi-api-key": api_key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=30) as response:
            audio = response.read()
    except (HTTPError, URLError, TimeoutError) as exc:
        raise SpeechError("ElevenLabs could not generate audio right now") from exc
    if not audio:
        raise SpeechError("ElevenLabs returned empty audio")
    return audio
