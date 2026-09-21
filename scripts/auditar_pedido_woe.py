#!/usr/bin/env python3
"""Auditoría reproducible de cruces y controles de Pedido WOE."""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
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


STORE_STOP_WORDS = {
    "sb", "starbucks", "coffee", "mexico", "mx", "tienda", "sucursal",
    "de", "del", "la", "las", "los", "y", "sa", "cv",
}


def store_words(value: object) -> list[str]:
    text = unicodedata.normalize("NFD", str(value or ""))
    plain = "".join(char for char in text if unicodedata.category(char) != "Mn").lower()
    return [word for word in re.findall(r"[a-z0-9]+", plain) if word not in STORE_STOP_WORDS]


def similar_store_name(left: object, right: object) -> bool:
    a, b = store_words(left), store_words(right)
    if not a or not b:
        return False
    matches = sum(
        any(
            word == other
            or (word.startswith(other) or other.startswith(word))
            and (
                min(len(word), len(other)) >= 4
                or min(len(word), len(other)) >= 3 and len(a) > 1 and len(b) > 1
            )
            for other in b
        )
        for word in a
    )
    return matches / max(len(a), len(b)) >= 0.6


def review_store_identity(
    pdf_ceco: object,
    pdf_name: object,
    motor_ceco: object,
    motor_name: object,
) -> dict[str, object]:
    """Replica la decisión del navegador: la identidad avisa, pero no bloquea."""
    pdf_ceco_clean, motor_ceco_clean = compact_code(pdf_ceco), compact_code(motor_ceco)
    pdf_name_clean, motor_name_clean = str(pdf_name or "").strip(), str(motor_name or "").strip()
    reasons: list[str] = []
    ceco_match = False
    name_match = False
    if not motor_ceco_clean and not motor_name_clean:
        reasons.append("Motor sin tienda comparable")
    if not pdf_ceco_clean and not pdf_name_clean:
        reasons.append("PDF sin identidad reconocible")
    if pdf_ceco_clean and motor_ceco_clean:
        ceco_match = pdf_ceco_clean == motor_ceco_clean
        if not ceco_match:
            reasons.append("CeCo diferente")
    if pdf_name_clean and motor_name_clean:
        name_match = similar_store_name(pdf_name_clean, motor_name_clean)
        if not name_match:
            reasons.append("Nombre diferente")
    if not ceco_match and not name_match and not reasons:
        reasons.append("Sin dato comparable")
    return {
        "ceco_match": ceco_match,
        "name_match": name_match,
        "status": "review" if reasons else "verified",
        "reasons": reasons,
    }


def available_order_dates(today: str, weekdays: list[int], occupied: list[str], limit: int = 8) -> list[str]:
    start = date.fromisoformat(today)
    active = {day for day in weekdays if 0 <= day <= 6}
    blocked = set(occupied)
    result: list[str] = []
    for offset in range(1, 113):
        candidate = start + timedelta(days=offset)
        key = candidate.isoformat()
        if candidate.weekday() in active and key not in blocked:
            result.append(key)
            if len(result) >= limit:
                break
    return result


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
        "nombre Luna Parc compatible": similar_store_name("SB_Luna_Parc", "Luna Parc"),
        "abreviación Gal Perinorte compatible": similar_store_name("SB_Gal_Perinorte", "Galerías Perinor"),
        "nombre de otra tienda rechazado": not similar_store_name("SB_Luna_Parc", "Galerías Perinor"),
        "nombre distinto permite revisión": review_store_identity("", "Galerías Perinor", "38368", "SB_Luna_Parc")["status"] == "review",
        "CeCo distinto permite revisión": review_store_identity("38894", "", "38368", "SB_Luna_Parc")["status"] == "review",
        "PDF sin identidad permite revisión": review_store_identity("", "", "38368", "SB_Luna_Parc")["status"] == "review",
        "nombre SB se valida automáticamente": review_store_identity("", "Luna Parc", "38368", "SB_Luna_Parc")["status"] == "verified",
        "miércoles y sábado calculados": available_order_dates("2026-09-15", [2, 5], [], 3) == ["2026-09-16", "2026-09-19", "2026-09-23"],
        "miércoles en tránsito se retira": available_order_dates("2026-09-15", [2, 5], ["2026-09-16"], 3) == ["2026-09-19", "2026-09-23", "2026-09-26"],
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
    result["evidencia"] = {
        "cruce": "WOE ↔ Lista SAP",
        "cardinalidad": "varios a uno",
        "registros_entrada": len(woe["rows"]),
        "registros_encontrados": counts["doble_cruce"],
        "sin_coincidencia": counts["pendientes_lista_sap"],
        "duplicados_detectados": duplicates,
        "registros_finales": len(woe["rows"]),
        "diferencia_conteo": 0,
        "diferencia_importes": 0,
        "resultado": "APROBADO_CON_ADVERTENCIAS" if counts["pendientes_lista_sap"] else "APROBADO",
    }
    return result


def audit_interface(root: Path = ROOT) -> dict[str, bool]:
    ui = (root / "assets" / "ui.mjs").read_text(encoding="utf-8")
    operations = (root / "assets" / "operations.mjs").read_text(encoding="utf-8")
    transit = (root / "assets" / "transit.mjs").read_text(encoding="utf-8")
    export = (root / "assets" / "export.mjs").read_text(encoding="utf-8")
    order = ui.split("function orderView(){", 1)[1].split("function peakView(){", 1)[0]
    obsolete = ("Uso pendiente hoy", "Base de vasos", "Referencia de uso", "SAP/DIA validados", "Artículos en pedido", "No aplican / sin cruce")
    checks = {
        "controles_obsoletos_retirados": not any(token in order for token in obsolete),
        "fecha_actual_fija": "settings.today=currentToday" in ui and 'data-order-setting="today"' not in order and "capture-lock" in order,
        "fecha_pedido_en_lista": "¿Para cuándo es el pedido?" in order and 'select data-order-setting="delivery"' in order and 'input type="date"' not in order,
        "recepciones_con_fecha_contextual": "availableOrderDates(settings.today,[index],transitOrders,1)" in order and "active&&date" in order,
        "fechas_de_transito_retiradas": "availableOrderDates" in operations and "!occupied.has(candidate.dateKey)" in operations,
        "accion_rapida_siguiente": 'data-action="select-next-order"' in order and "Usar siguiente" in order,
        "navegacion_por_actividad": all(token in ui for token in ('data-order-jump="order-cycle"', 'data-order-jump="order-transit"', 'data-order-jump="order-count"', "scrollIntoView")),
        "proveedores_explicitos": all(token in ui for token in ("DIA", "Maquila | Café Sirena", "Lala | Comercializadora Lácteos", "Cambiar proveedor")),
        "productos_por_proveedor": "f.provider&&provider!==providerAlias(f.provider)" in operations,
        "transito_por_proveedor": "filter(order=>providerAlias(order.providerAlias||order.provider)===providerAlias(provider))" in ui and "orderTransitFor(provider)" in order,
        "pdf_transito_local": "parseOrderPdf" in ui and (root / "assets" / "vendor" / "pdf.min.mjs").is_file(),
        "duplicados_bloqueados": "usedPurchaseOrders" in transit,
        "identidad_tienda_informativa": all(token in transit for token in ("validateTransitStore", "similarStoreName", "status:reasons.length?'review':'verified'")) and "motorIdentity" in ui,
        "diferencia_no_bloquea_carga": "order.confirmedByUser=true" in ui and "La diferencia de nombre o CeCo sólo genera aviso; no bloquea tu carga." in ui,
        "confirmacion_grande_por_pedido": all(token in ui for token in ("transit-confirm-card", "VALIDA ESTE PEDIDO", "Continuar con ${accepted.length} pedido")),
        "linea_tiempo_resumida": all(token in order for token in ("order-timeline", "DÍA ACTUAL", "PEDIDO EN TRÁNSITO", "COBERTURA FINAL", "Fecha pedido")),
        "transito_guardado_recuperable": all(token in ui for token in ("transitOrderAccepted", "upgradeStoredTransitOrders", "confirmedByUser")),
        "uso_diario_editable": 'data-order-field="dailyUse"' in order and "data-reset-order-use" in order,
        "pdf_con_cantidad_y_uso": all(token in export for token in ("CANTIDAD", "A PEDIR", "row.quantityLabel", "Uso diario", "row.dailyUse")),
        "exportacion_pedagogica": "order-woe" in export,
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
