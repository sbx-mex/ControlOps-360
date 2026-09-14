#!/usr/bin/env python3
"""Mide el grafo JavaScript inicial y falla si se pierde la carga diferida."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENTRYPOINT = "assets/app.js"
INITIAL_BUDGET_BYTES = 220_000
BASELINE_V6_BYTES = 552_855
STATIC_IMPORT = re.compile(r"^\s*import(?:\s+[^;]*?\s+from\s+)?\s*[\"']([^\"']+)[\"']", re.MULTILINE)
DEFERRED = ("parameters.mjs", "reader.mjs", "export.mjs", "transit.mjs")


def initial_graph(root: Path = ROOT) -> list[Path]:
    pending = [root / ENTRYPOINT]
    found: set[Path] = set()
    while pending:
        path = pending.pop()
        if path in found:
            continue
        if not path.is_file():
            raise AssertionError(f"Importación faltante: {path.relative_to(root)}")
        found.add(path)
        source = path.read_text(encoding="utf-8")
        for target in STATIC_IMPORT.findall(source):
            if target.startswith("."):
                pending.append((path.parent / target).resolve())
    return sorted(found)


def audit(root: Path = ROOT) -> dict[str, object]:
    files = initial_graph(root)
    total = sum(path.stat().st_size for path in files)
    ui = (root / "assets" / "ui.mjs").read_text(encoding="utf-8")
    deferred = {name: f"import('./{name}')" in ui for name in DEFERRED}
    if not all(deferred.values()):
        raise AssertionError(f"Carga diferida incompleta: {deferred}")
    if total > INITIAL_BUDGET_BYTES:
        raise AssertionError(f"Grafo inicial {total} supera presupuesto {INITIAL_BUDGET_BYTES}")
    return {
        "estado": "VERDE",
        "grafo_inicial_bytes": total,
        "presupuesto_bytes": INITIAL_BUDGET_BYTES,
        "linea_base_v6_bytes": BASELINE_V6_BYTES,
        "reduccion_porcentaje": round((1 - total / BASELINE_V6_BYTES) * 100, 1),
        "archivos_iniciales": [str(path.relative_to(root)) for path in files],
        "modulos_diferidos": deferred,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    try:
        result = audit()
        print(json.dumps(result, ensure_ascii=False, indent=2) if args.json else f"VERDE · {result['grafo_inicial_bytes']} bytes · -{result['reduccion_porcentaje']}%")
        return 0
    except Exception as error:  # noqa: BLE001 - la puerta debe fallar cerrada.
        print(json.dumps({"estado": "ROJO", "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
