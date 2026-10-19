"""Headless-Chromium smoke test for the web game in www/.
Serves www/ on a local port, opens it at phone-landscape size, starts a race,
and fails if any console error / page error appears.
Usage: python3 tools/smoke_test.py [chrome_path]
Needs: pip install playwright  (uses system Chrome/Chromium if given)
"""
import sys, os, threading, functools, http.server, socketserver
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "www")
CHROME = sys.argv[1] if len(sys.argv) > 1 else None

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".webmanifest": "application/manifest+json"}

httpd = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=ROOT))
port = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()

errs, fails = [], []
def check(name, ok, info=""):
    print(("OK  " if ok else "FAIL"), name, info)
    if not ok: fails.append(name)

with sync_playwright() as p:
    kw = dict(headless=True, args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    if CHROME: kw["executable_path"] = CHROME
    b = p.chromium.launch(**kw)
    ctx = b.new_context(viewport={"width": 844, "height": 390}, has_touch=True, is_mobile=True, device_scale_factor=2)
    pg = ctx.new_page()
    pg.on("console", lambda m: errs.append(f"{m.type}: {m.text}") if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append(f"pageerror: {e}"))
    pg.on("requestfailed", lambda r: errs.append(f"requestfailed: {r.url}"))
    pg.goto(f"http://127.0.0.1:{port}/index.html")
    pg.wait_for_timeout(3000)
    check("menu shown", pg.evaluate("window.__rc && __rc.state") == "menu")
    check("vehicle cards", pg.evaluate("document.querySelectorAll('.vcard').length") >= 1)
    pg.tap("#btnStart")
    try: pg.wait_for_function("__rc.state==='race'", timeout=20000)
    except Exception: pass
    check("race started", pg.evaluate("__rc.state") == "race")
    pg.keyboard.down("w"); pg.wait_for_timeout(3000); pg.keyboard.up("w")
    check("car moves", pg.evaluate("__rc.player.speed") > 10, f"speed={pg.evaluate('__rc.player.speed'):.0f}")
    pg.screenshot(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), "smoke.png"))
    b.close()
httpd.shutdown()
check("no console errors", not errs, "; ".join(errs[:5]))
sys.exit(1 if fails else 0)
