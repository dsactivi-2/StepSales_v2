"""Entrypoint: ein Outbound-Anruf pro Job.

Ablauf (nach docs.livekit.io/telephony/making-calls/outbound-calls/ und dem SDK-Beispiel
examples/telephony/amd.py, livekit/agents@e95d482):
n8n-Dispatch mit Metadaten -> Metadaten prüfen -> Session starten -> AMD aktiv ->
SIP-Teilnehmer anrufen (wait_until_answered) -> AMD-Ergebnis -> Gespräch -> Ende.

Der Code besitzt Zustand und Effekte (Ergebnis-Fallback, Auflegen, Zeitlimit);
das Modell führt nur das Gespräch.
"""

from __future__ import annotations

import asyncio
import logging

from dotenv import load_dotenv
from livekit import api
from livekit.agents import (
    AMD,
    AgentServer,
    AgentSession,
    AMDCategory,
    JobContext,
    cli,
    room_io,
)

from .call_context import CallContext, MetadataError, parse_metadata
from .config import Settings, load_settings
from .models import build_llm, build_vad
from .n8n_client import ToolRejected, ToolsClient, ToolsUnavailable
from .prompts import backend_instructions, combined_instructions, voice_instructions
from .sales_agent import CallState, SalesAgent
from .telemetry import setup_langfuse
from .web_test import FakeToolsClient, default_metadata

logger = logging.getLogger("stepsales")

CALLEE_IDENTITY = "callee"
WRAP_UP_GRACE_S = 90.0
WEB_TEST_JOIN_TIMEOUT_S = 120.0


def _sip_outcome(exc: api.SipCallError) -> str:
    code = getattr(exc, "sip_status_code", None)
    if code in (486, 603):
        return "busy_or_rejected"
    if code in (408, 480):
        return "no_answer"
    return "failed"


def _technical_from_sip(exc: api.SipCallError) -> tuple[str, str]:
    """Besetzt/abgelehnt ist kein technischer Fehler: als no_answer speichern (neuer Versuch)."""
    sip_outcome = _sip_outcome(exc)
    outcome = "failed" if sip_outcome == "failed" else "no_answer"
    return outcome, f"SIP {exc.sip_status_code} {exc.sip_status} ({sip_outcome})"


async def _report_technical_outcome(
    client: ToolsClient | FakeToolsClient, state: CallState, outcome: str, reason: str
) -> None:
    """Fallback, wenn das Modell kein Ergebnis gespeichert hat. Code-seitig garantiert."""
    if state.outcome_logged:
        return
    try:
        await client.call(
            "log_call_outcome",
            {
                "outcome": outcome,
                "summary": reason,
                "technical": True,
                "objection_type": "none",
                "confidence": "low",
            },
        )
        state.outcome_logged = True
        state.outcome = outcome
    except (ToolRejected, ToolsUnavailable):
        # n8n-Ergebnisabgleich findet Anrufe ohne Ergebnis und setzt sie auf Prüfung
        logger.exception("could not report technical outcome")


async def entrypoint(ctx: JobContext) -> None:
    """Modulebene statt Closure: der Job-Prozess (forkserver) muss den Entrypoint per
    Name importieren können; eine lokale Funktion ist nicht picklebar (Startfehler in
    LiveKit Cloud). Settings kommen im Job-Prozess erneut aus der Umgebung."""
    await _run_call(ctx, load_settings())


def build_server(settings: Settings) -> AgentServer:
    server = AgentServer()
    server.rtc_session(agent_name=settings.agent_name)(entrypoint)
    return server


async def _run_call(ctx: JobContext, settings: Settings) -> None:
    ctx.log_context_fields = {"room": ctx.room.name, "agent": settings.agent_name}

    raw_metadata = ctx.job.metadata
    if settings.web_test and not raw_metadata:
        raw_metadata = default_metadata(ctx.room.name)
    try:
        call: CallContext = parse_metadata(raw_metadata, room_name=ctx.room.name)
    except MetadataError as exc:
        # ohne gültigen Auftrag wird nie gewählt
        logger.error("invalid dispatch metadata: %s", exc)
        ctx.shutdown("invalid metadata")
        return
    if (settings.test_calls_only or settings.web_test) and not call.test:
        logger.error("Nur Testanrufe erlaubt, Auftrag ist kein Testanruf – kein Anruf")
        ctx.shutdown("test calls only")
        return
    if settings.web_test and settings.sip_outbound_trunk_id:
        # load_settings verhindert das schon; zweite Sicherung, falls Settings anders entstehen
        logger.error("Web-Test mit SIP-Trunk – abgebrochen")
        ctx.shutdown("web test with trunk")
        return
    if not settings.web_test and not settings.sip_outbound_trunk_id:
        logger.error("LIVEKIT_SIP_OUTBOUND_TRUNK_ID fehlt – kein Anruf")
        ctx.shutdown("missing trunk")
        return

    tracer = None
    if settings.langfuse_enabled:
        tracer = setup_langfuse(
            {
                "langfuse.session.id": ctx.room.name,
                "stepsales.agent": settings.agent_name,
                "stepsales.model": settings.model,
                "stepsales.lead_id": call.lead_id,
                "stepsales.call_type": call.call_type,
                "stepsales.test": call.test,
                "stepsales.web_test": settings.web_test,
            }
        )

    state = CallState()
    client: ToolsClient | FakeToolsClient
    if settings.web_test:
        client = FakeToolsClient(call_id=call.call_id, timezone=settings.timezone)
    else:
        client = ToolsClient(
            url=settings.tools_webhook_url,
            secret=settings.tools_webhook_secret,
            call_id=call.call_id,
            lead_id=call.lead_id,
            agent=settings.agent_name,
            timeout_s=settings.tools_timeout_s,
        )
    technical = {"outcome": "failed", "reason": "Gespräch ohne gespeichertes Ergebnis beendet"}
    watchdog: asyncio.Task[None] | None = None

    async def on_shutdown() -> None:
        if watchdog is not None:
            watchdog.cancel()
        await _report_technical_outcome(client, state, technical["outcome"], technical["reason"])
        await client.aclose()
        if tracer is not None:
            tracer.force_flush()
        # jede Exit-Route legt auf (auch Mailbox/Abbruch)
        try:
            await ctx.delete_room()
        except Exception:  # noqa: BLE001 - Raum kann schon weg sein
            logger.debug("delete_room failed", exc_info=True)

    ctx.add_shutdown_callback(on_shutdown)

    if settings.is_gptlive:
        instructions = voice_instructions(call, settings)
    else:
        instructions = combined_instructions(call, settings)

    session_kwargs = {"llm": build_llm(settings, backend_instructions(settings)), "userdata": state}
    vad = build_vad(settings)
    if vad is not None:
        session_kwargs["vad"] = vad
    session: AgentSession = AgentSession(**session_kwargs)

    @session.on("close")
    def _on_close(_ev: object) -> None:
        ctx.shutdown("session closed")

    agent = SalesAgent(instructions=instructions, tools_client=client, state=state)  # type: ignore[arg-type]
    await session.start(
        agent=agent,
        room=ctx.room,
        # Web-Test (Agent Console im LiveKit-Dashboard): Identität des Browsers ist beliebig,
        # die Session hängt sich an den ersten Teilnehmer
        room_options=room_io.RoomOptions(
            participant_identity=None if settings.web_test else CALLEE_IDENTITY
        ),
    )

    if settings.web_test:
        # Browser-Teilnehmer statt SIP: kein Wählen, kein AMD.
        try:
            await asyncio.wait_for(ctx.wait_for_participant(), WEB_TEST_JOIN_TIMEOUT_S)
        except (TimeoutError, RuntimeError):  # RuntimeError: Raum vorher geschlossen
            technical.update(outcome="no_answer", reason="Web-Test: niemand beigetreten")
            ctx.shutdown("web test no participant")
            return
        logger.info("web test participant joined")
        # im Browser gibt es kein "Hallo?" beim Abnehmen: Agent eröffnet sofort
        session.generate_reply(instructions="Die Person ist verbunden. Eröffne das Gespräch.")
    else:
        if not await _dial_and_detect(ctx, settings, call, session, technical):
            return

    async def _limit_duration() -> None:
        await asyncio.sleep(settings.max_call_seconds)
        session.generate_reply(
            instructions=(
                "Die maximale Gesprächszeit ist erreicht. Fasse in einem Satz zusammen, "
                "vereinbare den nächsten Schritt, lass das Ergebnis speichern "
                "und verabschiede dich."
            )
        )
        await asyncio.sleep(WRAP_UP_GRACE_S)
        technical.update(outcome="failed", reason="Maximale Gesprächsdauer überschritten")
        ctx.shutdown("max duration")

    watchdog = asyncio.create_task(_limit_duration())


async def _dial_and_detect(
    ctx: JobContext,
    settings: Settings,
    call: CallContext,
    session: AgentSession,
    technical: dict[str, str],
) -> bool:
    """SIP-Anruf mit AMD. False = Anruf beendet (Grund steht in ``technical``)."""
    async with AMD(session, participant_identity=CALLEE_IDENTITY) as detector:
        try:
            await ctx.api.sip.create_sip_participant(
                api.CreateSIPParticipantRequest(
                    room_name=ctx.room.name,
                    sip_trunk_id=settings.sip_outbound_trunk_id,
                    sip_call_to=call.phone_number,
                    participant_identity=CALLEE_IDENTITY,
                    participant_name=call.lead.firma,
                    wait_until_answered=True,
                ),
                timeout=60,
            )
        except api.SipCallError as exc:
            outcome, reason = _technical_from_sip(exc)
            technical.update(outcome=outcome, reason=reason)
            ctx.shutdown("call not answered")
            return False
        except TimeoutError:
            technical.update(outcome="no_answer", reason="Timeout beim Wählen")
            ctx.shutdown("dial timeout")
            return False
        except Exception as exc:  # noqa: BLE001 - jeder Wählfehler beendet fail-closed
            logger.exception("dial failed")
            technical.update(outcome="failed", reason=f"Wählfehler: {type(exc).__name__}")
            ctx.shutdown("dial error")
            return False
        if CALLEE_IDENTITY not in ctx.room.remote_participants:
            technical.update(outcome="no_answer", reason="Teilnehmer nach Annahme nicht im Raum")
            ctx.shutdown("participant missing")
            return False
        result = await detector.execute()

    logger.info("amd result", extra={"category": result.category.value, "reason": result.reason})
    if result.category in (AMDCategory.MACHINE_VM, AMDCategory.MACHINE_UNAVAILABLE):
        # Entscheidung offen, ob Nachrichten hinterlassen werden – bis dahin: auflegen
        technical.update(outcome="voicemail", reason=f"Mailbox erkannt ({result.reason})")
        ctx.shutdown("voicemail")
        return False
    if result.category == AMDCategory.UNCERTAIN and result.reason == "no_speech_timeout":
        # Person schweigt nach Annahme -> Agent eröffnet
        session.generate_reply(
            instructions="Die Person hat abgenommen, sagt aber nichts. Eröffne das Gespräch."
        )
    return True


def run() -> None:
    load_dotenv()
    settings = load_settings()
    cli.run_app(build_server(settings))


if __name__ == "__main__":
    run()
