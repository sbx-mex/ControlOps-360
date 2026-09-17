import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).parents[1]


class ValidarExportacionMaxMinTests(unittest.TestCase):
    def test_export_with_visible_usage_unit_passes_validator(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "max_min.xlsx"
            subprocess.run(
                ["node", "tests/generar_exportacion_max_min.mjs", str(output)],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
            )
            result = subprocess.run(
                [sys.executable, "scripts/validar_exportacion_max_min.py", str(output)],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
            )
        self.assertIn('"uso_unidad": 2', result.stdout)


if __name__ == "__main__":
    unittest.main()
