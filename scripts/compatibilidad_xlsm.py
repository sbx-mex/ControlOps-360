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
}
REQUIRED_HEADERS = STRUCTURES["venta"]


def normalize(value: object) -> str:
    decoded = re.sub(r"_x[0-9a-fA-F]{4}_", " ", str(value or ""))
    text = unicodedata.normalize("NFKD", decoded)
    ascii_text = "".join(char for char in text if not unicodedata.combining(char))
    return re.sub(r"[^a-zA-Z0-9]+", "", ascii_text).casefold()


def is_ac_source(*values: object) -> bool:
    return any(re.search(r"(?:^|[\s_-])ac$", str(value or "").strip(), re.IGNORECASE) for value in values)


def match_structure(headers: Iterable[str], kind: str = "venta") -> tuple[bool, list[str]]:
    available = {normalize(header) for header in headers}
    missing = [header for header in STRUCTURES[kind] if normalize(header) not in available]
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


@dataclass(frozen=True)
class Result:
    file: str
    compatible: bool
    macro_enabled: bool
    sources: list[Source]
    kinds: list[str]
    reason: str | None = None


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
                        or kind in {"productos", "tienda", "presentaciones", "compostable", "woe", "horneo"}
                    ]
                    source = Source(sheet_name, table_name, reference, table_row_count(reference), columns, roles)
                    candidates.append((source, match_structure(columns)[1]))

            selected = [source for source, _ in candidates if source.roles]
            allowed = {"woe", "horneo", "compostable"} if suffix == ".xlsx" else set(STRUCTURES)
            selected = [source for source in selected if any(role in allowed for role in source.roles)]
            useful = any(role in ({"woe", "horneo", "compostable"} if suffix == ".xlsx" else {"venta", "uso", "auditoria_ticket", "auditoria_void", "auditoria_pago"}) for source in selected for role in source.roles)
            if selected and useful:
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
    payload = {
        "compatible": all(result.compatible for result in results),
        "files": len(results),
        "compatible_files": sum(result.compatible for result in results),
        "results": [asdict(result) for result in results],
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0 if payload["compatible"] else 2


if __name__ == "__main__":
    sys.exit(main())
