from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, model_validator


class EventCreate(BaseModel):
    title: str
    starts_at: datetime
    ends_at: datetime
    volunteers_needed: int = 0
    location: str | None = None
    recurrence_rule: str | None = None

    @model_validator(mode="after")
    def ends_after_starts(self) -> EventCreate:
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        return self


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    title: str
    starts_at: datetime
    ends_at: datetime
    volunteers_needed: int
    location: str | None
    recurrence_rule: str | None
    ai_ab_arm_default: str


class SignupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    volunteer_id: uuid.UUID
    status: str
    ab_arm: str
    check_in_at: datetime | None


class RosterResponse(BaseModel):
    event_id: uuid.UUID
    signups: list[SignupOut]
    confirmed: int
    pending: int
    declined: int


class ReminderDraft(BaseModel):
    volunteer_id: uuid.UUID
    volunteer_name: str
    phone_e164: str
    draft_body: str
    ab_arm: str
