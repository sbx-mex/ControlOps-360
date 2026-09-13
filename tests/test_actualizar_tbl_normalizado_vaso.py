import importlib.util
import sys
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).parents[1] / "scripts" / "actualizar_tbl_normalizado_vaso.py"
SPEC = importlib.util.spec_from_file_location("actualizar_tbl_normalizado_vaso", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class ClasificacionTests(unittest.TestCase):
    def setUp(self):
        self.rules = [
            MODULE.Rule("Starbucks Con Hielo", "Hel Chai Latte", "Vaso", "2_Helado"),
            MODULE.Rule("Espresso Tradicional", "Latte", "Vaso", "1_Caliente"),
            MODULE.Rule("Espresso Tradicional", "Bundle Contigo", "No", "Na"),
        ]

    def test_hel_se_clasifica_como_bebida_helada(self):
        result = MODULE.suggest("Hel. Pumpkin Latte", "Starbucks Con Hielo", self.rules)
        self.assertTrue(result["auto"])
        self.assertEqual((result["classification"], result["vessel"]), ("Vaso", "2_Helado"))

    def test_latte_sin_marca_fria_se_clasifica_caliente(self):
        result = MODULE.suggest("Pumpkin Latte", "Espresso Tradicional", self.rules)
        self.assertTrue(result["auto"])
        self.assertEqual(result["vessel"], "1_Caliente")

    def test_bundle_no_se_agrega_automaticamente(self):
        result = MODULE.suggest("Bundle Pumpkin", "Espresso Tradicional", self.rules)
        self.assertFalse(result["auto"])

    def test_nivel_precio_define_tamano(self):
        self.assertEqual(MODULE.PRICE_SIZE[3], "Grande")
        self.assertEqual(MODULE.PRICE_SIZE[4], "Venti")


if __name__ == "__main__":
    unittest.main()
