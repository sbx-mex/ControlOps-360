#!/usr/bin/env python3
"""Audita metadatos de libros Excel sin modificarlos ni ejecutar sus macros."""

from __future__ import annotations

import argparse
import fnmatch
import json
import sys
import zipfile
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable
from xml.etree import ElementTree as ET

NS_MAIN = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


@dataclass
class Libro:
    ruta: str
    hojas: list[str]
    tablas: list[str]
    error: str | None = None


def _nombres_hojas(zf: zipfile.ZipFile) -> list[str]:
    root = ET.fromstring(zf.read("xl/workbook.xml"))
    return [node.attrib.get("name", "") for node in root.findall("m:sheets/m:sheet", NS_MAIN)]


def _nombres_tablas(zf: zipfile.ZipFile) -> list[str]:
    nombres: list[str] = []
    for item in zf.namelist():
        if not item.startswith("xl/tables/table") or not item.endswith(".xml"):
            continue
        root = ET.fromstring(zf.read(item))
        nombre = root.attrib.get("displayName") or root.attrib.get("name")
        if nombre:
            nombres.append(nombre)
    return sorted(set(nombres), key=str.casefold)


def inspeccionar_libro(ruta: Path) -> Libro:
    try:
        with zipfile.ZipFile(ruta, "r") as zf:
            return Libro(str(ruta), _nombres_hojas(zf), _nombres_tablas(zf))
    except Exception as exc:  # diagnóstico: el error debe quedar en el reporte
        return Libro(str(ruta), [], [], f"{type(exc).__name__}: {exc}")


def _coincide(valor: str, opciones: Iterable[str]) -> bool:
    normal = valor.strip().casefold()
    return any(normal == opcion.strip().casefold() for opcion in opciones)


def _buscar_archivos(carpeta: Path, patron: str) -> list[Path]:
    candidatos = [p for p in carpeta.rglob("*") if p.is_file() and p.suffix.casefold() in {".xlsx", ".xlsm"}]
    return sorted((p for p in candidatos if fnmatch.fnmatch(p.name.casefold(), patron.casefold())), key=lambda p: str(p).casefold())


def auditar(config: dict, carpeta: Path) -> dict:
    resultados = []
    bloqueos = 0
    for modulo in config.get("modulos", []):
        archivos = _buscar_archivos(carpeta, modulo["archivo_patron"])
        libros = [inspeccionar_libro(p) for p in archivos]
        hojas_encontradas = sorted({h for libro in libros for h in libro.hojas if _coincide(h, modulo.get("hojas_aceptadas", []))})
        tablas_encontradas = sorted({t for libro in libros for t in libro.tablas if _coincide(t, modulo.get("tablas_aceptadas", []))})
        errores = [asdict(libro) for libro in libros if libro.error]

        razones = []
        if not archivos:
            razones.append("archivo_no_encontrado")
        if archivos and not hojas_encontradas:
            razones.append("hoja_esperada_no_encontrada")
        if archivos and modulo.get("tablas_aceptadas") and not tablas_encontradas:
            razones.append("tabla_excel_no_encontrada")
        if errores:
            razones.append("libro_no_legible")

        estado = "LISTO_PARA_MAPEO" if not razones else "BLOQUEADO"
        bloqueos += estado == "BLOQUEADO"
        resultados.append({
            "modulo": modulo["id"],
            "estado": estado,
            "modo": modulo.get("modo"),
            "archivos": [str(p) for p in archivos],
            "hojas_encontradas": hojas_encontradas,
            "tablas_encontradas": tablas_encontradas,
            "columnas_clave_declaradas": modulo.get("columnas_clave", []),
            "razones": razones,
            "errores": errores,
        })

    return {
        "proyecto": config.get("proyecto", "ControlOps 360"),
        "version": config.get("version"),
        "carpeta_fuentes": str(carpeta),
        "modulos_revisados": len(resultados),
        "modulos_bloqueados": bloqueos,
        "resultado": "REQUIERE_AJUSTES" if bloqueos else "LISTO_PARA_INTEGRACION",
        "detalle": resultados,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Audita conexiones Excel de ControlOps 360 sin modificar fuentes.")
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--fuentes", required=True, type=Path)
    parser.add_argument("--salida", default=Path("diagnostico_controlops.json"), type=Path)
    args = parser.parse_args()

    if not args.config.is_file():
        parser.error(f"No existe el archivo de configuración: {args.config}")
    if not args.fuentes.is_dir():
        parser.error(f"No existe la carpeta de fuentes: {args.fuentes}")

    config = json.loads(args.config.read_text(encoding="utf-8"))
    reporte = auditar(config, args.fuentes.resolve())
    args.salida.write_text(json.dumps(reporte, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: reporte[k] for k in ("resultado", "modulos_revisados", "modulos_bloqueados")}, ensure_ascii=False))
    return 2 if reporte["modulos_bloqueados"] else 0


if __name__ == "__main__":
    sys.exit(main())

