import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).parents[1]


class AssetParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.scripts = []
        self.styles = []
        self.csp = ""

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "script" and values.get("src"):
            self.scripts.append(values["src"])
        if tag == "link" and values.get("rel") == "stylesheet":
            self.styles.append(values.get("href", ""))
        if tag == "meta" and values.get("http-equiv", "").lower() == "content-security-policy":
            self.csp = values.get("content", "")


class SitioPublicoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = (ROOT / "index.html").read_text(encoding="utf-8")
        cls.parser = AssetParser()
        cls.parser.feed(cls.html)

    def test_activos_son_locales(self):
        assets = self.parser.scripts + self.parser.styles
        self.assertTrue(assets)
        self.assertTrue(all(not item.startswith(("http://", "https://", "//")) for item in assets))
        self.assertTrue(all((ROOT / item).is_file() for item in assets))

    def test_csp_bloquea_conexiones(self):
        self.assertIn("connect-src 'none'", self.parser.csp)
        self.assertIn("object-src 'none'", self.parser.csp)

    def test_no_hay_dependencias_remotas(self):
        app = (ROOT / "assets" / "app.js").read_text(encoding="utf-8")
        self.assertNotIn("fetch(", app)
        self.assertNotIn("XMLHttpRequest", app)

    def test_carga_multiple_es_exclusiva_para_xlsm(self):
        self.assertIn('accept=".xlsm,application/vnd.ms-excel.sheet.macroEnabled.12"', self.html)
        self.assertIn(" multiple hidden", self.html)
        self.assertNotIn(".xlsx", self.html.lower())

    def test_interfaz_no_exporta_diagnosticos_ni_usa_demo(self):
        combined = self.html + (ROOT / "assets" / "app.js").read_text(encoding="utf-8")
        self.assertNotIn("Exportar diagnóstico", combined)
        self.assertNotIn("demoButton", combined)

    def test_exporta_solamente_resumen_excel_y_pdf(self):
        self.assertIn('id="excelButton"', self.html)
        self.assertIn('id="pdfButton"', self.html)
        export = (ROOT / "assets" / "export.mjs").read_text(encoding="utf-8")
        self.assertIn("createExecutiveWorkbook", export)
        self.assertIn("createExecutivePdf", export)

    def test_resumen_prioriza_peak_hour_y_kpis(self):
        for token in ("Venta neta", "Órdenes", "Ticket promedio", "UPT", "Peak Hour", "Enfoque gerente"):
            self.assertIn(token, self.html)

    def test_motor_estructural_esta_versionado(self):
        engine = ROOT / "assets" / "engine.mjs"
        self.assertTrue(engine.is_file())
        text = engine.read_text(encoding="utf-8")
        self.assertIn("matchStructure", text)
        self.assertIn("IDTienda", text)


if __name__ == "__main__":
    unittest.main()
