# Image für LiveKit Cloud (nach dem Python-uv-Template aus docs.livekit.io/deploy/agents/builds/,
# angepasst: Python 3.13 wegen requires-python <3.14, Projekt als Paket unter src/).
# LIVEKIT_URL/API_KEY/API_SECRET injiziert LiveKit Cloud zur Laufzeit; alle übrigen
# Werte kommen als Agent-Secrets (docs/runbooks/deploy-agents.md). Keine Secrets im Image.
ARG PYTHON_IMAGE=ghcr.io/astral-sh/uv:python3.13-bookworm-slim

FROM ${PYTHON_IMAGE} AS build
ENV PYTHONUNBUFFERED=1 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
RUN apt-get update && apt-get install -y --no-install-recommends gcc g++ python3-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project
COPY src ./src
RUN uv sync --locked --no-dev

FROM ${PYTHON_IMAGE}
ENV PYTHONUNBUFFERED=1
RUN useradd --create-home --uid 10001 appuser
WORKDIR /app
COPY --from=build --chown=appuser:appuser /app /app
USER appuser
CMD ["/app/.venv/bin/python", "-m", "stepsales_agent.main", "start"]
