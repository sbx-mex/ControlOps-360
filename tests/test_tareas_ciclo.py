import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook

from scripts.actualizar_tareas_ciclo import extract_tasks, render_module


class TareasCicloTests(unittest.TestCase):
    def test_extracts_four_cycles_and_deduplicates_cleanly(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "ciclo.xlsx"
            workbook = Workbook()
            sheet = workbook.active
            sheet.title = "Actividades"
            for column, value in {"B": "Desinfectar utencilios.", "D": "Desincrustacion de tablas", "F": "Limpia bascula", "H": "Recolectar Loza"}.items():
                sheet[f"{column}5"] = value
            sheet["B6"] = "Desinfectar utencilios"
            workbook.save(source)
            catalog = extract_tasks(source)
        self.assertEqual(set(catalog), {30, 20, 12, 8})
        self.assertEqual(catalog[30], ["Desinfectar utensilios"])
        self.assertEqual(catalog[20], ["Desincrustación de tablas"])
        self.assertEqual(catalog[12], ["Limpia báscula"])
        module = render_module(catalog)
        self.assertIn("CYCLE_TASKS", module)
        self.assertIn('"8"', module)


if __name__ == "__main__":
    unittest.main()
