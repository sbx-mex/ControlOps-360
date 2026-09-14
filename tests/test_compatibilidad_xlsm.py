import importlib.util
import os
import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from datetime import date, timedelta
from pathlib import Path

SCRIPT = Path(__file__).parents[1] / "scripts" / "compatibilidad_xlsm.py"
SPEC = importlib.util.spec_from_file_location("compatibilidad_xlsm", SCRIPT)
MOD = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MOD
SPEC.loader.exec_module(MOD)

MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
DOC_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships"


def excel_column(index: int) -> str:
    value = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        value = chr(65 + remainder) + value
    return value


def make_xlsm(path: Path, tables: list[tuple[str, str, list[str]]], macros: bool = True, first_day: date = date(2026, 8, 24), stores: tuple[int, ...] = (38368,)) -> None:
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
            end_column = excel_column(len(headers))
            zf.writestr(
                f"xl/tables/table{index}.xml",
                f'<table xmlns="{MAIN}" name="{table_name}" displayName="{table_name}" ref="A1:{end_column}11">'
                f'<tableColumns count="{len(headers)}">{columns}</tableColumns></table>',
            )
            date_header = next((header for header in ("FechaHora", "FechaCierre", "Fecha") if header in headers), None)
            date_column = excel_column(headers.index(date_header) + 1) if date_header else "A"
            store_header = next((header for header in ("IDTienda", "CeCo", "CC") if header in headers), None)
            store_column = excel_column(headers.index(store_header) + 1) if store_header else ""
            date_rows = ""
            if date_header or store_header:
                rows = []
                for row in range(2, 12):
                    cells = []
                    if date_header:
                        cells.append(f'<c r="{date_column}{row}" t="inlineStr"><is><t>{first_day + timedelta(days=row - 2)}</t></is></c>')
                    if store_header and stores:
                        store = stores[(row - 2) % len(stores)]
                        cells.append(f'<c r="{store_column}{row}" t="inlineStr"><is><t>{store}</t></is></c>')
                    rows.append(f'<row r="{row}">{"".join(cells)}</row>')
                date_rows = "".join(rows)
            zf.writestr(
                f"xl/worksheets/sheet{index}.xml",
                f'<worksheet xmlns="{MAIN}"><sheetData>{date_rows}</sheetData></worksheet>',
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
    def test_food_flag_and_piece_count_are_distinct_columns(self):
        headers = list(MOD.STRUCTURES["alimentos"])
        self.assertTrue(MOD.match_structure(headers, "alimentos")[0])
        self.assertFalse(MOD.match_structure([h for h in headers if h != "#Alimento"], "alimentos")[0])
        self.assertFalse(MOD.match_structure(headers + ["Ítem"], "alimentos")[0])

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

    def test_auditoria_tienda_legacy_accepts_only_base_void(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "Auditoria_Tienda.xlsm"
            headers = list(MOD.STRUCTURES["auditoria_legacy"])
            make_xlsm(path, [("Base_Void", "Base_Void", headers), ("Historico_Void", "Historico_Void", headers)])
            result = MOD.inspect_xlsm(path)
            self.assertTrue(result.compatible)
            self.assertIn("auditoria_legacy", result.kinds)
            self.assertEqual([source.sheet for source in result.sources], ["Base_Void"])

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

    def test_distinct_periods_are_preserved_in_chronological_order(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            headers = list(MOD.STRUCTURES["uso"])
            old_path = root / "Motor_02_Uso_Stock (9).xlsm"
            new_path = root / "descarga.xlsm"
            make_xlsm(old_path, [("uso_ac", "uso_ac", headers)], first_day=date(2026, 8, 1))
            make_xlsm(new_path, [("uso_ac", "uso_ac", headers)], first_day=date(2026, 9, 1))
            old_result, new_result = MOD.inspect_xlsm(old_path), MOD.inspect_xlsm(new_path)
            selected, superseded = MOD.select_most_recent([(new_path, new_result), (old_path, old_result)])
            self.assertEqual(selected, [old_path, new_path])
            self.assertEqual(superseded, [])
            self.assertEqual(new_result.cecos, ["38368"])
            self.assertEqual(new_result.sources[0].latest_date, "2026-09-10")
            self.assertEqual(new_result.sources[0].observed_days, 10)

    def test_equivalent_period_uses_latest_file_version(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            headers = list(MOD.STRUCTURES["uso"])
            old_path, new_path = root / "uso-anterior.xlsm", root / "uso-vigente.xlsm"
            make_xlsm(old_path, [("uso_ac", "uso_ac", headers)])
            make_xlsm(new_path, [("uso_ac", "uso_ac", headers)])
            os.utime(old_path, (1, 1)); os.utime(new_path, (2, 2))
            old_result, new_result = MOD.inspect_xlsm(old_path), MOD.inspect_xlsm(new_path)
            selected, superseded = MOD.select_most_recent([(old_path, old_result), (new_path, new_result)])
            self.assertEqual(selected, [new_path])
            self.assertEqual(superseded, [old_path])

    def test_motor_without_ceco_is_blocked(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "sin-ceco.xlsm"
            make_xlsm(path, [("uso_ac", "uso_ac", list(MOD.STRUCTURES["uso"]))], stores=())
            result = MOD.inspect_xlsm(path)
            self.assertFalse(result.compatible)
            self.assertIn("CeCo", result.reason)

    def test_motor_with_two_cecos_is_blocked(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "mezcla.xlsm"
            make_xlsm(path, [("uso_ac", "uso_ac", list(MOD.STRUCTURES["uso"]))], stores=(38368, 38101))
            result = MOD.inspect_xlsm(path)
            self.assertFalse(result.compatible)
            self.assertEqual(result.cecos, ["38101", "38368"])

    def test_cli_blocks_a_session_with_different_cecos(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            first, second = root / "uno.xlsm", root / "dos.xlsm"
            headers = list(MOD.STRUCTURES["uso"])
            make_xlsm(first, [("uso_ac", "uso_ac", headers)], stores=(38368,))
            make_xlsm(second, [("uso_ac", "uso_ac", headers)], stores=(38101,))
            completed = subprocess.run([sys.executable, str(SCRIPT), str(first), str(second)], check=False, capture_output=True, text=True)
            payload = json.loads(completed.stdout)
            self.assertEqual(completed.returncode, 2)
            self.assertFalse(payload["session_ceco_consistent"])
            self.assertEqual(payload["selected_files"], [])

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
