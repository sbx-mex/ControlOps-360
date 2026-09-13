#!/usr/bin/env python3
"""Valida estructura y cálculos de una exportación Max & Min."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from openpyxl import load_workbook


ORDER_FACTOR = {2: 5, 3: 4, 4: 3, 5: 2}
UNIT_HEADERS = (
    "Prioridad", "Nombre SAP", "Código SAP", "Código DIA", "Familia",
    "Pedidos / semana", "Uso diario", "Mínimo", "Máximo", "Unidad",
    "Origen", "Validación",
)
PACK_HEADERS = (
    "Prioridad", "Nombre SAP", "Código SAP", "Código DIA", "Familia",
    "Pedidos / semana", "Formato", "Unidades / formato",
    "Uso diario / formato", "Mínimo", "Máximo", "Presentación", "Validación",
)


def table_rows(sheet, expected_headers: tuple[str, ...]) -> list[dict[str, object]]:
    values = list(sheet.iter_rows(values_only=True))
    if not values or tuple(values[0]) != expected_headers:
        raise ValueError(f"{sheet.title}: encabezados inesperados")
    return [dict(zip(expected_headers, row)) for row in values[1:] if any(value not in (None, "") for value in row)]


def validate(path: Path) -> dict[str, int]:
    workbook = load_workbook(path, read_only=True, data_only=False)
    if workbook.sheetnames != ["Uso Unidad", "Pick Pack"]:
        raise ValueError(f"Pestañas inesperadas: {workbook.sheetnames}")

    unit_rows = table_rows(workbook["Uso Unidad"], UNIT_HEADERS)
    pack_rows = table_rows(workbook["Pick Pack"], PACK_HEADERS)
    priorities = [int(row["Prioridad"]) for row in unit_rows]
    if priorities != sorted(set(priorities)) or any(priority < 1 for priority in priorities):
        raise ValueError("Uso Unidad: la prioridad debe ser única, positiva y ascendente")
    uses = [float(row["Uso diario"]) for row in unit_rows]
    if uses != sorted(uses, reverse=True):
        raise ValueError("Uso Unidad: los productos no están ordenados de mayor a menor uso")

    unit_by_priority = {int(row["Prioridad"]): row for row in unit_rows}
    for row in unit_rows:
        orders = int(row["Pedidos / semana"])
        minimum = float(row["Mínimo"])
        maximum = float(row["Máximo"])
        if orders not in ORDER_FACTOR or abs(maximum - minimum * ORDER_FACTOR[orders]) > 0.31:
            raise ValueError(f"Uso Unidad: relación Max & Min inválida en prioridad {row['Prioridad']}")

    last_priority = 0
    sleeve_rows = 0
    for row in pack_rows:
        priority = int(row["Prioridad"])
        if priority < last_priority or priority not in unit_by_priority:
            raise ValueError("Pick Pack: prioridad fuera de orden")
        last_priority = priority
        if row["Formato"] not in {"Pick Pack", "Manga"}:
            raise ValueError(f"Pick Pack: formato desconocido {row['Formato']}")
        if row["Formato"] == "Manga":
            sleeve_rows += 1
            content = int(row["Unidades / formato"])
            if content not in {40, 50, 100}:
                raise ValueError(f"Manga inválida: {content} piezas")
            expected = float(unit_by_priority[priority]["Uso diario"]) / content
            if abs(float(row["Uso diario / formato"]) - expected) > 0.02:
                raise ValueError(f"Manga: uso diario inválido en prioridad {priority}")

    return {"uso_unidad": len(unit_rows), "pick_pack": len(pack_rows), "mangas": sleeve_rows}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archivo", type=Path)
    args = parser.parse_args()
    print(json.dumps(validate(args.archivo), ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
