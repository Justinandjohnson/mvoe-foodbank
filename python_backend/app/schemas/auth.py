from __future__ import annotations

from pydantic import BaseModel, field_validator


class OtpSendRequest(BaseModel):
    phone: str

    @field_validator("phone")
    @classmethod
    def phone_must_be_e164(cls, v: str) -> str:
        if not v.startswith("+") or not v[1:].isdigit():
            raise ValueError("Phone must be E.164 format e.g. +15551234567")
        return v


class OtpVerifyRequest(BaseModel):
    phone: str
    code: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
