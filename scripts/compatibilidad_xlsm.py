#!/usr/bin/env python3
"""Valida motores XLSM y parámetros XLSX por estructura."""

from __future__ import annotations

import argparse
import json
import posixpath
import re
import sys
import unicodedata
import zipfile
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable
from xml.etree import ElementTree as ET

NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_PACKAGE_REL = "http://schemas.openxmlformats.org/package/2006/relationships"

STRUCTURES = {
    "venta": ("IDTienda", "FechaHora", "Ticket", "SecTrans", "SecDtl", "Id", "IDProducto", "Cantidad", "Total", "CantidadAjustada"),
    "uso": ("IDTienda", "Fecha", "IDArticulo", "NombreArticulo", "UsoIdeal"),
    "auditoria_ticket": ("IDTienda", "Ticket", "Fecha", "Estatus", "Total", "FechaNegocio"),
    "auditoria_void": ("IDTienda", "FechaHora", "Ticket", "IDProducto", "IdVoid", "VoidReason", "Total"),
    "auditoria_pago": ("IDTienda", "FechaHora", "Ticket", "IdFormaPago", "FormaPagDesc", "MontoTotal", "Total"),
    "productos": ("IDProducto", "Descripcion"),
    "tienda": ("IDTienda", "Tienda"),
    "presentaciones": ("IDArticulo", "NombreArticuloStock", "PickPack", "UnidadStock"),
    "compostable": ("inven_itm_name", "Compostable"),
    "woe": ("Nombre Micros", "#SAP", "#DIA", "Descripcion WOE", "UMB WOE Cantidad pedido"),
    "horneo": ("Grupo de horneo", "Producto en reporte", "Descongelacion", "Horneo", "Temperatura", "Máximo por charola", "Se puede hornear junto"),
    "alimentos": ("Item", "Alimento", "#Alimento", "BIS", "Nombre Unificado BIS"),
    "vasos": ("Descripcion", "Normalizado", "Vaso"),
    "crema": ("Descripcion", "Aplica Normalizado"),
    "politica_tienda": ("CeCo", "Compostable"),
}
REQUIRED_HEADERS = STRUCTURES["venta"]


def normalize(value: object) -> str:
    decoded = re.sub(r"_x[0-9a-fA-F]{4}_", " ", str(value or ""))
    text = unicodedata.normalize("NFKD", decoded)
    ascii_text = "".join(char for char in text if not unicodedata.combining(char))
    return re.sub(r"[^a-zA-Z0-9]+", "", ascii_text).casefold()


def is_ac_source(*values: object) -> bool:
    return any(re.search(r"(?:^|[\s_-])ac$", str(value or "").strip(), re.IGNORECASE) for value in values)


def header_key(value: object) -> str:
    marker = "#" if str(value or "").strip().startswith("#") else ""
    return marker + normalize(value)


def match_structure(headers: Iterable[str], kind: str = "venta") -> tuple[bool, list[str]]:
    keys = [header_key(header) for header in headers]
    available = set(keys)
    missing = [header for header in STRUCTURES[kind] if header_key(header) not in available]
    if len(keys) != len(available) or "" in available:
        missing.append("Encabezados únicos y no vacíos")
    return not missing, missing


def structure_kinds(headers: Iterable[str]) -> list[str]:
    values = list(headers)
    available = {normalize(header) for header in values}
    kinds = [kind for kind in STRUCTURES if match_structure(values, kind)[0]]
    if "idtienda" in available and {"nombretienda", "stname"} & available and "tienda" not in kinds:
        kinds.append("tienda")
    return kinds


def resolve_path(base: str, target: str) -> str:
    if target.startswith("/"):
        return target.lstrip("/")
    return posixpath.normpath(posixpath.join(posixpath.dirname(base), target)).lstrip("/")


def relation_path(path: str) -> str:
    return posixpath.join(posixpath.dirname(path), "_rels", f"{posixpath.basename(path)}.rels")


def relationships(zf: zipfile.ZipFile, path: str) -> dict[str, str]:
    root = ET.fromstring(zf.read(path))
    return {
        node.attrib["Id"]: node.attrib["Target"]
        for node in root.findall(f"{{{NS_PACKAGE_REL}}}Relationship")
    }


def table_row_count(reference: str) -> int:
    cells = str(reference or "A1:A1").split(":")
    start = int(re.search(r"\d+", cells[0]).group()) if re.search(r"\d+", cells[0]) else 1
    end = int(re.search(r"\d+", cells[-1]).group()) if re.search(r"\d+", cells[-1]) else start
    return max(0, end - start)


@dataclass(frozen=True)
class Source:
    sheet: str
    table: str
    reference: str
    rows: int
    columns: list[str]
    roles: list[str]
    latest_date: str | None = None
    observed_days: int = 0


@dataclass(frozen=True)
class Result:
    file: str
    compatible: bool
    macro_enabled: bool
    sources: list[Source]
    kinds: list[str]
    reason: str | None = None


def column_index(reference: str) -> int:
    letters = "".join(re.findall(r"[A-Za-z]+", str(reference))).upper() or "A"
    value = 0
    for letter in letters:
        value = value * 26 + ord(letter) - 64
    return value - 1


def cell_text(cell: ET.Element, shared_strings: list[str]) -> str:
    value = cell.find(f"{{{NS_MAIN}}}v")
    raw = value.text if value is not None and value.text is not None else ""
    if cell.attrib.get("t") == "s":
        try:
            return shared_strings[int(raw)]
        except (ValueError, IndexError):
            return ""
    if cell.attrib.get("t") == "inlineStr":
        return "".join(node.text or "" for node in cell.findall(f".//{{{NS_MAIN}}}t"))
    return raw


def excel_date(value: str) -> str | None:
    text = str(value or "").strip()
    try:
        number = float(text)
        moment = datetime(1899, 12, 30, tzinfo=timezone.utc) + timedelta(days=number)
        if 2000 <= moment.year <= 2100:
            return moment.date().isoformat()
    except (ValueError, OverflowError):
        pass
    for pattern, order in ((r"^(\d{4})-(\d{2})-(\d{2})", (1, 2, 3)), (r"^(\d{1,2})[/-](\d{1,2})[/-](\d{4})", (3, 2, 1))):
        match = re.match(pattern, text)
        if not match:
            continue
        try:
            return datetime(*(int(match.group(index)) for index in order), tzinfo=timezone.utc).date().isoformat()
        except ValueError:
            return None
    return None


def date_stats(zf: zipfile.ZipFile, sheet_path: str, source: Source, shared_strings: list[str]) -> tuple[str | None, int]:
    date_header = next((header for header in ("FechaHora", "Fecha") if header in source.columns), None)
    if not date_header or sheet_path not in zf.namelist():
        return None, 0
    start_ref, end_ref = source.reference.split(":") if ":" in source.reference else (source.reference, source.reference)
    start_row = int(re.search(r"\d+", start_ref).group())
    end_row = int(re.search(r"\d+", end_ref).group())
    target_column = column_index(start_ref) + source.columns.index(date_header)
    dates: set[str] = set()
    with zf.open(sheet_path) as stream:
        for _, node in ET.iterparse(stream, events=("end",)):
            if node.tag != f"{{{NS_MAIN}}}row":
                continue
            row_number = int(node.attrib.get("r", "0") or 0)
            if start_row < row_number <= end_row:
                for cell in node.findall(f"{{{NS_MAIN}}}c"):
                    if column_index(cell.attrib.get("r", "A1")) == target_column:
                        value = excel_date(cell_text(cell, shared_strings))
                        if value:
                            dates.add(value)
                        break
            node.clear()
    return (max(dates), len(dates)) if dates else (None, 0)


def motor_kind(result: Result) -> str:
    kinds = set(result.kinds)
    groups = []
    if "venta" in kinds:
        groups.append("venta")
    if "uso" in kinds:
        groups.append("uso")
    if kinds & {"auditoria_ticket", "auditoria_void", "auditoria_pago"}:
        groups.append("auditoria")
    return "+".join(sorted(groups))


def freshness_key(path: Path, result: Result) -> tuple[str, int, int, int]:
    latest = max((source.latest_date or "" for source in result.sources), default="")
    coverage = max((source.observed_days for source in result.sources), default=0)
    modified = path.stat().st_mtime_ns if path.exists() else 0
    rows = sum(source.rows for source in result.sources)
    return latest, coverage, modified, rows


def select_most_recent(items: Iterable[tuple[Path, Result]]) -> tuple[list[Path], list[Path]]:
    selected_parameters: list[Path] = []
    winners: dict[str, tuple[Path, Result]] = {}
    superseded: list[Path] = []
    for path, result in items:
        kind = motor_kind(result)
        if not kind:
            selected_parameters.append(path)
            continue
        current = winners.get(kind)
        if current is None or freshness_key(path, result) > freshness_key(*current):
            if current is not None:
                superseded.append(current[0])
            winners[kind] = (path, result)
        else:
            superseded.append(path)
    return selected_parameters + [item[0] for item in winners.values()], superseded


def inspect_workbook(path: Path) -> Result:
    suffix = path.suffix.casefold()
    if suffix not in {".xlsm", ".xlsx"}:
        return Result(path.name, False, False, [], [], "Solo se aceptan XLSM o parámetros XLSX")
    try:
        with zipfile.ZipFile(path) as zf:
            names = set(zf.namelist())
            macro_enabled = "xl/vbaProject.bin" in names
            required_parts = {"xl/workbook.xml", "xl/_rels/workbook.xml.rels"}
            if not required_parts.issubset(names) or (suffix == ".xlsm" and not macro_enabled):
                return Result(path.name, False, macro_enabled, [], [], "Contenedor Excel incompleto")

            workbook = ET.fromstring(zf.read("xl/workbook.xml"))
            workbook_rels = relationships(zf, "xl/_rels/workbook.xml.rels")
            sheets: list[tuple[str, str]] = []
            for node in workbook.findall(f".//{{{NS_MAIN}}}sheet"):
                relation_id = node.attrib.get(f"{{{NS_REL}}}id", "")
                target = workbook_rels.get(relation_id, "")
                sheets.append((node.attrib.get("name", "Hoja"), resolve_path("xl/workbook.xml", target)))

            candidates: list[tuple[Source, list[str]]] = []
            for sheet_name, sheet_path in sheets:
                rel_path = relation_path(sheet_path)
                if rel_path not in names:
                    continue
                for target in relationships(zf, rel_path).values():
                    table_path = resolve_path(sheet_path, target)
                    if not table_path.startswith("xl/tables/") or table_path not in names:
                        continue
                    root = ET.fromstring(zf.read(table_path))
                    columns = [
                        node.attrib.get("name", "")
                        for node in root.findall(f".//{{{NS_MAIN}}}tableColumn")
                    ]
                    table_name = root.attrib.get("displayName") or root.attrib.get("name") or sheet_name
                    reference = root.attrib.get("ref", "A1:A1")
                    kinds = structure_kinds(columns)
                    roles = [
                        kind for kind in kinds
                        if (kind in {"venta", "uso", "auditoria_ticket", "auditoria_void", "auditoria_pago"} and is_ac_source(sheet_name))
                        or kind in {"productos", "tienda", "presentaciones", "compostable", "woe", "horneo", "alimentos", "vasos", "crema", "politica_tienda"}
                    ]
                    source = Source(sheet_name, table_name, reference, table_row_count(reference), columns, roles)
                    candidates.append((source, match_structure(columns)[1]))

            selected = [source for source, _ in candidates if source.roles]
            parameter_roles = {"woe", "horneo", "compostable", "alimentos", "vasos", "crema", "politica_tienda"}
            allowed = parameter_roles if suffix == ".xlsx" else set(STRUCTURES)
            selected = [source for source in selected if any(role in allowed for role in source.roles)]
            useful = any(role in (parameter_roles if suffix == ".xlsx" else {"venta", "uso", "auditoria_ticket", "auditoria_void", "auditoria_pago"}) for source in selected for role in source.roles)
            if selected and useful:
                shared_strings: list[str] = []
                if "xl/sharedStrings.xml" in names:
                    shared_root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
                    shared_strings = ["".join(node.text or "" for node in item.findall(f".//{{{NS_MAIN}}}t")) for item in shared_root.findall(f"{{{NS_MAIN}}}si")]
                sheet_paths = dict(sheets)
                selected = [Source(source.sheet, source.table, source.reference, source.rows, source.columns, source.roles, *date_stats(zf, sheet_paths.get(source.sheet, ""), source, shared_strings)) for source in selected]
                kinds = sorted({role for source in selected for role in source.roles})
                return Result(path.name, True, macro_enabled, selected, kinds)

            best_missing = min((missing for _, missing in candidates), key=len, default=list(REQUIRED_HEADERS))
            reason = "No se encontró una tabla compatible"
            if best_missing:
                reason += f". Faltan: {', '.join(best_missing)}"
            return Result(path.name, False, True, [], [], reason)
    except (OSError, zipfile.BadZipFile, ET.ParseError, KeyError) as error:
        return Result(path.name, False, False, [], [], f"No se pudo leer: {type(error).__name__}")


def inspect_xlsm(path: Path) -> Result:
    if path.suffix.casefold() != ".xlsm":
        return Result(path.name, False, False, [], [], "Solo se aceptan archivos .xlsm")
    return inspect_workbook(path)


def find_files(paths: Iterable[Path], folders: Iterable[Path]) -> list[Path]:
    found = [path for path in paths if path.is_file()]
    for folder in folders:
        if folder.is_dir():
            found.extend(path for path in folder.rglob("*") if path.is_file() and path.suffix.casefold() in {".xlsm", ".xlsx"})
    unique = {str(path.resolve()): path.resolve() for path in found}
    return [unique[key] for key in sorted(unique, key=str.casefold)]


def main() -> int:
    parser = argparse.ArgumentParser(description="Prueba compatibilidad XLSM por estructura; lee solo fuentes _ac.")
    parser.add_argument("archivos", nargs="*", type=Path)
    parser.add_argument("--fuentes", action="append", default=[], type=Path, help="Carpeta con uno o más XLSM")
    args = parser.parse_args()
    files = find_files(args.archivos, args.fuentes)
    if not files:
        parser.error("Indica al menos un archivo .xlsm o una carpeta --fuentes")

    results = [inspect_workbook(path) for path in files]
    selected, superseded = select_most_recent((path, result) for path, result in zip(files, results) if result.compatible)
    payload = {
        "compatible": all(result.compatible for result in results),
        "files": len(results),
        "compatible_files": sum(result.compatible for result in results),
        "selected_files": [path.name for path in selected],
        "superseded_files": [path.name for path in superseded],
        "results": [asdict(result) for result in results],
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0 if payload["compatible"] else 2


if __name__ == "__main__":
    sys.exit(main())
