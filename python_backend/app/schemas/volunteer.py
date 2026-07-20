from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _normalize_email(value: str | None) -> str | None:
    cleaned = (value or "").strip().lower()
    return cleaned or None


def _normalize_tags(values: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for tag in values:
        cleaned = str(tag or "").strip().lower()
        if not cleaned or cleaned in seen:
            continue
        normalized.append(cleaned)
        seen.add(cleaned)
    return normalized


class VolunteerCreate(BaseModel):
    phone_e164: str
    name: str
    email: str | None = None
    tags: list[str] = Field(default_factory=list)

    @field_validator("phone_e164")
    @classmethod
    def phone_must_be_e164(cls, v: str) -> str:
        if not v.startswith("+") or not v[1:].isdigit():
            raise ValueError("Phone must be E.164 format")
        return v

    @field_validator("name")
    @classmethod
    def name_required(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Name is required")
        return cleaned

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str | None) -> str | None:
        return _normalize_email(value)

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, value: list[str]) -> list[str]:
        return _normalize_tags(value)


class VolunteerUpdate(BaseModel):
    phone_e164: str | None = None
    name: str | None = None
    email: str | None = None
    tags: list[str] | None = None
    opt_in_state: Literal["pending", "active", "stopped"] | None = None

    @field_validator("phone_e164")
    @classmethod
    def phone_must_be_e164(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if not v.startswith("+") or not v[1:].isdigit():
            raise ValueError("Phone must be E.164 format")
        return v

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Name cannot be empty")
        return cleaned

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str | None) -> str | None:
        return _normalize_email(value)

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        return _normalize_tags(value)


class VolunteerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    phone_e164: str
    name: str
    email: str | None
    tags: list[str]
    opt_in_state: str
    trust_score: int
    opt_in_at: datetime | None
    first_shift_at: datetime | None
    last_shift_at: datetime | None
    created_at: datetime


class VolunteerListResponse(BaseModel):
    volunteers: list[VolunteerOut]
    total: int


class VolunteerTagCount(BaseModel):
    tag: str
    count: int


class VolunteerTagListResponse(BaseModel):
    tags: list[VolunteerTagCount]
    total_tags: int


class VolunteerTagAssignRequest(BaseModel):
    volunteer_ids: list[uuid.UUID]
    tags: list[str] = Field(default_factory=list)
    mode: Literal["add", "remove", "replace"] = "add"

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, value: list[str]) -> list[str]:
        return _normalize_tags(value)


class VolunteerTagAssignResponse(BaseModel):
    updated: int
    volunteers: list[VolunteerOut]


class VolunteerTagBroadcastRequest(BaseModel):
    message: str
    tags: list[str] = Field(default_factory=list)
    match_mode: Literal["any", "all"] = "any"

    @field_validator("message")
    @classmethod
    def normalize_message(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Message cannot be empty")
        return cleaned

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, value: list[str]) -> list[str]:
        return _normalize_tags(value)
