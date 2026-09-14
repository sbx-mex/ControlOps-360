#!/usr/bin/env python3
"""Puerta de calidad integral para Control Ops 360° y sus entregas ZIP."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import stat
import sys
import tempfile
import zipfile
from pathlib import Path, PurePosixPath

try:
    from .auditar_ensamble import audit_interface as audit_assembly_interface
    from .auditar_ensamble import audit_table as audit_assembly_table
    from .auditar_pedido_woe import audit_catalog as audit_woe_catalog
    from .auditar_pedido_woe import audit_interface as audit_woe_interface
except ImportError:  # Ejecución directa: python scripts/auditar_proyecto.py
    from auditar_ensamble import audit_interface as audit_assembly_interface
    from auditar_ensamble import audit_table as audit_assembly_table
    from auditar_pedido_woe import audit_catalog as audit_woe_catalog
    from auditar_pedido_woe import audit_interface as audit_woe_interface


ROOT = Path(__file__).resolve().parents[1]
DATA_SUFFIXES = {".csv", ".tsv", ".xls", ".xlsx", ".xlsm", ".xlsb"}
MAX_ZIP_ENTRIES = 800
MAX_ZIP_FILE = 25 * 1024 * 1024
MAX_ZIP_TOTAL = 80 * 1024 * 1024
REQUIRED_FILES = {
    ".github/workflows/validar-motores.yml",
    "VERSION",
    "README.md",
    "SECURITY.md",
    "UPDATE_MANIFEST.json",
    "index.html",
    "assets/app.js",
    "assets/assembly.mjs",
    "assets/control-ops-360.svg",
    "assets/engine.mjs",
    "assets/export.mjs",
    "assets/operations.mjs",
    "assets/parameters.mjs",
    "assets/reader.mjs",
    "assets/styles.css",
    "assets/transit.mjs",
    "scripts/auditar_proyecto.py",
    "scripts/crear_zip_seguro.py",
}
LEGACY_DOCS = {
    "ACTUALIZACION_ENSAMBLE.md",
    "ACTUALIZACION_PEDIDO_WOE.md",
    "ACTUALIZACION_TOP_ESFUERZO.md",
    "ACTUALIZACION_V5.md",
    "AUDITORIA_VOIDS_LEEME.md",
    "NORMALIZADOS_LEEME.md",
    "ENSAMBLE_MANIFEST.json",
    "PEDIDO_WOE_MANIFEST.json",
    "TOP_ESFUERZO_MANIFEST.json",
}
MODULES = ("maxmin", "trend", "order", "peak", "normal", "assembly", "baking", "top", "effort", "audit")


class AuditError(AssertionError):
    """Falla cerrada y legible para CI."""


def _read(relative: str, root: Path = ROOT) -> str:
    path = root / relative
    if not path.is_file():
        raise AuditError(f"Falta archivo requerido: {relative}")
    return path.read_text(encoding="utf-8")


def _project_files(root: Path) -> list[Path]:
    return sorted(
        path
        for path in root.rglob("*")
        if path.is_file() and ".git" not in path.relative_to(root).parts and "__pycache__" not in path.parts
    )


def audit_structure(root: Path = ROOT) -> dict[str, object]:
    missing = sorted(path for path in REQUIRED_FILES if not (root / path).is_file())
    if missing:
        raise AuditError("Estructura incompleta: " + ", ".join(missing))
    redundant = sorted(path for path in LEGACY_DOCS if (root / path).exists())
    if redundant:
        raise AuditError("Documentación redundante pendiente: " + ", ".join(redundant))
    version = _read("VERSION", root).strip()
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise AuditError(f"VERSION no es semántica: {version!r}")
    return {"archivos_requeridos": len(REQUIRED_FILES), "documentos_redundantes": 0, "version": version}


def audit_security(root: Path = ROOT) -> dict[str, object]:
    files = _project_files(root)
    data_files = [str(path.relative_to(root)) for path in files if path.suffix.lower() in DATA_SUFFIXES]
    if data_files:
        raise AuditError("Hay bases operativas en el proyecto: " + ", ".join(data_files))
    dangerous = [
        str(path.relative_to(root))
        for path in files
        if path.name.lower() in {".env", "id_rsa", "id_ed25519"} or path.suffix.lower() in {".pem", ".p12", ".pfx", ".key"}
    ]
    if dangerous:
        raise AuditError("Hay archivos sensibles en el proyecto: " + ", ".join(dangerous))
    index = _read("index.html", root)
    required_policy = ("default-src 'self'", "connect-src 'none'", "object-src 'none'", "form-action 'none'", "frame-src 'none'")
    if not all(rule in index for rule in required_policy):
        raise AuditError("La política CSP no está cerrada para procesamiento local.")
    scripts = "\n".join(path.read_text(encoding="utf-8") for path in files if path.suffix in {".js", ".mjs"} and "vendor" not in path.parts)
    if re.search(r"\b(fetch|XMLHttpRequest|WebSocket)\s*\(", scripts):
        raise AuditError("Se detectó una salida de red en el código de aplicación.")
    workflow = _read(".github/workflows/validar-motores.yml", root)
    uses = re.findall(r"^\s*uses:\s*([^\s#]+)", workflow, flags=re.MULTILINE)
    if not uses or any(not re.fullmatch(r"[^@]+@[0-9a-f]{40}", action) for action in uses):
        raise AuditError("Todas las acciones de GitHub deben estar fijadas a un SHA completo.")
    requirements = _read("requirements-dev.txt", root)
    packages = [line for line in requirements.splitlines() if line and not line.startswith((" ", "#", "--hash"))]
    if not packages or requirements.count("--hash=sha256:") < len(packages):
        raise AuditError("Las dependencias Python deben tener versión y hash.")
    svg = _read("assets/control-ops-360.svg", root)
    if "<script" in svg.lower() or re.search(r"(?:href|src)=[\"']https?://", svg, re.I):
        raise AuditError("El icono SVG contiene contenido externo o ejecutable.")
    return {"bases_operativas": 0, "archivos_sensibles": 0, "csp_local": True, "acciones_fijadas": len(uses), "dependencias_con_hash": len(packages)}


def audit_integration(root: Path = ROOT) -> dict[str, object]:
    ui = _read("assets/ui.mjs", root)
    operations = _read("assets/operations.mjs", root)
    export = _read("assets/export.mjs", root)
    index = _read("index.html", root)
    missing_modules = [module for module in MODULES if f"id:'{module}'" not in operations or f"{module}:" not in ui]
    if missing_modules:
        raise AuditError("Módulos no integrados en navegación: " + ", ".join(missing_modules))
    missing_exports = [module for module in MODULES if f"if(module==='{module}')" not in operations]
    if missing_exports:
        raise AuditError("Módulos sin reporte estable: " + ", ".join(missing_exports))
    visible_contract = (
        "JUNTÉMONOS MÁS",
        "#GreenApronService",
        "CONFIDENCIAL · USO OPERATIVO INTERNO",
        "Diseñador por Jorge Alcantar Aguiar &amp; Enrique César Flores",
        "https://sbx-mex.github.io/CodeBrew_Merch/",
        "https://sbx-mex.github.io/Lay-Out_2.0/",
    )
    visible_surface = index + "\n" + ui
    if not all(token in visible_surface for token in visible_contract):
        raise AuditError("Identidad, confidencialidad o proyectos conectados incompletos.")
    export_contract = ("CONFIDENCIAL · USO OPERATIVO INTERNO", "Diseñador por Jorge Alcantar Aguiar", "Enrique César Flores", "headerFooter")
    if not all(token in export for token in export_contract):
        raise AuditError("El pie de exportación no está unificado.")
    obsolete = ("Exportar diagnóstico", "demoButton", "archivo_patron", "Uso pendiente hoy", "Base de vasos")
    app_surface = "\n".join((_read("index.html", root), _read("assets/app.js", root), _read("assets/engine.mjs", root), export, ui))
    found = [token for token in obsolete if token in app_surface]
    if found:
        raise AuditError("Lógica obsoleta detectada: " + ", ".join(found))
    return {
        "modulos_navegables": len(MODULES),
        "modulos_exportables": len(MODULES),
        "pedido_woe": audit_woe_interface(root),
        "ensamble": audit_assembly_interface(root),
    }


def audit_crosses(root: Path = ROOT) -> dict[str, object]:
    return {"woe": audit_woe_catalog(root), "ensamble": audit_assembly_table(root)}


def audit_project(root: Path = ROOT) -> dict[str, object]:
    return {
        "estado": "VERDE",
        "estructura": audit_structure(root),
        "seguridad": audit_security(root),
        "integracion_360": audit_integration(root),
        "cruces": audit_crosses(root),
    }


def _logical_names(entries: list[zipfile.ZipInfo]) -> tuple[str, dict[str, zipfile.ZipInfo]]:
    file_entries = [entry for entry in entries if not entry.is_dir()]
    first_parts = {PurePosixPath(entry.filename).parts[0] for entry in file_entries if PurePosixPath(entry.filename).parts}
    root = next(iter(first_parts)) if len(first_parts) == 1 and all(len(PurePosixPath(entry.filename).parts) > 1 for entry in file_entries) else ""
    logical: dict[str, zipfile.ZipInfo] = {}
    casefolded: set[str] = set()
    for entry in file_entries:
        parts = PurePosixPath(entry.filename).parts
        name = "/".join(parts[1:] if root else parts)
        folded = name.casefold()
        if folded in casefolded:
            raise AuditError(f"ZIP contiene rutas duplicadas por mayúsculas: {name}")
        casefolded.add(folded)
        logical[name] = entry
    return root, logical


def audit_zip(path: Path) -> dict[str, object]:
    path = Path(path)
    if not path.is_file() or not zipfile.is_zipfile(path):
        raise AuditError(f"No es un ZIP válido: {path}")
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        if not entries or len(entries) > MAX_ZIP_ENTRIES:
            raise AuditError(f"Cantidad de entradas ZIP no permitida: {len(entries)}")
        total = 0
        for entry in entries:
            raw = entry.filename
            pure = PurePosixPath(raw)
            if not raw or "\x00" in raw or "\\" in raw or pure.is_absolute() or ".." in pure.parts:
                raise AuditError(f"Ruta ZIP insegura: {raw!r}")
            if entry.flag_bits & 0x1:
                raise AuditError(f"ZIP cifrado no permitido: {raw}")
            mode = entry.external_attr >> 16
            if stat.S_ISLNK(mode):
                raise AuditError(f"Enlace simbólico no permitido: {raw}")
            if entry.file_size > MAX_ZIP_FILE:
                raise AuditError(f"Entrada ZIP demasiado grande: {raw}")
            total += entry.file_size
            if total > MAX_ZIP_TOTAL:
                raise AuditError("El contenido descomprimido supera 80 MB.")
            if entry.file_size > 1024 * 1024 and entry.compress_size and entry.file_size / entry.compress_size > 200:
                raise AuditError(f"Relación de compresión sospechosa: {raw}")
        archive_root, logical = _logical_names(entries)
        data = sorted(name for name in logical if Path(name).suffix.lower() in DATA_SUFFIXES)
        if data:
            raise AuditError("El ZIP contiene bases operativas: " + ", ".join(data))
        sensitive = sorted(name for name in logical if Path(name).name.lower() in {".env", "id_rsa", "id_ed25519"} or Path(name).suffix.lower() in {".pem", ".p12", ".pfx", ".key"})
        if sensitive:
            raise AuditError("El ZIP contiene archivos sensibles: " + ", ".join(sensitive))
        missing = sorted(REQUIRED_FILES - logical.keys())
        if missing:
            raise AuditError("ZIP incompleto: " + ", ".join(missing))
        manifest_name = "ZIP_MANIFEST.sha256"
        if manifest_name not in logical:
            raise AuditError("ZIP sin ZIP_MANIFEST.sha256")
        manifest_text = archive.read(logical[manifest_name]).decode("utf-8")
        expected: dict[str, str] = {}
        for line in manifest_text.splitlines():
            match = re.fullmatch(r"([0-9a-f]{64})  (.+)", line)
            if not match:
                raise AuditError("ZIP_MANIFEST.sha256 tiene formato inválido.")
            digest, name = match.groups()
            if name in expected:
                raise AuditError(f"Ruta duplicada en manifiesto: {name}")
            expected[name] = digest
        payload = {name: entry for name, entry in logical.items() if name != manifest_name}
        if set(expected) != set(payload):
            raise AuditError("El manifiesto ZIP no coincide con el contenido.")
        for name, entry in payload.items():
            digest = hashlib.sha256(archive.read(entry)).hexdigest()
            if digest != expected[name]:
                raise AuditError(f"Huella ZIP inválida: {name}")
        with tempfile.TemporaryDirectory(prefix="controlops-zip-audit-") as temporary:
            extracted = Path(temporary) / "project"
            for name, entry in payload.items():
                destination = extracted / name
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(archive.read(entry))
            audit_structure(extracted)
            audit_security(extracted)
            audit_integration(extracted)
            audit_crosses(extracted)
    return {"estado": "VERDE", "archivo": path.name, "raiz": archive_root, "entradas": len(entries), "bytes_descomprimidos": total, "huellas": len(expected), "contenido_validado": True}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zip", type=Path, help="ZIP de entrega que también debe auditarse")
    parser.add_argument("--json", action="store_true", help="Emitir resultado JSON")
    args = parser.parse_args(argv)
    try:
        report = audit_project()
        if args.zip:
            report["zip"] = audit_zip(args.zip)
        if args.json:
            print(json.dumps(report, ensure_ascii=False, indent=2))
        else:
            print(f"VERDE · {report['estructura']['version']} · integración 360° validada")
        return 0
    except Exception as error:  # noqa: BLE001 - la puerta de CI falla cerrada.
        failure = {"estado": "ROJO", "error": str(error)}
        print(json.dumps(failure, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
