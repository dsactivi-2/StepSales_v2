"""Der Verkaufsagent: Instruktionen + Tools. Kennt kein Modell – das setzt die Session.

Tools liefern Fakten (kompaktes dict), nie fertige Sätze. Preise, Rabattgrenzen, IDs und
Status entscheidet n8n; der Agent schickt nur, was im Gespräch gesagt wurde.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Literal

from livekit.agents import Agent, RunContext, function_tool
from livekit.agents.beta.tools import EndCallTool
from livekit.agents.llm import ToolError

from .n8n_client import ToolRejected, ToolsClient, ToolsUnavailable

logger = logging.getLogger("stepsales.agent")

Level = Literal["high", "medium", "low"]
Outcome = Literal[
    "closed",
    "second_appointment_booked",
    "offer_promised",
    "material_promised",
    "callback_agreed",
    "no_fit",
    "no_interest",
    "dnc_requested",
    "wrong_person",
]
Objection = Literal[
    "price", "timing", "trust", "authority", "existing_provider", "no_need", "other", "none"
]


UNAVAILABLE_MESSAGE = (
    "System gerade nicht erreichbar. Nichts wurde gespeichert oder gesendet. "
    "Sag das offen und biete an, es per Mail nachzuholen."
)


@dataclass
class CallState:
    """Autoritativer Sitzungszustand (Code-seitig, nicht vom Modell)."""

    outcome_logged: bool = False
    outcome: str | None = None
    offer_ids: list[str] = field(default_factory=list)
    tool_failures: int = 0


class SalesAgent(Agent):
    def __init__(
        self,
        *,
        instructions: str,
        tools_client: ToolsClient,
        state: CallState,
        llm: Any = None,
    ) -> None:
        kwargs: dict[str, Any] = {}
        if llm is not None:
            kwargs["llm"] = llm
        super().__init__(
            instructions=instructions,
            tools=[
                EndCallTool(
                    # Raum wird im Shutdown-Callback gelöscht (jede Exit-Route).
                    delete_room=False,
                    # GPT-Live spricht während des Tool-Calls; None beendet nach dem Turn.
                    end_instructions=None,
                    ignore_on_enter=True,
                    extra_description=(
                        "Nur nach log_call_outcome und nach der Verabschiedung aufrufen."
                    ),
                )
            ],
            **kwargs,
        )
        self._client = tools_client
        self._state = state

    async def _call(self, tool: str, args: dict[str, Any]) -> dict[str, Any]:
        try:
            return await self._client.call(tool, args)
        except ToolRejected as exc:
            # fachliche Ablehnung: Fakt für das Modell, kein Absturz
            raise ToolError(f"abgelehnt ({exc.code}): {exc.message}") from exc
        except ToolsUnavailable as exc:
            self._state.tool_failures += 1
            logger.warning("tool unavailable", extra={"tool": tool})
            raise ToolError(UNAVAILABLE_MESSAGE) from exc

    @function_tool
    async def get_packages(self, context: RunContext) -> dict[str, Any]:
        """Lädt die aktiven Multiposting-Pakete mit Leistungen, Portalen, Laufzeit, Listenpreis
        (EUR netto) und maximal erlaubtem Rabatt. Vor jeder Paketempfehlung oder Preisnennung
        aufrufen."""
        return await self._call("get_packages", {})

    @function_tool
    async def qualify_lead(
        self,
        context: RunContext,
        active_hiring: bool | None = None,
        roles_hiring_for: list[str] | None = None,
        number_of_roles: int | None = None,
        urgency: Level | None = None,
        timeline: str | None = None,
        current_channels: str | None = None,
        budget_signal: Literal["open", "approved", "unclear", "no_budget"] | None = None,
        interest_level: Level | None = None,
        decision_role: Literal["decision_maker", "influencer", "unknown"] | None = None,
        contact_name: str | None = None,
        contact_role: str | None = None,
    ) -> dict[str, Any]:
        """Speichert, was im Gespräch über Bedarf und Person gesagt wurde. Nur Felder angeben,
        die die Person genannt hat; nicht Genanntes weglassen (bleibt unverändert).

        Args:
            active_hiring: Sucht die Firma aktuell Personal?
            roles_hiring_for: Genannte offene Stellen.
            number_of_roles: Anzahl offener Stellen, falls genannt.
            urgency: Wie dringend die Besetzung ist.
            timeline: Zeitrahmen in den Worten der Person, z. B. "in zwei Wochen".
            current_channels: Bisher genutzte Kanäle/Portale.
            budget_signal: Budget-Aussage der Person.
            interest_level: Interesse an zusätzlicher Reichweite.
            decision_role: Entscheidet die Person selbst?
            contact_name: Name der Person, falls korrigiert oder neu.
            contact_role: Funktion der Person.
        """
        return await self._call(
            "qualify_lead",
            {
                "active_hiring": active_hiring,
                "roles_hiring_for": roles_hiring_for,
                "number_of_roles": number_of_roles,
                "urgency": urgency,
                "timeline": timeline,
                "current_channels": current_channels,
                "budget_signal": budget_signal,
                "interest_level": interest_level,
                "decision_role": decision_role,
                "contact_name": contact_name,
                "contact_role": contact_role,
            },
        )

    @function_tool
    async def create_offer(
        self,
        context: RunContext,
        package_id: str,
        discount_percent: float = 0,
        discount_reason: str | None = None,
    ) -> dict[str, Any]:
        """Erstellt ein Angebot für ein Paket, dem die Person zugestimmt hat. Liefert offer_id,
        Endpreis und Gültigkeit. Der Endpreis wird vom System berechnet.

        Args:
            package_id: Paket-ID aus get_packages, z. B. MULTI_M.
            discount_percent: Rabatt in Prozent, nur wenn im Gespräch angeboten; sonst 0.
            discount_reason: Pflicht bei Rabatt, z. B. "Entscheidung diese Woche".
        """
        if discount_percent < 0:
            raise ToolError("discount_percent darf nicht negativ sein")
        if discount_percent > 0 and not discount_reason:
            raise ToolError("Bei Rabatt ist discount_reason Pflicht")
        data = await self._call(
            "create_offer",
            {
                "package_id": package_id,
                "discount_percent": discount_percent,
                "discount_reason": discount_reason,
            },
        )
        offer_id = data.get("offer_id")
        if isinstance(offer_id, str):
            self._state.offer_ids.append(offer_id)
        return data

    @function_tool
    async def send_followup(
        self,
        context: RunContext,
        email: str,
        followup_type: Literal["offer", "recap", "material"],
        offer_id: str | None = None,
        summary: str | None = None,
        agreed_next_contact: str | None = None,
    ) -> dict[str, Any]:
        """Sendet eine Mail an die im Gespräch bestätigte Adresse.

        Args:
            email: Von der Person bestätigte E-Mail-Adresse.
            followup_type: 'offer' (Angebot, braucht offer_id), 'recap' (Zusammenfassung)
                oder 'material' (Paketinfos).
            offer_id: Aus create_offer, nur bei 'offer'.
            summary: Kurze Zusammenfassung des Gesprächs für 'recap'.
            agreed_next_contact: Vereinbarter nächster Kontakt in Worten der Person.
        """
        if followup_type == "offer" and not offer_id:
            raise ToolError("Für ein Angebot zuerst create_offer aufrufen (offer_id fehlt)")
        return await self._call(
            "send_followup",
            {
                "email": email,
                "followup_type": followup_type,
                "offer_id": offer_id,
                "summary": summary,
                "agreed_next_contact": agreed_next_contact,
            },
        )

    @function_tool
    async def schedule_second_call(
        self,
        context: RunContext,
        start_iso: str,
        email: str | None = None,
        topic: str | None = None,
    ) -> dict[str, Any]:
        """Trägt einen mit der Person vereinbarten Zweittermin ein.

        Args:
            start_iso: Beginn in Europe/Berlin, ISO 8601, z. B. 2026-12-01T10:30:00+01:00.
            email: Bestätigte E-Mail für die Terminbestätigung, falls gewünscht.
            topic: Worum es im Zweittermin gehen soll.
        """
        return await self._call(
            "schedule_second_call", {"start_iso": start_iso, "email": email, "topic": topic}
        )

    @function_tool
    async def send_payment_link(
        self, context: RunContext, offer_id: str, email: str
    ) -> dict[str, Any]:
        """Sendet den Zahlungslink zu einem Angebot nach ausdrücklicher Kaufzusage.

        Args:
            offer_id: Aus create_offer in diesem Gespräch.
            email: Von der Person bestätigte E-Mail-Adresse.
        """
        if offer_id not in self._state.offer_ids:
            raise ToolError("Unbekannte offer_id – zuerst create_offer in diesem Gespräch")
        return await self._call("send_payment_link", {"offer_id": offer_id, "email": email})

    @function_tool
    async def log_call_outcome(
        self,
        context: RunContext,
        outcome: Outcome,
        summary: str,
        next_step: str | None = None,
        objection_type: Objection = "none",
        interest_level: Level | None = None,
        callback_iso: str | None = None,
        confidence: Level = "medium",
    ) -> dict[str, Any]:
        """Speichert das Gesprächsergebnis. Genau einmal am Ende, vor end_call.

        Args:
            outcome: Ergebnis des Gesprächs.
            summary: 1-3 Sätze, was besprochen wurde.
            next_step: Vereinbarter nächster Schritt.
            objection_type: Hauptsächlicher Einwand.
            interest_level: Interesse am Ende des Gesprächs.
            callback_iso: Vereinbarter Rückruf in Europe/Berlin (ISO 8601), falls vereinbart.
            confidence: Wie sicher die Einschätzung ist.
        """
        data = await self._call(
            "log_call_outcome",
            {
                "outcome": outcome,
                "summary": summary,
                "next_step": next_step,
                "objection_type": objection_type,
                "interest_level": interest_level,
                "callback_iso": callback_iso,
                "confidence": confidence,
            },
        )
        # erst nach bestätigtem Schreiben als erledigt markieren
        self._state.outcome_logged = True
        self._state.outcome = outcome
        return data
