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


if __name__ == "__main__":
    unittest.main()
