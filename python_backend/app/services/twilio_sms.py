from __future__ import annotations

import logging
from typing import Any

from twilio.rest import Client
from twilio.request_validator import RequestValidator

from app.config import settings

logger = logging.getLogger(__name__)

_client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
_validator = RequestValidator(settings.twilio_auth_token)


class TwilioService:
    """
    MVOE-operated Twilio wrapper.

    All pantry SMS goes through MVOE's single 10DLC brand. Each outbound
    message is prefixed with the pantry identity so recipients know who
    is contacting them ("Hope Pantry: Hi Carlos...").

    TCPA note: callers must verify opt_in_state == 'active' before calling
    send_sms. The service does not re-check — enforcement lives in the
    reminder pipeline and webhook handler to keep this layer thin.
    """

    def send_sms(self, to: str, body: str, pantry_name: str) -> dict[str, Any]:
        """
        Send an SMS message from MVOE's Twilio number.

        Args:
            to: E.164 recipient phone number.
            body: Message body (will be prefixed with pantry identity).
            pantry_name: Short pantry name shown as sender context.

        Returns:
            Dict with twilio_sid, status, and error_code (if any).
        """
        prefixed_body = f"{pantry_name}: {body}"
        message = _client.messages.create(
            to=to,
            from_=settings.twilio_phone_number,
            body=prefixed_body,
        )
        result = {
            "twilio_sid": message.sid,
            "status": message.status,
            "error_code": message.error_code,
        }
        logger.info(
            "SMS sent to=%s sid=%s status=%s pantry=%s",
            to,
            message.sid,
            message.status,
            pantry_name,
        )
        return result

    def validate_webhook(
        self,
        url: str,
        params: dict[str, str],
        signature: str,
    ) -> bool:
        """Verify a Twilio webhook request signature."""
        return _validator.validate(url, params, signature)


twilio_service = TwilioService()
