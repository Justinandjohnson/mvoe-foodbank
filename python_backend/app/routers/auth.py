from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, HTTPException
from twilio.base.exceptions import TwilioRestException
from twilio.rest import Client

from app.config import settings
from app.schemas.auth import OtpSendRequest, OtpVerifyRequest, TokenResponse

router = APIRouter(prefix="/auth", tags=["auth"])

_twilio = Client(settings.twilio_account_sid, settings.twilio_auth_token)


def _make_token(tenant_id: str, user_id: str) -> str:
    expire = datetime.now(tz=timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {
        "sub": user_id,
        "tenant_id": tenant_id,
        "exp": expire,
        "iat": datetime.now(tz=timezone.utc),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


@router.post("/otp/send")
async def send_otp(body: OtpSendRequest) -> dict[str, str]:
    """
    Send a 6-digit OTP to the director's phone via Twilio Verify.
    The service_sid below should match the Twilio Verify Service created in the console.
    """
    verify_service_sid = settings.twilio_verify_service_sid or None
    if not verify_service_sid:
        raise HTTPException(
            status_code=503,
            detail="Twilio Verify service not configured. Set TWILIO_VERIFY_SERVICE_SID.",
        )

    try:
        verification = _twilio.verify.v2.services(verify_service_sid).verifications.create(
            to=body.phone,
            channel="sms",
        )
    except TwilioRestException as e:
        raise HTTPException(status_code=400, detail=str(e.msg)) from e

    if verification.status != "pending":
        raise HTTPException(status_code=502, detail=f"Twilio returned status: {verification.status}")

    return {"message": "Verification code sent"}


@router.post("/otp/verify", response_model=TokenResponse)
async def verify_otp(body: OtpVerifyRequest) -> TokenResponse:
    """
    Verify the OTP. On success, return a JWT that includes the tenant_id.
    For new phones, a placeholder tenant_id is issued; the onboarding flow
    calls POST /tenants/onboard to provision the real tenant.
    """
    verify_service_sid = settings.twilio_verify_service_sid or None
    if not verify_service_sid:
        raise HTTPException(status_code=503, detail="Twilio Verify service not configured.")

    try:
        check = _twilio.verify.v2.services(verify_service_sid).verification_checks.create(
            to=body.phone,
            code=body.code,
        )
    except TwilioRestException as e:
        raise HTTPException(status_code=400, detail=str(e.msg)) from e

    if check.status != "approved":
        raise HTTPException(status_code=401, detail="Invalid or expired verification code")

    # Use phone as stable user ID before a full tenant row exists
    user_id = body.phone
    tenant_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"tenant:{body.phone}"))
    token = _make_token(tenant_id=tenant_id, user_id=user_id)
    return TokenResponse(access_token=token)
