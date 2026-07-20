from __future__ import annotations

from cryptography.fernet import Fernet

from app.config import settings

_fernet = Fernet(settings.fernet_key.encode())


class SecretValue(str):
    """A string subclass whose repr never reveals its contents."""

    def __repr__(self) -> str:
        return "SecretValue(***)"

    def __str__(self) -> str:
        return "***"

    def reveal(self) -> str:
        """Return the actual secret value. Call only inside a request scope."""
        return super().__str__()


def encrypt_secret(plaintext: str) -> bytes:
    """Encrypt a plaintext string using the platform Fernet key."""
    return _fernet.encrypt(plaintext.encode())


def decrypt_secret(ciphertext: bytes) -> SecretValue:
    """Decrypt ciphertext and return a SecretValue (never logs plaintext)."""
    return SecretValue(_fernet.decrypt(ciphertext).decode())
