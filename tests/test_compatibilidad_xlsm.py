import importlib.util
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

SCRIPT = Path(__file__).parents[1] / "scripts" / "compatibilidad_xlsm.py"
SPEC = importlib.util.spec_from_file_location("compatibilidad_xlsm", SCRIPT)
MOD = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MOD
SPEC.loader.exec_module(MOD)

MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
DOC_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships"


def make_xlsm(path: Path, tables: list[tuple[str, str, list[str]]], macros: bool = True) -> None:
    sheets_xml = []
    workbook_rels = []
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        for index, (sheet_name, table_name, headers) in enumerate(tables, 1):
            sheets_xml.append(f'<sheet name="{sheet_name}" sheetId="{index}" r:id="rId{index}"/>')
            workbook_rels.append(
                f'<Relationship Id="rId{index}" Type="{DOC_REL}/worksheet" Target="worksheets/sheet{index}.xml"/>'
            )
            zf.writestr(
                f"xl/worksheets/_rels/sheet{index}.xml.rels",
                f'<Relationships xmlns="{PKG_REL}"><Relationship Id="rId1" Type="{DOC_REL}/table" Target="../tables/table{index}.xml"/></Relationships>',
            )
            columns = "".join(
                f'<tableColumn id="{column_index}" name="{header}"/>'
                for column_index, header in enumerate(headers, 1)
            )
            end_column = chr(64 + len(headers))
            zf.writestr(
                f"xl/tables/table{index}.xml",
                f'<table xmlns="{MAIN}" name="{table_name}" displayName="{table_name}" ref="A1:{end_column}11">'
                f'<tableColumns count="{len(headers)}">{columns}</tableColumns></table>',
            )
        zf.writestr(
            "xl/workbook.xml",
            f'<workbook xmlns="{MAIN}" xmlns:r="{DOC_REL}"><sheets>{"".join(sheets_xml)}</sheets></workbook>',
        )
        zf.writestr(
            "xl/_rels/workbook.xml.rels",
            f'<Relationships xmlns="{PKG_REL}">{"".join(workbook_rels)}</Relationships>',
        )
        if macros:
            zf.writestr("xl/vbaProject.bin", b"synthetic")


class CompatibilityTests(unittest.TestCase):
    def test_filename_is_irrelevant_and_ac_is_selected(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "descarga (2).xlsm"
            headers = list(MOD.REQUIRED_HEADERS) + ["ModoOrdenDesc"]
            make_xlsm(path, [("datos_base", "datos_base", headers), ("datos_ac", "datos_ac", headers)])
            result = MOD.inspect_xlsm(path)
            self.assertTrue(result.compatible)
            self.assertEqual([source.sheet for source in result.sources], ["datos_ac"])
            self.assertEqual(result.sources[0].rows, 10)

    def test_structure_is_required_even_when_name_ends_ac(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "Normalizados.xlsm"
            make_xlsm(path, [("detalleventa_ac", "detalleventa_ac", ["IDTienda", "Ticket"])])
            result = MOD.inspect_xlsm(path)
            self.assertFalse(result.compatible)
            self.assertIn("Faltan:", result.reason)

    def test_table_name_does_not_replace_ac_sheet(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "Normalizados.xlsm"
            make_xlsm(path, [("detalleventa_base", "detalleventa_ac", list(MOD.REQUIRED_HEADERS))])
            self.assertFalse(MOD.inspect_xlsm(path).compatible)

    def test_macro_container_is_required(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "archivo.xlsm"
            make_xlsm(path, [("datos_ac", "datos_ac", list(MOD.REQUIRED_HEADERS))], macros=False)
            result = MOD.inspect_xlsm(path)
            self.assertFalse(result.compatible)
            self.assertFalse(result.macro_enabled)

    def test_multiple_renamed_files_are_discovered(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            headers = list(MOD.REQUIRED_HEADERS)
            make_xlsm(root / "Normalizados (1).xlsm", [("uno_ac", "uno_ac", headers)])
            make_xlsm(root / "copia tienda.xlsm", [("dos_ac", "dos_ac", headers)])
            files = MOD.find_files([], [root])
            self.assertEqual(len(files), 2)
            self.assertTrue(all(MOD.inspect_xlsm(path).compatible for path in files))

    def test_xlsx_is_accepted_only_as_known_parameter(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            good = root / "catalogo (2).xlsx"
            make_xlsm(good, [("Tabla", "Tabla", list(MOD.STRUCTURES["woe"]))], macros=False)
            self.assertTrue(MOD.inspect_workbook(good).compatible)
            bad = root / "base.xlsx"
            make_xlsm(bad, [("Datos", "Datos", ["ID", "Nombre"])], macros=False)
            self.assertFalse(MOD.inspect_workbook(bad).compatible)

    def test_auditoria_ac_works_without_sales(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "Auditoria copia.xlsm"
            make_xlsm(path, [("void_ac", "Tabla12", list(MOD.STRUCTURES["auditoria_void"]))])
            result = MOD.inspect_xlsm(path)
            self.assertTrue(result.compatible)
            self.assertIn("auditoria_void", result.kinds)


if __name__ == "__main__":
    unittest.main()
