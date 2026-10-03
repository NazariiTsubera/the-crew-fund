from app.redact import redact

URL = "https://pop-os.example/data/raw/massive/reference_tickers.parquet?key=sv_abc123DEF"


def test_the_token_in_a_url_is_masked():
    assert redact(f"Parquet SCAN [{URL}]") == (
        "Parquet SCAN [https://pop-os.example/data/raw/massive/reference_tickers.parquet?key=***]"
    )


def test_text_without_a_token_is_unchanged():
    assert redact("HTTP Error 401: Unauthorized") == "HTTP Error 401: Unauthorized"


def test_every_occurrence_is_masked():
    assert "sv_" not in redact(f"{URL} and {URL}&x=1")
