from __future__ import annotations

import asyncio
from typing import Any

import pytest
from aiohttp import web

from stepsales_agent.n8n_client import ToolRejected, ToolsClient, ToolsUnavailable


class FakeN8n:
    def __init__(self) -> None:
        self.requests: list[dict[str, Any]] = []
        self.responses: list[tuple[int, Any] | str] = []

    async def handle(self, request: web.Request) -> web.StreamResponse:
        body = await request.json()
        self.requests.append({"headers": dict(request.headers), "body": body})
        item = self.responses.pop(0) if self.responses else (200, {"ok": True, "data": {}})
        if item == "sleep":
            await asyncio.sleep(5)
            return web.json_response({"ok": True, "data": {}})
        status, payload = item  # type: ignore[misc]
        if isinstance(payload, str):
            return web.Response(status=status, text=payload)
        return web.json_response(payload, status=status)


@pytest.fixture
async def n8n():
    fake = FakeN8n()
    app = web.Application()
    app.router.add_post("/hook", fake.handle)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = site._server.sockets[0].getsockname()[1]  # type: ignore[union-attr]
    fake.url = f"http://127.0.0.1:{port}/hook"  # type: ignore[attr-defined]
    yield fake
    await runner.cleanup()


def _client(fake: FakeN8n, timeout: float = 2.0) -> ToolsClient:
    return ToolsClient(
        url=fake.url,  # type: ignore[attr-defined]
        secret="s3cret",
        call_id="call-1",
        lead_id="lead-1",
        agent="stepsales-gemini",
        timeout_s=timeout,
    )


async def test_success_returns_data_and_sends_contract(n8n: FakeN8n) -> None:
    n8n.responses = [(200, {"ok": True, "data": {"offer_id": "OFF-1", "final_price": 1341}})]
    client = _client(n8n)
    data = await client.call("create_offer", {"package_id": "MULTI_M", "discount_reason": None})
    await client.aclose()

    assert data == {"offer_id": "OFF-1", "final_price": 1341}
    req = n8n.requests[0]
    assert req["headers"]["X-StepSales-Secret"] == "s3cret"
    assert req["headers"]["Idempotency-Key"] == "call-1:create_offer:1"
    assert req["body"] == {
        "tool": "create_offer",
        "call_id": "call-1",
        "lead_id": "lead-1",
        "agent": "stepsales-gemini",
        "seq": 1,
        "args": {"package_id": "MULTI_M"},  # None wird nicht gesendet
    }


async def test_business_rejection_raises_tool_rejected(n8n: FakeN8n) -> None:
    n8n.responses = [
        (200, {"ok": False, "error": {"code": "discount_too_high", "message": "max 10 %"}})
    ]
    client = _client(n8n)
    with pytest.raises(ToolRejected) as exc:
        await client.call("create_offer", {"package_id": "MULTI_M", "discount_percent": 20})
    await client.aclose()
    assert exc.value.code == "discount_too_high"
    assert len(n8n.requests) == 1  # fachliche Ablehnung wird nicht wiederholt


async def test_server_error_retried_with_same_idempotency_key(n8n: FakeN8n) -> None:
    n8n.responses = [(502, "bad gateway"), (200, {"ok": True, "data": {"x": 1}})]
    client = _client(n8n)
    data = await client.call("qualify_lead", {"urgency": "high"})
    await client.aclose()
    assert data == {"x": 1}
    keys = [r["headers"]["Idempotency-Key"] for r in n8n.requests]
    assert keys == ["call-1:qualify_lead:1", "call-1:qualify_lead:1"]


async def test_persistent_server_error_raises_unavailable(n8n: FakeN8n) -> None:
    n8n.responses = [(500, "x"), (500, "x")]
    client = _client(n8n)
    with pytest.raises(ToolsUnavailable):
        await client.call("get_packages")
    await client.aclose()
    assert len(n8n.requests) == 2


async def test_auth_error_not_retried(n8n: FakeN8n) -> None:
    n8n.responses = [(401, "unauthorized")]
    client = _client(n8n)
    with pytest.raises(ToolsUnavailable):
        await client.call("get_packages")
    await client.aclose()
    assert len(n8n.requests) == 1


async def test_timeout_raises_unavailable(n8n: FakeN8n) -> None:
    n8n.responses = ["sleep", "sleep"]
    client = _client(n8n, timeout=0.3)
    with pytest.raises(ToolsUnavailable):
        await client.call("get_packages")
    await client.aclose()


async def test_malformed_response_is_not_success(n8n: FakeN8n) -> None:
    n8n.responses = [(200, {"data": {"offer_id": "OFF-1"}})]
    client = _client(n8n)
    with pytest.raises(ToolsUnavailable):
        await client.call("create_offer", {"package_id": "MULTI_M"})
    await client.aclose()


async def test_ok_true_without_data_object_returns_empty_dict(n8n: FakeN8n) -> None:
    n8n.responses = [(200, {"ok": True})]
    client = _client(n8n)
    data = await client.call("get_packages")
    await client.aclose()
    assert data == {}


async def test_ok_false_without_error_object_uses_defaults(n8n: FakeN8n) -> None:
    n8n.responses = [(200, {"ok": False})]
    client = _client(n8n)
    with pytest.raises(ToolRejected) as exc:
        await client.call("create_offer", {"package_id": "MULTI_M"})
    await client.aclose()
    assert exc.value.code == "rejected"
    assert "abgelehnt" in exc.value.message


async def test_sequence_increments_per_call(n8n: FakeN8n) -> None:
    client = _client(n8n)
    await client.call("get_packages")
    await client.call("get_packages")
    await client.aclose()
    assert [r["body"]["seq"] for r in n8n.requests] == [1, 2]
