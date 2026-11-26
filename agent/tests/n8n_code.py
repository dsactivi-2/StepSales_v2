"""Führt n8n-Code-Nodes aus den Workflow-Quellen aus (gleiche JS-Schnipsel wie in n8n)."""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path
from typing import Any

N8N_DIR = Path(__file__).resolve().parents[2] / "n8n" / "workflows"
SRC_DIR = N8N_DIR / "src"
RUNNER = Path(__file__).resolve().parent / "run_n8n_code_node.mjs"
NOW = "2026-11-26T10:00:00+01:00"


def unescape_template(body: str) -> str:
    """Entpackt den Inhalt eines TS-Template-Literals."""
    out: list[str] = []
    i = 0
    while i < len(body):
        if body[i] == "\\" and i + 1 < len(body):
            nxt = body[i + 1]
            mapping = {
                "n": "\n",
                "t": "\t",
                "r": "\r",
                "`": "`",
                "\\": "\\",
                "$": "$",
                "'": "'",
                '"': '"',
            }
            out.append(mapping.get(nxt, nxt))
            i += 2
            continue
        out.append(body[i])
        i += 1
    return "".join(out)


def extract_preamble(src: str) -> str:
    match = re.search(r"const PRE = `([\s\S]*?)`;", src)
    if not match:
        return ""
    return unescape_template(match.group(1))


def extract_js(src: str, node_name: str) -> str:
    marker = f"name: '{node_name}'"
    start = src.find(marker)
    if start < 0:
        raise AssertionError(f"Node {node_name!r} fehlt")
    match = re.search(r"jsCode:\s*(PRE \+ )?`([\s\S]*?)`", src[start:])
    if not match:
        raise AssertionError(f"jsCode für {node_name!r} fehlt")
    body = unescape_template(match.group(2))
    if match.group(1):
        return extract_preamble(src) + body
    return body


def load_src(filename: str) -> str:
    return (SRC_DIR / filename).read_text(encoding="utf-8")


def ensure_luxon() -> None:
    """Unit-Tests laufen ohne Netz (AGENTS.md §8): nichts nachinstallieren, sondern mit
    klarer Anleitung überspringen. Einmalig: ``cd n8n/workflows && npm ci --ignore-scripts``."""
    import shutil

    import pytest

    if shutil.which("node") is None:
        pytest.skip("node fehlt – n8n-Code-Node-Tests übersprungen")
    if not (N8N_DIR / "node_modules" / "luxon").exists():
        pytest.skip("luxon fehlt – einmalig: cd n8n/workflows && npm ci --ignore-scripts")


def run_node(
    code: str,
    *,
    nodes: dict[str, list[dict[str, Any]]] | None = None,
    input_json: dict[str, Any] | None = None,
    now: str = NOW,
    executed: dict[str, bool] | None = None,
) -> Any:
    """Führt ein n8n-Code-Node-Skript aus. Rückgabe ist der JS-Return-Wert (Liste von Items)."""
    ensure_luxon()
    payload = {
        "code": code,
        "now": now,
        "input": input_json,
        "nodes": {
            name: {"items": items, "executed": (executed or {}).get(name, True)}
            for name, items in (nodes or {}).items()
        },
    }
    proc = subprocess.run(
        ["node", str(RUNNER)],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        cwd=str(N8N_DIR),
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr or proc.stdout or f"node exit {proc.returncode}")
    result = json.loads(proc.stdout)
    if result.get("threw"):
        raise RuntimeError(result["threw"])
    return result["value"]


def first_json(result: Any) -> dict[str, Any]:
    assert isinstance(result, list) and result, result
    item = result[0]
    assert isinstance(item, dict) and "json" in item, result
    data = item["json"]
    assert isinstance(data, dict)
    return data


def config_rows(**values: str) -> list[dict[str, Any]]:
    return [
        {"id": f"recCFG{i:08d}", "Schlüssel": key, "Wert": val}
        for i, (key, val) in enumerate(values.items(), 1)
    ]
