"""Langfuse-Tracing über OpenTelemetry (ADR-0008, Issue #14).

Nach docs.livekit.io/testing/observability/tracing/: OTLP an {LANGFUSE_BASE_URL}/api/public/otel,
Header x-langfuse-ingestion-version=4 für Echtzeit-Ingestion. Transkripte sind laut
Owner-Entscheidung gewollt -> allow_pii=True.
"""

from __future__ import annotations

import base64
import logging
import os

from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.util.types import AttributeValue

logger = logging.getLogger("stepsales.telemetry")


def setup_langfuse(metadata: dict[str, AttributeValue]) -> TracerProvider | None:
    from livekit.agents.telemetry import set_tracer_provider
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    public_key = os.environ.get("LANGFUSE_PUBLIC_KEY")
    secret_key = os.environ.get("LANGFUSE_SECRET_KEY")
    base_url = os.environ.get("LANGFUSE_BASE_URL")
    if not (public_key and secret_key and base_url):
        logger.warning("Langfuse nicht konfiguriert – Tracing aus")
        return None

    auth = base64.b64encode(f"{public_key}:{secret_key}".encode()).decode()
    exporter = OTLPSpanExporter(
        endpoint=f"{base_url.rstrip('/')}/api/public/otel/v1/traces",
        headers={"Authorization": f"Basic {auth}", "x-langfuse-ingestion-version": "4"},
    )
    provider = TracerProvider()
    provider.add_span_processor(BatchSpanProcessor(exporter))
    set_tracer_provider(provider, metadata=metadata, allow_pii=True)
    return provider
