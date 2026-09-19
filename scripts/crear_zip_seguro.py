#!/usr/bin/env python3
"""Crea una entrega ZIP determinista, sin bases y con manifiesto SHA-256."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import tempfile
import zipfile
from pathlib import Path, PurePosixPath

try:
    from .auditar_proyecto import ROOT, AuditError, audit_project, audit_zip
except ImportError:  # Ejecución directa desde scripts/.
    from auditar_proyecto import ROOT, AuditError, audit_project, audit_zip


FIXED_TIME = (2026, 1, 1, 0, 0, 0)
GENERATED_ROOT_FILES = frozenset({"zip_manifest.sha256"})


def project_files(root: Path, output: Path) -> list[Path]:
    command = ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"]
    completed = subprocess.run(command, cwd=root, check=True, capture_output=True)
    names = sorted(filter(None, completed.stdout.decode("utf-8").split("\0")))
    selected: list[Path] = []
    output_resolved = output.resolve()
    for name in names:
        logical_name = PurePosixPath(name).as_posix()
        if logical_name.casefold() in GENERATED_ROOT_FILES:
            continue
        path = root / name
        if path.resolve() == output_resolved or path.suffix.lower() == ".zip" or "__pycache__" in path.parts:
            continue
        if not path.exists():
            raise AuditError(f"Archivo registrado ausente: {name}")
        if path.is_symlink():
            raise AuditError(f"Enlace simbólico no permitido en la entrega: {name}")
        if path.is_file():
            selected.append(path)
    return selected


def _entry(name: str, executable: bool = False) -> zipfile.ZipInfo:
    info = zipfile.ZipInfo(name, FIXED_TIME)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.create_system = 3
    info.external_attr = ((0o100755 if executable else 0o100644) << 16)
    info.flag_bits |= 0x800
    return info


def create_archive(output: Path, root: Path = ROOT) -> dict[str, object]:
    output = Path(output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    audit_project(root)
    files = project_files(root, output)
    if not files:
        raise AuditError("No hay archivos para empacar.")
    version = (root / "VERSION").read_text(encoding="utf-8").strip()
    archive_root = f"ControlOps-360-v{version}"
    payload: list[tuple[str, bytes, bool]] = []
    manifest: list[str] = []
    logical_names: set[str] = set()
    for path in files:
        relative = path.relative_to(root).as_posix()
        folded = relative.casefold()
        if folded in logical_names:
            raise AuditError(f"Rutas duplicadas por mayúsculas antes de empacar: {relative}")
        logical_names.add(folded)
        data = path.read_bytes()
        if len(data) > 25 * 1024 * 1024:
            raise AuditError(f"Archivo demasiado grande para la entrega: {relative}")
        manifest.append(f"{hashlib.sha256(data).hexdigest()}  {relative}")
        payload.append((relative, data, os.access(path, os.X_OK)))
    manifest_data = ("\n".join(manifest) + "\n").encode("utf-8")
    temporary_name = ""
    try:
        with tempfile.NamedTemporaryFile(prefix=".controlops-", suffix=".zip", dir=output.parent, delete=False) as temporary:
            temporary_name = temporary.name
        with zipfile.ZipFile(temporary_name, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9, strict_timestamps=True) as archive:
            archive.comment = b"Control Ops 360 - entrega validada"
            for relative, data, executable in payload:
                archive.writestr(_entry(f"{archive_root}/{relative}", executable), data, compresslevel=9)
            archive.writestr(_entry(f"{archive_root}/ZIP_MANIFEST.sha256"), manifest_data, compresslevel=9)
        Path(temporary_name).replace(output)
        temporary_name = ""
    finally:
        if temporary_name:
            Path(temporary_name).unlink(missing_ok=True)
    result = audit_zip(output)
    result["sha256"] = hashlib.sha256(output.read_bytes()).hexdigest()
    result["bytes_zip"] = output.stat().st_size
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="Ruta del ZIP a generar")
    args = parser.parse_args(argv)
    try:
        print(json.dumps(create_archive(args.output), ensure_ascii=False, indent=2))
        return 0
    except Exception as error:  # noqa: BLE001 - el generador falla cerrado.
        print(json.dumps({"estado": "ROJO", "error": str(error)}, ensure_ascii=False, indent=2))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
