from app.main import build_allowed_origins
from app.routers.tenants import next_key_version


def test_build_allowed_origins_uses_dev_defaults() -> None:
    origins = build_allowed_origins("development", "")

    assert "http://localhost:19006" in origins
    assert "http://localhost:3000" in origins
    assert "http://127.0.0.1:4173" in origins


def test_build_allowed_origins_uses_frontend_url_in_production() -> None:
    origins = build_allowed_origins("production", "https://mvoe-web.onrender.com")

    assert origins == ["https://mvoe-web.onrender.com"]


def test_next_key_version_increments_existing_value() -> None:
    assert next_key_version(None) == 1
    assert next_key_version(4) == 5
