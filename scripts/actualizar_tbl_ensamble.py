#!/usr/bin/env python3
"""Agrega de forma reproducible Ingrediente ensamble al parámetro embebido."""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "assets" / "parameters.mjs"
HEADER = "Ingrediente ensamble"

INGREDIENTS = {
    "BS Croissant J/Q": "3 Reb Jamon 18 g c/u, 1 Reb Queso 30 g c/u",
    "Sand Pavo Panela": "Viene Empaquetada",
    "Baguette Clásica": "4 Reb Jamon 18 g c/u, 3 mitades queso 15 g c/u",
    "Part Swch PavPan": "Viene Empaquetada",
    "Baguette suprema": "3 Reb Jamon 18 g c/u, 3 Reb Chorizo 6 g c/u, 3 mitades queso 15 g c/u, 3 Reb Lomo 8 g c/u",
    "BaguetteEspañola": "6 Reb Chorizo 6 g c/u, 3 mitades queso 15 g c/u",
    "Bagel Pavo y Q": "3 Reb Jamon 18 g c/u, 1 Reb Queso 30 g c/u",
    "Part Bag Clásic": "4 Reb Jamon 18 g c/u, 3 mitades queso 15 g c/u",
    "CroInt QuesoPech": "3 Reb Jamon 18 g c/u, 1 Reb Queso 30 g c/u",
    "Part Bag Esp": "6 Reb Chorizo 6 g c/u, 3 mitades queso 15 g c/u",
    "Map CroissantJam": "3 Reb Jamon 18 g c/u, 1 Reb Queso 30 g c/u",
    "Part BaguetteSup": "3 Reb Jamon 18 g c/u, 3 Reb Chorizo 6 g c/u, 3 mitades queso 15 g c/u, 3 Reb Lomo 8 g c/u",
}


def normalize(value: object) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    plain = "".join(char for char in text if unicodedata.category(char) != "Mn")
    return re.sub(r"[^a-z0-9]", "", plain.lower())


def load() -> tuple[str, dict]:
    source = TARGET.read_text(encoding="utf-8")
    prefix = source[: source.index("{")]
    return prefix, json.loads(source[source.index("{") :].rstrip(";\n"))


def update(data: dict) -> dict:
    table = next(entry for entry in data["tables"] if entry["type"] == "food")
    headers = table["headers"]
    item_at = headers.index("Item")
    assembly_at = headers.index("Ensamble")
    if HEADER not in headers:
        headers.append(HEADER)
        for row in table["rows"]:
            row.append("")
    ingredient_at = headers.index(HEADER)
    expected = {normalize(item): value for item, value in INGREDIENTS.items()}
    updated = set()
    for row in table["rows"]:
        while len(row) < len(headers):
            row.append("")
        key = normalize(row[item_at])
        row[ingredient_at] = expected.get(key, "")
        if normalize(row[assembly_at]) == "si":
            if key not in expected:
                raise AssertionError(f"Producto de ensamble sin ingrediente: {row[item_at]}")
            updated.add(key)
    if updated != set(expected):
        missing = sorted(set(expected) - updated)
        raise AssertionError("Ingredientes sin fila Ensamble = Si: " + ", ".join(missing))
    payload = json.dumps({"headers": headers, "rows": table["rows"]}, ensure_ascii=False, separators=(",", ":")).encode()
    table["sha256"] = hashlib.sha256(payload).hexdigest()
    data["version"] = "5.5.0"
    data["date"] = "2026-09-14"
    return data


def main() -> None:
    prefix, data = load()
    updated = update(data)
    TARGET.write_text(prefix + json.dumps(updated, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(json.dumps({"estado": "VERDE", "productos_actualizados": len(INGREDIENTS), "columna": HEADER}, ensure_ascii=False))


if __name__ == "__main__":
    main()
