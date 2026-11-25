"""Client für den n8n-Agent-Tools-Webhook (ADR-0005).

Vertrag (n8n muss genau so antworten):

Request  POST {N8N_TOOLS_WEBHOOK_URL}
         Header  X-StepSales-Secret: <secret>
                 Idempotency-Key:    <call_id>:<tool>:<seq>
         Body    {"tool": str, "call_id": str, "lead_id": str, "agent": str,
                  "seq": int, "args": {...}}
Response 200 {"ok": true,  "data": {...}}
         200 {"ok": false, "error": {"code": str, "message": str}}   # fachliche Ablehnung
         4xx/5xx                                                    # technischer Fehler

Fachliche Ablehnungen (z. B. Rabatt zu hoch) gibt der Agent dem Modell als Fakt zurück.
Technische Fehler werden nach einem Wiederholungsversuch als ToolsUnavailable gemeldet.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import aiohttp

logger = logging.getLogger("stepsales.n8n")


class ToolsUnavailable(RuntimeError):
    """Webhook nicht erreichbar oder technisch fehlerhaft."""


class ToolRejected(Exception):
    """n8n hat die Aktion fachlich abgelehnt (ok=false)."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


class ToolsClient:
    def __init__(
        self,
        *,
        url: str,
        secret: str,
        call_id: str,
        lead_id: str,
        agent: str,
        timeout_s: float = 8.0,
        retries: int = 1,
        session: aiohttp.ClientSession | None = None,
    ) -> None:
        self._url = url
        self._secret = secret
        self._call_id = call_id
        self._lead_id = lead_id
        self._agent = agent
        self._timeout = aiohttp.ClientTimeout(total=timeout_s)
        self._retries = retries
        self._session = session
        self._owns_session = session is None
        self._seq = 0

    async def aclose(self) -> None:
        if self._owns_session and self._session is not None:
            await self._session.close()
            self._session = None

    def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None:
            self._session = aiohttp.ClientSession(timeout=self._timeout)
        return self._session

    async def call(self, tool: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
        """Ruft ein Tool auf. Gibt ``data`` zurück oder wirft ToolRejected/ToolsUnavailable."""
        self._seq += 1
        seq = self._seq
        payload = {
            "tool": tool,
            "call_id": self._call_id,
            "lead_id": self._lead_id,
            "agent": self._agent,
            "seq": seq,
            "args": {k: v for k, v in (args or {}).items() if v is not None},
        }
        headers = {
            "X-StepSales-Secret": self._secret,
            # gleicher Schlüssel bei Wiederholung -> n8n kann Doppelausführung erkennen
            "Idempotency-Key": f"{self._call_id}:{tool}:{seq}",
        }
        last_error: Exception | None = None
        for attempt in range(self._retries + 1):
            try:
                async with self._get_session().post(
                    self._url, json=payload, headers=headers, timeout=self._timeout
                ) as resp:
                    if resp.status >= 500:
                        raise ToolsUnavailable(f"n8n antwortete {resp.status}")
                    if resp.status >= 400:
                        # Client-Fehler (Auth, Schema) wird durch Wiederholen nicht besser
                        text = (await resp.text())[:200]
                        raise ToolsUnavailable(f"n8n lehnte Anfrage ab ({resp.status}): {text}")
                    body = await resp.json(content_type=None)
            except ToolsUnavailable as exc:
                last_error = exc
                if "lehnte Anfrage ab" in str(exc):
                    break
            except (TimeoutError, aiohttp.ClientError, ValueError) as exc:
                last_error = exc
            else:
                if not isinstance(body, dict) or "ok" not in body:
                    last_error = ToolsUnavailable("n8n-Antwort hat kein 'ok'-Feld")
                    break
                if body["ok"] is True:
                    data = body.get("data")
                    return data if isinstance(data, dict) else {}
                err = body.get("error") or {}
                raise ToolRejected(
                    code=str(err.get("code") or "rejected"),
                    message=str(err.get("message") or "Aktion abgelehnt"),
                )
            if attempt < self._retries:
                await asyncio.sleep(0.3 * (attempt + 1))
        logger.warning(
            "tools webhook failed",
            extra={"tool": tool, "seq": seq, "error": repr(last_error)},
        )
        raise ToolsUnavailable(str(last_error) if last_error else "unbekannter Fehler")
