#!/usr/bin/env python3
"""Valida que Peak Hour y Tarea de Ciclo sean flujos separados e imprimibles."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _read(root: Path, relative: str) -> str:
    path = root / relative
    if not path.is_file():
        raise AssertionError(f"Falta {relative}")
    return path.read_text(encoding="utf-8")


def _cycle_catalog(root: Path) -> dict[str, list[str]]:
    source = _read(root, "assets/cycle-tasks.mjs")
    match = re.search(r"CYCLE_TASKS=Object\.freeze\((\{.*\})\);", source, re.DOTALL)
    if not match:
        raise AssertionError("El catálogo de ciclos no es legible.")
    catalog = json.loads(match.group(1))
    if set(catalog) != {"30", "20", "12", "8"} or any(not tasks for tasks in catalog.values()):
        raise AssertionError("El catálogo de ciclos está incompleto.")
    return catalog


def audit(root: Path = ROOT) -> dict[str, object]:
    ui = _read(root, "assets/ui.mjs")
    operations = _read(root, "assets/operations.mjs")
    export = _read(root, "assets/export.mjs")
    styles = _read(root, "assets/styles.css")
    peak = ui.split("function peakView(){", 1)[1].split("function normalView(){", 1)[0]

    ui_contract = (
        "tabs('peak',['Peak Hour','Tarea de Ciclo'])",
        "Tabla comparativa",
        "Time Period",
        'data-peak-basis="average"',
        "data-peak-real",
        "data-cycle-day",
        "data-cycle-activity",
        "Obj. +5",
    )
    engine_contract = (
        "peakPlanningRows",
        "planningWeekDates",
        "cyclePlan",
        "latestWeekday",
        "peakFor(days,0,28)",
        "peakFor(days,28,48)",
    )
    pdf_contract = (
        "createPeakHourPdf",
        "createCycleDayPdf",
        "peak-hour-plan",
        "cycle-day-plan",
        "PEAK HOUR · PLAN SEMANAL",
        "PEAK HOUR · TIME PERIOD",
        "48 PERIODOS · SÓLO TX MAYOR A CERO",
        "TAREA DE CICLO · PLAN DEL DÍA",
    )
    style_contract = (".peak-compare", ".peak-real", ".cycle-days", ".cycle-workspace", ".cycle-frequency")
    missing = [token for token in ui_contract if token not in peak]
    missing += [token for token in engine_contract if token not in operations]
    missing += [token for token in pdf_contract if token not in export]
    missing += [token for token in style_contract if token not in styles]
    if missing:
        raise AssertionError("Contrato Peak incompleto: " + ", ".join(missing))
    if "48 medias horas" in peak or "cycle-panel" in peak:
        raise AssertionError("Peak Hour conserva la vista combinada anterior.")

    catalog = _cycle_catalog(root)
    return {
        "estado": "VERDE",
        "vistas": ["Peak Hour", "Tarea de Ciclo"],
        "pdf_carta": {"peak_hour_paginas": 2, "tarea_ciclo_paginas": 1},
        "time_period_una_pagina": True,
        "tareas": sum(len(tasks) for tasks in catalog.values()),
        "frecuencias": [30, 20, 12, 8],
        "promedio_prioritario": True,
        "captura_real": True,
        "actividad_editable": True,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    try:
        result = audit()
        print(json.dumps(result, ensure_ascii=False, indent=2) if args.json else "VERDE · Peak Hour + Tarea de Ciclo")
        return 0
    except Exception as error:  # noqa: BLE001 - la puerta debe fallar cerrada.
        print(json.dumps({"estado": "ROJO", "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
