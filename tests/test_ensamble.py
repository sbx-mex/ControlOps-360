import unittest
from copy import deepcopy

from scripts.auditar_ensamble import audit_interface, audit_table, scenario_matrix
from scripts.actualizar_tbl_ensamble import HEADER, INGREDIENTS, load, update


class EnsambleAuditTests(unittest.TestCase):
    def test_tbl_has_exact_sources_and_unified_groups(self):
        result = audit_table()
        self.assertEqual(result["productos_fuente"], 12)
        self.assertEqual(result["ensambles_unificados"], 6)
        self.assertEqual(result["ingredientes_completos"], 12)
        self.assertTrue(result["factor_unitario"])

    def test_half_hour_and_filter_scenarios_are_green(self):
        self.assertEqual(len(scenario_matrix()), 9)

    def test_interface_and_exports_are_complete(self):
        self.assertTrue(all(audit_interface().values()))

    def test_ingredient_column_update_is_idempotent(self):
        _, data = load()
        once = update(deepcopy(data))
        twice = update(deepcopy(once))
        self.assertEqual(once, twice)
        table = next(entry for entry in once["tables"] if entry["type"] == "food")
        self.assertIn(HEADER, table["headers"])
        self.assertEqual(sum(bool(row[table["headers"].index(HEADER)]) for row in table["rows"]), len(INGREDIENTS))


if __name__ == "__main__":
    unittest.main()
