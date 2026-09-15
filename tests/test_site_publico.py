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
        for token in ('data-multi-filter=', 'data-multi-search=', 'name="controlops-filters"', 'data-maxmin-select=', 'step="0.1"', 'PDF etiquetas', 'primary=i.sapName', "'outputView','Ver en'", 'Pz / Caja'):
            self.assertIn(token, self.ui)
        self.assertNotIn("state.openMulti", self.ui)
        self.assertIn("closeMultiFilters", self.ui)
        export = (ROOT / "assets" / "export.mjs").read_text()
        self.assertIn("ACTUALIZACIÓN / IMPRESIÓN", export)
        self.assertIn("PZ / CAJA", export)
        self.assertIn("/MediaBox [0 0 792 612]", export)
        self.assertNotIn("'Nombre visible'", self.ui)
        trend = self.ui.split("function trendView(){", 1)[1].split("function orderView(){", 1)[0]
        for obsolete in ("metric('Uso del periodo'", "metric('Promedio diario'", "metric('Conversión'"):
            self.assertNotIn(obsolete, trend)
    def test_separate_module_flows(self):
        for name in ("maxminView", "trendView", "orderView", "peakView", "normalView", "bakingView", "topView", "auditView"):
            self.assertIn("function " + name, self.ui)
    def test_order_uses_today_and_contextual_reception_dates(self):
        order = self.ui.split("function orderView(){", 1)[1].split("function peakView(){", 1)[0]
        self.assertIn("settings.today=currentToday", order)
        self.assertIn("capture-lock", order)
        self.assertNotIn('data-order-setting="today"', order)
        self.assertIn("¿Para cuándo es el pedido?", order)
        self.assertNotIn("Próxima entrega", order)
        self.assertIn("nextReception(settings.delivery,[index])", order)
        self.assertIn("active&&date", order)
        for target in ("order-cycle", "order-transit", "order-count"):
            self.assertIn(f'data-order-jump="{target}"', order)
    def test_order_filters_products_and_transit_by_provider(self):
        order = self.ui.split("function orderView(){", 1)[1].split("function peakView(){", 1)[0]
        operations = (ROOT / "assets/operations.mjs").read_text()
        for label in ("DIA", "Maquila | Café Sirena", "Lala | Comercializadora Lácteos"):
            self.assertIn(label, self.ui)
        self.assertIn("providerAlias", operations)
        self.assertIn("f.provider&&provider!==providerAlias(f.provider)", operations)
        self.assertIn("filter(order=>providerAlias(order.providerAlias||order.provider)===provider)", order)
        self.assertIn("PEDIDO POR PROVEEDOR", order)
    def test_motor_session_is_recoverable_and_reset_is_explicit(self):
        for element_id in ("saveStatus", "resetButton", "resetConfirmation", "cancelResetButton", "confirmResetButton"):
            self.assertIn(element_id, self.parser.ids)
        for token in ("indexedDB.open", "writeWorkspaceSnapshot", "restoreWorkspaceSnapshot", "clearWorkspaceSnapshot", "navigator.storage.persist", "localStorage.removeItem('controlops-v5-settings')", "beforeunload", "location.reload()"):
            self.assertIn(token, self.ui)
        self.assertIn("Reiniciar datos", self.html)
        self.assertIn("Tus archivos Excel y PDF originales no se eliminan", self.html)
        self.assertNotIn("document.cookie", self.ui)
    def test_normalizados_has_four_views_and_global_multi_filters(self):
        self.assertIn("tabs('normal',['Resumen','Vasos y tapas','FHW','Crema batida'])", self.ui)
        self.assertIn("multiFilter('weeks','Semanas'", self.ui)
        self.assertIn("multiFilter('weekdays','Días'", self.ui)
        self.assertIn("multiFilter('modes','Canales'", self.ui)
        self.assertNotIn("metric('Devoluciones'", self.ui)
        self.assertNotIn("metric('Bebidas en vaso'", self.ui)
    def test_auditoria_is_one_void_flow_with_multi_filters_and_ticket_detail(self):
        audit = self.ui.split("function auditView(){", 1)[1].split("function navigationView(", 1)[0]
        self.assertNotIn("tabs('audit'", audit)
        self.assertNotIn("Negativas", audit)
        for token in ("multiFilter('reasons','Motivos'", "multiFilter('partners','Partners'", "data-audit-ticket=", "DESGLOSE DEL TICKET", "Concentración por partner"):
            self.assertIn(token, self.ui)
    def test_no_diagnostics_or_demo(self):
        for token in ("Exportar diagnóstico", "demoButton", "archivo_patron"):
            self.assertNotIn(token, self.html + self.ui)
    def test_loading_confirmation_and_ceco_lock(self):
        self.assertIn('id="loading"', self.html)
        self.assertIn('id="confirmation"', self.html)
        self.assertIn("selectRecentWorkbooks", self.ui)
        self.assertIn("Promise.all", self.ui)
        self.assertIn("Mismo CeCo, tipo y periodo", self.ui)
        self.assertIn("Compostable:", self.ui)
    def test_management_navigation_and_lazy_heavy_modules(self):
        for token in ("Resumen 360°", "function menuView()", "Selecciona una herramienta", "← Resumen"):
            self.assertIn(token, self.html + self.ui)
        for token in ("Acerca de", "Seguridad", "Finanzas", "Alcance y calidad", "Fuentes cargadas", "function financeView()", "function scopeView()", "function sourcesView()"):
            self.assertNotIn(token, self.html + self.ui)
        self.assertIn("#uploadButton{background:#00a862", (ROOT / "assets/styles.css").read_text())
        first_lines = "\n".join(self.ui.splitlines()[:2])
        for module in ("parameters.mjs", "reader.mjs", "export.mjs", "transit.mjs"):
            self.assertNotIn(f"from './{module}'", first_lines)
            self.assertIn(f"import('./{module}')", self.ui)
    def test_import_graph_is_self_contained(self):
        for p in (ROOT / "assets").glob("*"):
            if p.suffix not in (".mjs", ".js"):
                continue
            for relative in re.findall(r'(?:from\s*|import\s*)[\'"]([.][^\'"]+)[\'"]', p.read_text()):
                self.assertTrue((p.parent / relative).is_file(), relative)

if __name__ == "__main__":
    unittest.main()
