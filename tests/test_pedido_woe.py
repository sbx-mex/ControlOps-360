import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import auditar_pedido_woe as audit  # noqa: E402


class PedidoWoeAuditTests(unittest.TestCase):
    def test_complete_cross_scenario_matrix(self):
        self.assertGreaterEqual(len(audit.scenario_matrix()), 19)

    def test_catalog_has_no_ambiguous_or_contradictory_keys(self):
        result = audit.audit_catalog()
        self.assertEqual(result["claves_duplicadas"], 0)
        self.assertEqual(result.get("contradicciones", 0), 0)
        self.assertGreater(result["doble_cruce"], 0)

    def test_pedido_interface_is_safe_and_focused(self):
        self.assertTrue(all(audit.audit_interface().values()))


if __name__ == "__main__":
    unittest.main()
