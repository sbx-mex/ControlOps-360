import hashlib
from pathlib import Path
import shutil
import tempfile
import unittest
import zipfile

from scripts.auditar_descargas import (
    APPROVED_DOWNLOADS, APPROVED_TEMPLATES, DownloadError, ROOT,
    audit_downloads, inspect_template,
)
from scripts.auditar_proyecto import AuditError, audit_security


class DownloadTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        for name in [*APPROVED_DOWNLOADS, 'index.html']:
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, target)

    def test_originals_and_visible_downloads_are_verified(self):
        report = audit_downloads(self.root)
        self.assertEqual(report['estado'], 'VERDE')
        self.assertEqual(report['enlaces_verificados'], 4)
        self.assertEqual(sum(item['tablas'] for item in report['plantillas']), 21)

    def test_missing_manual_is_rejected(self):
        (self.root / 'downloads/Manual_Control_Ops_360.pdf').unlink()
        with self.assertRaisesRegex(DownloadError, 'Falta descarga'):
            audit_downloads(self.root)

    def test_modified_template_is_rejected(self):
        path = self.root / sorted(APPROVED_TEMPLATES)[0]
        path.write_bytes(path.read_bytes() + b'changed')
        with self.assertRaisesRegex(DownloadError, 'Huella'):
            audit_downloads(self.root)

    def test_filled_operational_table_is_rejected_even_with_matching_hash(self):
        path = self.root / sorted(APPROVED_TEMPLATES)[1]
        with zipfile.ZipFile(path) as archive:
            content = {name: archive.read(name) for name in archive.namelist()}
        # sheet2 is uso_base. Add a real value in its first data row.
        name = 'xl/worksheets/sheet2.xml'
        content[name] = content[name].replace(b'</sheetData>', b'<row r="3"><c r="A3"><v>99999</v></c></row></sheetData>')
        content[name] = content[name].replace(b'ref="A1:I2"', b'ref="A1:I3"')
        with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as archive:
            for name, data in content.items():
                archive.writestr(name, data)
        with self.assertRaisesRegex(DownloadError, 'registros operativos'):
            inspect_template(path, hashlib.sha256(path.read_bytes()).hexdigest())

    def test_broken_visible_link_is_rejected(self):
        path = self.root / 'index.html'
        path.write_text(path.read_text().replace('href="downloads/Manual_Control_Ops_360.pdf"', 'href="downloads/missing.pdf"'))
        with self.assertRaisesRegex(DownloadError, 'descargas visibles'):
            audit_downloads(self.root)

    def test_operational_workbook_outside_allowlist_is_rejected(self):
        (self.root / 'datos_tienda.xlsx').write_bytes(b'PK')
        with self.assertRaisesRegex(AuditError, 'bases operativas'):
            audit_security(self.root)


if __name__ == '__main__':
    unittest.main()
