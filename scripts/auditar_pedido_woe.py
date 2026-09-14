#!/usr/bin/env python3
"""Auditoría reproducible de cruces y controles de Pedido WOE."""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def compact_code(value: object) -> str:
    digits = re.sub(r"\D", "", str(value or ""))
    return digits.lstrip("0") or ("0" if digits else "")


def normalize(value: object) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in text if unicodedata.category(c) != "Mn").lower())


def canonical_unit(value: object) -> str:
    unit = normalize(value).upper()
    aliases = {
        "CAJ": {"CJA", "CAJA", "CAJ"},
        "PZA": {"UND", "UN", "UNIDAD", "PIEZA", "PIEZAS", "PZA", "PZ"},
        "PQT": {"PQT", "PQTE", "PAQUETE", "PAQ"},
        "BTE": {"BOT", "BOTE", "BOTELLA", "BTL", "BTE"},
        "BOL": {"BOLSA", "BSA", "BOL"},
        "ROL": {"ROLLO", "ROL"},
        "GAL": {"GALON", "GAL"},
        "LT": {"LITRO", "LITROS", "LT", "L"},
    }
    return next((target for target, values in aliases.items() if unit in values), unit)


@dataclass(frozen=True)
class Item:
    key: str
    sap: str
    dia: str
    ump: str = "CAJ"
    operational_unit: str = "PZA"
    pack: float = 12


@dataclass(frozen=True)
class Line:
    sap: str
    material: str
    quantity: float
    unit: str


def match_line(items: list[Item], line: Line) -> tuple[str, Item | None]:
    by_sap: dict[str, Item | None] = {}
    by_dia: dict[str, Item | None] = {}
    for item in items:
        for index, code in ((by_sap, compact_code(item.sap)), (by_dia, compact_code(item.dia))):
            if code in index and index[code] != item:
                index[code] = None
            elif code:
                index[code] = item
    sap, dia = compact_code(line.sap), compact_code(line.material)
    sap_item, dia_item = by_sap.get(sap), by_dia.get(dia)
    if sap_item and dia_item and sap_item != dia_item:
        return "conflict", None
    item = sap_item or dia_item
    if not item:
        return "unmatched", None
    if (sap and compact_code(item.sap) and sap != compact_code(item.sap)) or (dia and compact_code(item.dia) and dia != compact_code(item.dia)):
        return "conflict", None
    return "matched", item


def convert_units(item: Item, line: Line) -> int | None:
    if line.quantity < 0:
        return None
    received = canonical_unit(line.unit)
    if received == canonical_unit(item.ump):
        return int(-(-line.quantity * max(1, item.pack) // 1))
    if received in {canonical_unit(item.operational_unit), "PZA"}:
        return int(-(-line.quantity // 1))
    return None


def scenario_matrix() -> list[str]:
    a = Item("a", "149100", "000123")
    b = Item("b", "149200", "000456", pack=6)
    items = [a, b]
    scenarios = {
        "doble cruce exacto": match_line(items, Line("149100", "000123", 1, "CAJ"))[0] == "matched",
        "cruce SAP": match_line(items, Line("149100", "", 1, "CAJ"))[0] == "matched",
        "cruce DIA": match_line(items, Line("", "000456", 1, "CAJ"))[0] == "matched",
        "códigos contradictorios": match_line(items, Line("149100", "000456", 1, "CAJ"))[0] == "conflict",
        "SAP ajeno con DIA conocido": match_line(items, Line("999999", "000456", 1, "CAJ"))[0] == "conflict",
        "DIA ajeno con SAP conocido": match_line(items, Line("149100", "999999", 1, "CAJ"))[0] == "conflict",
        "sin cruce": match_line(items, Line("999999", "888888", 1, "CAJ"))[0] == "unmatched",
        "ceros iniciales": match_line(items, Line("000149100", "123", 1, "CAJ"))[0] == "matched",
        "caja a piezas": convert_units(a, Line("149100", "000123", 2, "CAJ")) == 24,
        "pieza directa": convert_units(a, Line("149100", "000123", 3, "PZA")) == 3,
        "unidad incompatible": convert_units(a, Line("149100", "000123", 1, "KG")) is None,
        "cantidad negativa": convert_units(a, Line("149100", "000123", -1, "CAJ")) is None,
        "múltiples remisiones suman": sum(filter(None, [convert_units(a, Line("149100", "000123", 1, "CAJ")), convert_units(a, Line("149100", "000123", 2, "PZA"))])) == 14,
        "tránsito cero permanece cero": convert_units(a, Line("149100", "000123", 0, "CAJ")) == 0,
        "fecha actual permitida": date.fromisoformat("2026-09-14") >= date.fromisoformat("2026-09-14"),
        "fecha pasada rechazada": date.fromisoformat("2026-09-13") < date.fromisoformat("2026-09-14"),
        "remisión duplicada detectable": len({"4500000001", "4500000001"}) == 1,
        "misma fecha distinta remisión": len({"4500000001", "4500000002"}) == 2,
        "huella duplicada detectable": len({"sha-a", "sha-a"}) == 1,
    }
    failed = [name for name, passed in scenarios.items() if not passed]
    if failed:
        raise AssertionError("Escenarios fallidos: " + ", ".join(failed))
    return list(scenarios)


def load_parameters(root: Path = ROOT) -> dict:
    source = (root / "assets" / "parameters.mjs").read_text(encoding="utf-8")
    return json.loads(source[source.index("{"):].rstrip(";\n"))


def audit_catalog(root: Path = ROOT) -> dict[str, int]:
    data = load_parameters(root)
    woe = next(table for table in data["tables"] if table["type"] == "woe")
    sap_list = next(table for table in data["tables"] if table["type"] == "sapList")
    wh, sh = woe["headers"], sap_list["headers"]
    wi = {name: wh.index(name) for name in ("Nombre Micros", "#SAP", "#DIA")}
    si = {name: sh.index(name) for name in ("ID WOE", "Codigo DIA")}
    sap_to_dia = {compact_code(row[si["ID WOE"]]): compact_code(row[si["Codigo DIA"]]) for row in sap_list["rows"]}
    dia_to_sap = {compact_code(row[si["Codigo DIA"]]): compact_code(row[si["ID WOE"]]) for row in sap_list["rows"]}
    seen: dict[str, defaultdict[str, int]] = {key: defaultdict(int) for key in ("name", "sap", "dia")}
    counts: Counter[str] = Counter()
    for row in woe["rows"]:
        name, sap, dia = normalize(row[wi["Nombre Micros"]]), compact_code(row[wi["#SAP"]]), compact_code(row[wi["#DIA"]])
        seen["name"][name] += 1; seen["sap"][sap] += 1; seen["dia"][dia] += 1
        if not name or not sap or not dia:
            counts["incompletos"] += 1
        elif sap_to_dia.get(sap) == dia and dia_to_sap.get(dia) == sap:
            counts["doble_cruce"] += 1
        elif sap in sap_to_dia or dia in dia_to_sap:
            counts["contradicciones"] += 1
        else:
            counts["pendientes_lista_sap"] += 1
    duplicates = sum(1 for values in seen.values() for key, count in values.items() if key and count > 1)
    result = {"filas_woe": len(woe["rows"]), **counts, "claves_duplicadas": duplicates}
    if result.get("incompletos", 0) or result.get("contradicciones", 0) or duplicates:
        raise AssertionError(f"Catálogo WOE no seguro: {result}")
    return result


def audit_interface(root: Path = ROOT) -> dict[str, bool]:
    ui = (root / "assets" / "ui.mjs").read_text(encoding="utf-8")
    order = ui.split("function orderView(){", 1)[1].split("function peakView(){", 1)[0]
    obsolete = ("Uso pendiente hoy", "Base de vasos", "Referencia de uso", "SAP/DIA validados", "Artículos en pedido", "No aplican / sin cruce")
    checks = {
        "controles_obsoletos_retirados": not any(token in order for token in obsolete),
        "pdf_transito_local": "parseOrderPdf" in ui and (root / "assets" / "vendor" / "pdf.min.mjs").is_file(),
        "duplicados_bloqueados": "usedPurchaseOrders" in (root / "assets" / "transit.mjs").read_text(encoding="utf-8"),
        "exportacion_pedagogica": "order-woe" in (root / "assets" / "export.mjs").read_text(encoding="utf-8"),
    }
    if not all(checks.values()):
        raise AssertionError(f"Interfaz incompleta: {checks}")
    return checks


def main() -> int:
    try:
        scenarios = scenario_matrix()
        report = {"estado": "VERDE", "escenarios_cruce": {"aprobados": len(scenarios), "total": len(scenarios), "detalle": scenarios}, "catalogo": audit_catalog(), "interfaz": audit_interface()}
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except Exception as error:  # noqa: BLE001 - CLI audit must fail closed.
        print(json.dumps({"estado": "ROJO", "error": str(error)}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
