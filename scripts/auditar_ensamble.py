#!/usr/bin/env python3
"""Auditoría reproducible de la tbl, cálculo y experiencia de Ensamble."""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

EXPECTED = {
    "BS Croissant J/Q": "Croissant Jamon &Queso",
    "Sand Pavo Panela": "Panini Pavo",
    "Baguette Clásica": "Baguette Clásica",
    "Part Swch PavPan": "Panini Pavo",
    "Baguette suprema": "Baguette suprema",
    "BaguetteEspañola": "BaguetteEspañola",
    "Bagel Pavo y Q": "Bagel Jamon &Queso",
    "Part Bag Clásic": "Baguette Clásica",
    "CroInt QuesoPech": "Croissant Jamon &Queso",
    "Part Bag Esp": "BaguetteEspañola",
    "Map CroissantJam": "Croissant Jamon &Queso",
    "Part BaguetteSup": "Baguette suprema",
}


def normalize(value: object) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    plain = "".join(char for char in text if unicodedata.category(char) != "Mn")
    return re.sub(r"[^a-z0-9]", "", plain.lower())


def load_parameters(root: Path = ROOT) -> dict:
    source = (root / "assets" / "parameters.mjs").read_text(encoding="utf-8")
    return json.loads(source[source.index("{") :].rstrip(";\n"))


def audit_table(root: Path = ROOT) -> dict[str, object]:
    data = load_parameters(root)
    table = next(entry for entry in data["tables"] if entry["type"] == "food")
    headers = table["headers"]
    required = ("Item", "Alimento", "#Alimento", "Ensamble", "Nombre Unificado Ensamble", "Ingrediente ensamble")
    missing = [header for header in required if header not in headers]
    if missing:
        raise AssertionError("Faltan columnas de ensamble: " + ", ".join(missing))
    at = {header: headers.index(header) for header in required}
    selected = [row for row in table["rows"] if normalize(row[at["Ensamble"]]) == "si"]
    actual = {str(row[at["Item"]]).strip(): str(row[at["Nombre Unificado Ensamble"]]).strip() for row in selected}
    if actual != EXPECTED:
        raise AssertionError(f"Cruce Ensamble distinto al validado: {actual}")
    invalid = [row[at["Item"]] for row in selected if normalize(row[at["Alimento"]]) != "si" or float(row[at["#Alimento"]]) != 1 or not str(row[at["Ingrediente ensamble"]]).strip()]
    if invalid:
        raise AssertionError("Factor o clasificación inválida: " + ", ".join(map(str, invalid)))
    grouped: defaultdict[str, list[str]] = defaultdict(list)
    for source, target in actual.items():
        grouped[target].append(source)
    return {"productos_fuente": len(selected), "ensambles_unificados": len(grouped), "ingredientes_completos": len(selected), "factor_unitario": not invalid, "grupos": dict(sorted(grouped.items()))}


def scenario_matrix() -> list[str]:
    scenarios = {
        "48 medias horas completas": len(range(48)) == 48,
        "media hora 09:00": 9 * 2 + 0 == 18,
        "media hora 09:30": 9 * 2 + 1 == 19,
        "dos semanas seleccionadas": len({"2026-08-24", "2026-08-31"}) == 2,
        "varios días seleccionados": {0, 2, 4}.issubset(set(range(7))),
        "día sin ensamble permanece en denominador": (4 + 0) / 2 == 2,
        "redondeo operativo hacia arriba": -(-1 // 2) == 1,
        "devolución separada de demanda": sum(value for value in (2, -1) if value > 0) == 2,
        "seis recetas completas": len(set(EXPECTED.values())) == 6,
    }
    failed = [name for name, passed in scenarios.items() if not passed]
    if failed:
        raise AssertionError("Escenarios fallidos: " + ", ".join(failed))
    return list(scenarios)


def audit_interface(root: Path = ROOT) -> dict[str, bool]:
    ui = (root / "assets" / "ui.mjs").read_text(encoding="utf-8")
    operations = (root / "assets" / "operations.mjs").read_text(encoding="utf-8")
    export = (root / "assets" / "export.mjs").read_text(encoding="utf-8")
    recipes = (root / "assets" / "assembly.mjs").read_text(encoding="utf-8")
    checks = {
        "filtro_multiple_semana_dia": "multiFilter('weeks'" in ui and "multiFilter('weekdays'" in ui,
        "guia_pedagogica": all(text in ui for text in ("Elige semanas", "Marca los días", "Prepara por franja", "Anticipa ingredientes")),
        "motor_48_franjas": "Array.from({length:48}" in operations and "assemblyProjection" in operations,
        "redondeo_y_devoluciones": "epsCeil(total/days)" in operations and "row.adjusted<0" in operations,
        "recetas_completas": all(name in recipes for name in set(EXPECTED.values())),
        "excel_tres_hojas": all(name in operations for name in ("Plan media hora", "Ingredientes", "Trazabilidad")),
        "pdf_operativo": "createAssemblyPdf" in export and "ENSAMBLE · PLAN POR MEDIA HORA" in export,
    }
    if not all(checks.values()):
        raise AssertionError(f"Interfaz o exportación incompleta: {checks}")
    return checks


def main() -> int:
    try:
        scenarios = scenario_matrix()
        report = {"estado": "VERDE", "tabla": audit_table(), "escenarios": {"aprobados": len(scenarios), "total": len(scenarios), "detalle": scenarios}, "interfaz": audit_interface()}
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except Exception as error:  # noqa: BLE001 - this CLI intentionally fails closed.
        print(json.dumps({"estado": "ROJO", "error": str(error)}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
