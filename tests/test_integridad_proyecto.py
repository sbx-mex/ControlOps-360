import hashlib
import tempfile
import unittest
import zipfile
from pathlib import Path

from scripts.auditar_proyecto import AuditError, audit_project, audit_zip
from scripts.crear_zip_seguro import create_archive


class ProjectIntegrityTests(unittest.TestCase):
    def test_complete_project_is_green(self):
        report = audit_project()
        self.assertEqual(report["estado"], "VERDE")
        self.assertEqual(report["integracion_360"]["modulos_navegables"], 10)
        self.assertEqual(report["seguridad"]["bases_operativas"], 0)
        self.assertLessEqual(report["rendimiento"]["grafo_inicial_bytes"], report["rendimiento"]["presupuesto_bytes"])
        self.assertGreater(report["rendimiento"]["reduccion_porcentaje"], 60)

    def test_official_zip_is_manifested_and_green(self):
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / "ControlOps-360.zip"
            created = create_archive(target)
            audited = audit_zip(target)
            self.assertEqual(created["sha256"], __import__("hashlib").sha256(target.read_bytes()).hexdigest())
            self.assertEqual(audited["estado"], "VERDE")
            self.assertGreater(audited["huellas"], 20)

    def test_zip_rejects_path_traversal(self):
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / "unsafe.zip"
            with zipfile.ZipFile(target, "w") as archive:
                archive.writestr("../salida.txt", "no")
            with self.assertRaisesRegex(AuditError, "Ruta ZIP insegura"):
                audit_zip(target)

    def test_zip_rejects_operational_workbook(self):
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / "data.zip"
            with zipfile.ZipFile(target, "w") as archive:
                archive.writestr("ControlOps-360/tienda.xlsx", b"PK")
            with self.assertRaisesRegex(AuditError, "bases operativas"):
                audit_zip(target)

    def test_zip_reaudits_manifested_content(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / "source.zip"
            target = Path(temporary) / "tampered.zip"
            create_archive(source)
            with zipfile.ZipFile(source) as archive:
                files = {entry.filename: archive.read(entry) for entry in archive.infolist() if not entry.is_dir()}
            prefix = next(name.split("/", 1)[0] for name in files)
            index_name = f"{prefix}/index.html"
            files[index_name] = files[index_name].replace(b"connect-src 'none'; ", b"")
            manifest_name = f"{prefix}/ZIP_MANIFEST.sha256"
            logical = {
                name.split("/", 1)[1]: data
                for name, data in files.items()
                if name != manifest_name
            }
            files[manifest_name] = (
                "\n".join(f"{hashlib.sha256(data).hexdigest()}  {name}" for name, data in sorted(logical.items())) + "\n"
            ).encode()
            with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                for name, data in files.items():
                    archive.writestr(name, data)
            with self.assertRaisesRegex(AuditError, "CSP"):
                audit_zip(target)


if __name__ == "__main__":
    unittest.main()
