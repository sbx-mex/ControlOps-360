import json
import unittest
from pathlib import Path


ROOT = Path(__file__).parents[1]


class NormalizadosContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        config = json.loads(
            (ROOT / "config" / "conexiones.example.json").read_text(encoding="utf-8")
        )
        cls.module = next(item for item in config["modulos"] if item["id"] == "normalizados")
        cls.app = (ROOT / "assets" / "app.js").read_text(encoding="utf-8")

    def test_contrato_usa_nombres_reales(self):
        self.assertIn("Detalle_CB", self.module["tablas_aceptadas"])
        self.assertIn("detallevaso", self.module["tablas_aceptadas"])
        self.assertIn("historicocb", self.module["historicos"])
        self.assertIn("historicovaso", self.module["historicos"])

    def test_sitio_detecta_reporte_normalizado(self):
        self.assertIn('id: "normalizados"', self.app)
        self.assertIn('"Vaso&Tapa"', self.app)
        self.assertIn('"Crema Batida"', self.app)


if __name__ == "__main__":
    unittest.main()
