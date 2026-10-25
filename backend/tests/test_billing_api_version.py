"""Verify the real Stripe SDK request boundary without contacting Stripe."""

import json
from urllib.parse import urlsplit

import pytest
import stripe

import app.services.billing_service as billing
from app.config import get_settings


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "operation,arguments,method,path,response",
    [
        (
            "cancel_subscription",
            {"subscription_id": "sub_test"},
            "delete",
            "/v1/subscriptions/sub_test",
            {"id": "sub_test", "object": "subscription", "status": "canceled"},
        ),
        (
            "fetch_subscription",
            {"subscription_id": "sub_test"},
            "get",
            "/v1/subscriptions/sub_test",
            {"id": "sub_test", "object": "subscription", "status": "active"},
        ),
        (
            "create_checkout_session",
            {
                "client_reference_id": "user_test",
                "price_id": "price_test",
                "customer_id": None,
                "success_url": "https://example.com/success",
                "cancel_url": "https://example.com/cancel",
            },
            "post",
            "/v1/checkout/sessions",
            {"id": "cs_test", "object": "checkout.session", "url": "https://checkout.stripe.com/c/test"},
        ),
        (
            "create_portal_session",
            {"customer_id": "cus_test", "return_url": "https://example.com/return"},
            "post",
            "/v1/billing_portal/sessions",
            {"id": "bps_test", "object": "billing_portal.session", "url": "https://billing.stripe.com/p/test"},
        ),
        (
            "fetch_checkout_session",
            {"session_id": "cs_test"},
            "get",
            "/v1/checkout/sessions/cs_test",
            {"id": "cs_test", "object": "checkout.session", "payment_status": "paid"},
        ),
    ],
)
async def test_sdk_requests_keep_the_existing_stripe_api_contract(
    monkeypatch, operation, arguments, method, path, response
):
    requests = []

    class CaptureHTTPClient(stripe.HTTPClient):
        name = "norby-test"

        async def request_async(self, request_method, url, headers, post_data=None):
            requests.append((request_method, url, dict(headers), post_data))
            return json.dumps(response).encode(), 200, {"request-id": "req_test"}

    monkeypatch.setattr(stripe, "default_http_client", CaptureHTTPClient())
    monkeypatch.setattr(get_settings(), "stripe_secret_key", "sk_test_transport_only")

    await getattr(billing, operation)(**arguments)

    assert len(requests) == 1
    actual_method, url, headers, body = requests[0]
    assert actual_method == method
    assert urlsplit(url).path == path
    assert headers["Stripe-Version"] == "2026-08-26.dahlia"
    assert "stripe_version" not in url
    assert "stripe_version" not in (body or "")
