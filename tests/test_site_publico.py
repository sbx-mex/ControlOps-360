import re
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).parents[1]

class SiteParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.assets = []
        self.csp = ""
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if "id" in a:
            self.ids.append(a["id"])
        if tag == "script" and "src" in a:
            self.assets.append(a["src"])
        if tag == "link" and a.get("rel") == "stylesheet":
            self.assets.append(a["href"])
        if a.get("http-equiv", "").lower() == "content-security-policy":
            self.csp = a.get("content", "")

class SitioPublicoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = (ROOT / "index.html").read_text()
        cls.ui = (ROOT / "assets/ui.mjs").read_text()
        cls.parser = SiteParser()
        cls.parser.feed(cls.html)
    def test_local_assets_exist(self):
        self.assertTrue(self.parser.assets)
        for p in self.parser.assets:
            self.assertNotIn("http", p)
            self.assertTrue((ROOT / p).is_file())
    def test_unique_and_complete_dom_ids(self):
        self.assertEqual(len(self.parser.ids), len(set(self.parser.ids)))
        queried = set(re.findall(r"\$\('([^']+)'\)", self.ui))
        self.assertFalse(queried - set(self.parser.ids))
    def test_csp_no_connections(self):
        for rule in ("connect-src 'none'", "object-src 'none'", "frame-src 'none'"):
            self.assertIn(rule, self.parser.csp)
    def test_no_remote_uploads(self):
        for file in (ROOT / "assets").glob("*.mjs"):
            if file.name == "parameters.mjs":
                continue
            content = file.read_text()
            self.assertNotIn("fetch(", content)
            self.assertNotIn("XMLHttpRequest", content)
    def test_multiple_xlsm_and_parameters(self):
        self.assertIn('accept=".xlsm,.xlsx,', self.html)
        self.assertIn(" multiple hidden", self.html)
        reader = (ROOT / "assets/reader.mjs").read_text()
        for role in ('"food"', '"drink"', '"cream"', '"baking"'):
            self.assertIn(role, reader)
    def test_active_menu_exports(self):
        self.assertIn("reportFor(state.module", self.ui)
        self.assertIn("createExecutiveWorkbook(report)", self.ui)
        self.assertIn("createExecutivePdf(report)", self.ui)
    def test_maxmin_is_selectable_compact_and_multi_filter(self):
        for token in ('data-multi-filter=', 'data-maxmin-select=', 'step="0.1"', 'PDF etiquetas', 'Nombre SAP', 'Nombre MICROS'):
            self.assertIn(token, self.ui)
        export = (ROOT / "assets" / "export.mjs").read_text()
        self.assertIn("perPage=12", export)
        self.assertIn("/MediaBox [0 0 792 612]", export)
    def test_separate_module_flows(self):
        for name in ("maxminView", "trendView", "orderView", "peakView", "normalView", "bakingView", "topView", "auditView", "aboutView"):
            self.assertIn("function " + name, self.ui)
    def test_no_diagnostics_or_demo(self):
        for token in ("Exportar diagnóstico", "demoButton", "archivo_patron"):
            self.assertNotIn(token, self.html + self.ui)
    def test_loading_confirmation_and_ceco_lock(self):
        self.assertIn('id="loading"', self.html)
        self.assertIn('id="confirmation"', self.html)
        self.assertIn("selectRecentWorkbooks", self.ui)
        self.assertIn("Promise.all", self.ui)
        self.assertIn("fecha interna más reciente", self.ui)
        self.assertIn("Compostable:", self.ui)
    def test_import_graph_is_self_contained(self):
        for p in (ROOT / "assets").glob("*"):
            if p.suffix not in (".mjs", ".js"):
                continue
            for relative in re.findall(r'(?:from\s*|import\s*)[\'"]([.][^\'"]+)[\'"]', p.read_text()):
                self.assertTrue((p.parent / relative).is_file(), relative)

if __name__ == "__main__":
    unittest.main()
