#!/usr/bin/env python3
"""Integra Lista_Precios_Base y audita el cruce SAP/DIA de Control Ops 360."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import tempfile
import unicodedata
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

from compatibilidad_xlsm import NS_MAIN, NS_REL, cell_text, column_index, relationships, resolve_path


def normalize(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    return re.sub(r"[^a-zA-Z0-9#]+", "", "".join(char for char in text if not unicodedata.combining(char))).casefold()


def clean_id(value: object, width: int = 0) -> str:
    text = str(value or "").strip()
    try:
        text = str(int(float(text)))
    except ValueError:
        text = text.removesuffix(".0")
    return text.zfill(width) if text else ""


def sheet_rows(path: Path, sheet_name: str) -> list[list[object]]:
    with zipfile.ZipFile(path) as zf:
        names = set(zf.namelist())
        workbook = ET.fromstring(zf.read("xl/workbook.xml"))
        rels = relationships(zf, "xl/_rels/workbook.xml.rels")
        sheet_path = ""
        for node in workbook.findall(f".//{{{NS_MAIN}}}sheet"):
            if node.attrib.get("name") == sheet_name:
                relation_id = node.attrib.get(f"{{{NS_REL}}}id", "")
                sheet_path = resolve_path("xl/workbook.xml", rels.get(relation_id, ""))
                break
        if not sheet_path or sheet_path not in names:
            raise ValueError(f"No se encontró la hoja {sheet_name}")
        shared: list[str] = []
        if "xl/sharedStrings.xml" in names:
            root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            shared = ["".join(node.text or "" for node in item.findall(f".//{{{NS_MAIN}}}t")) for item in root.findall(f"{{{NS_MAIN}}}si")]
        rows: list[list[object]] = []
        with zf.open(sheet_path) as stream:
            for _, node in ET.iterparse(stream, events=("end",)):
                if node.tag != f"{{{NS_MAIN}}}row":
                    continue
                values: dict[int, object] = {}
                for cell in node.findall(f"{{{NS_MAIN}}}c"):
                    values[column_index(cell.attrib.get("r", "A1"))] = cell_text(cell, shared)
                if values:
                    row = [""] * (max(values) + 1)
                    for index, value in values.items():
                        row[index] = value
                    rows.append(row)
                node.clear()
        return rows


def records(path: Path, sheet: str, required: tuple[str, ...]) -> list[dict[str, object]]:
    rows = sheet_rows(path, sheet)
    if not rows:
        raise ValueError(f"La hoja {sheet} está vacía")
    indexes = {normalize(value): index for index, value in enumerate(rows[0]) if str(value or "").strip()}
    missing = [header for header in required if normalize(header) not in indexes]
    if missing:
        raise ValueError(f"{sheet}: faltan columnas {', '.join(missing)}")
    output = []
    for row in rows[1:]:
        output.append({header: row[indexes[normalize(header)]] if indexes[normalize(header)] < len(row) else "" for header in required})
    return output


def load_parameters(path: Path) -> tuple[str, dict[str, object]]:
    text = path.read_text(encoding="utf-8")
    marker = "export default "
    start = text.index(marker) + len(marker)
    return text[:start], json.loads(text[start:].strip().removesuffix(";"))


def audit_woe(parameters: dict[str, object], sap_by_id: dict[str, tuple[str, str]]) -> dict[str, int]:
    table = next(table for table in parameters["tables"] if table["type"] == "woe")
    headers = {normalize(value): index for index, value in enumerate(table["headers"])}
    sap_index, dia_index = headers[normalize("#SAP")], headers[normalize("#DIA")]
    result = {"confirmed": 0, "not_in_list": 0, "conflicts": 0}
    for row in table["rows"]:
        sap, dia = clean_id(row[sap_index]), clean_id(row[dia_index], 6)
        official = sap_by_id.get(sap)
        if official is None:
            result["not_in_list"] += 1
        elif official[0] != dia:
            result["conflicts"] += 1
        else:
            result["confirmed"] += 1
    if result["conflicts"]:
        raise ValueError(f"Se detectaron {result['conflicts']} conflictos SAP/DIA en WOE")
    return result


def integrate(excel: Path, target: Path, version: str) -> dict[str, object]:
    sap_source = records(excel, "SAP", ("ID WOE", "Codigo DIA", "Descripcion SAP"))
    micros_source = records(excel, "Catalogo Micros", ("Familia", "Nombre Micros", "Codigo DIA", "Proveedor"))
    sap_rows: list[list[str]] = []
    sap_by_id: dict[str, tuple[str, str]] = {}
    sap_by_dia: dict[str, str] = {}
    skipped_sap = 0
    for row in sap_source:
        sap, dia, description = clean_id(row["ID WOE"]), clean_id(row["Codigo DIA"], 6), str(row["Descripcion SAP"] or "").strip()
        if not sap or not dia or not description:
            skipped_sap += 1
            continue
        if sap in sap_by_id and sap_by_id[sap] != (dia, description):
            raise ValueError(f"SAP duplicado con valores distintos: {sap}")
        if dia in sap_by_dia and sap_by_dia[dia] != sap:
            raise ValueError(f"DIA duplicado con SAP distinto: {dia}")
        sap_by_id[sap], sap_by_dia[dia] = (dia, description), sap
        sap_rows.append([sap, dia, description])
    micros_rows: list[list[str]] = []
    for row in micros_source:
        name, dia = str(row["Nombre Micros"] or "").strip(), clean_id(row["Codigo DIA"], 6)
        if name and dia:
            micros_rows.append([str(row["Familia"] or "").strip(), name, dia, str(row["Proveedor"] or "").strip()])
    prefix, parameters = load_parameters(target)
    audit = audit_woe(parameters, sap_by_id)
    digest = hashlib.sha256(excel.read_bytes()).hexdigest()
    tables = [table for table in parameters["tables"] if table["type"] not in {"sapList", "microsList"}]
    tables.extend([
        {"type": "sapList", "source": excel.name, "sha256": digest, "sheet": "SAP", "headers": ["ID WOE", "Codigo DIA", "Descripcion SAP"], "rows": sap_rows},
        {"type": "microsList", "source": excel.name, "sha256": digest, "sheet": "Catalogo Micros", "headers": ["Familia", "Nombre Micros", "Codigo DIA", "Proveedor"], "rows": micros_rows},
    ])
    parameters.update({"version": version, "date": "2026-09-13", "tables": tables})
    content = prefix + json.dumps(parameters, ensure_ascii=False, separators=(",", ":")) + ";\n"
    handle, temporary = tempfile.mkstemp(prefix=target.name + ".", dir=target.parent)
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as stream:
            stream.write(content)
        os.replace(temporary, target)
        os.chmod(target, 0o644)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return {"sap_rows": len(sap_rows), "micros_rows": len(micros_rows), "skipped_sap": skipped_sap, **audit, "sha256": digest}


def main() -> int:
    parser = argparse.ArgumentParser(description="Integra y valida Lista_Precios_Base en parameters.mjs")
    parser.add_argument("excel", type=Path)
    parser.add_argument("--target", type=Path, default=Path(__file__).parents[1] / "assets" / "parameters.mjs")
    parser.add_argument("--version", default="5.3.0")
    args = parser.parse_args()
    result = integrate(args.excel, args.target, args.version)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
