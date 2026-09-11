import importlib.util
import sys
import unittest
from pathlib import Path

SCRIPT = Path(__file__).parents[1] / "scripts" / "auditar_fuentes.py"
SPEC = importlib.util.spec_from_file_location("auditar_fuentes", SCRIPT)
MOD = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MOD
SPEC.loader.exec_module(MOD)


class AuditoriaTests(unittest.TestCase):
    def test_coincidencia_no_distingue_mayusculas(self):
        self.assertTrue(MOD._coincide("dashboard_peakhour", ["Dashboard_PeakHour"]))

    def test_coincidencia_exige_nombre_completo(self):
        self.assertFalse(MOD._coincide("Uso 2026", ["Uso"]))


if __name__ == "__main__":
    unittest.main()
