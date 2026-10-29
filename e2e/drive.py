"""Walks the frozen example the way a judge would, in a headless Chrome of its own, and saves screenshots.

    python3 e2e/drive.py [BASE_URL] [OUT_DIR] [WIDTH] [HEIGHT]

BASE_URL defaults to a local static server of public/ (python3 -m http.server 8000 inside public/, after
copying src/colour.js, match.js and names.js into public/lib/, which is what scripts/deploy.py does).
Only the example is used, so it makes no YouCam calls. Needs Google Chrome and `pip install websocket-client`.
Exits non-zero on the first step that doesn't happen.
"""
import base64, json, os, subprocess, sys, tempfile, time, urllib.request
from websocket import create_connection

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000").rstrip("/")
OUT = sys.argv[2] if len(sys.argv) > 2 else tempfile.mkdtemp(prefix="bif-e2e-")
W = int(sys.argv[3]) if len(sys.argv) > 3 else 390
H = int(sys.argv[4]) if len(sys.argv) > 4 else 844
CHROME = os.environ.get("CHROME", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
PORT = 9339

proc = subprocess.Popen([CHROME, "--headless=new", f"--remote-debugging-port={PORT}", f"--user-data-dir={tempfile.mkdtemp()}",
                         "--hide-scrollbars", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
_id = 0


def connect():
    for _ in range(40):
        try:
            pages = [t for t in json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json")) if t["type"] == "page"]
            return create_connection(pages[0]["webSocketDebuggerUrl"], suppress_origin=True, timeout=30)
        except Exception:
            time.sleep(0.25)
    raise SystemExit("Chrome did not start")


def send(method, **params):
    global _id
    _id += 1
    ws.send(json.dumps({"id": _id, "method": method, "params": params}))
    while True:
        r = json.loads(ws.recv())
        if r.get("id") == _id:
            return r.get("result", {})


def ev(expr):
    return send("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True).get("result", {}).get("value")


def wait(sel, timeout=15):
    end = time.time() + timeout
    while time.time() < end:
        if ev(f"!!document.querySelector({json.dumps(sel)})"):
            return
        time.sleep(0.2)
    raise SystemExit(f"FAIL: timed out waiting for {sel}")


def click(sel):
    wait(sel)
    x, y = ev(f"(()=>{{const e=document.querySelector({json.dumps(sel)}); e.scrollIntoView({{block:'center'}}); const r=e.getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2]}})()")
    time.sleep(0.2)
    send("Input.dispatchMouseEvent", type="mouseMoved", x=x, y=y)
    for kind in ("mousePressed", "mouseReleased"):
        send("Input.dispatchMouseEvent", type=kind, x=x, y=y, button="left", clickCount=1)


def check(cond, what):
    if not cond:
        raise SystemExit(f"FAIL: {what}")
    print("ok  ", what)


def settle(timeout=20):
    end = time.time() + timeout
    while time.time() < end and not ev("[...document.images].filter(i=>i.loading!=='lazy').every(i=>i.complete && i.naturalWidth>0)"):
        time.sleep(0.3)
    time.sleep(1.6)  # the thread's first glide


def shot(name):
    check(ev("document.documentElement.scrollWidth <= innerWidth"), f"{name}: no sideways scroll at {W}px")
    ev("window.scrollTo(0,0)")
    time.sleep(0.3)
    path = os.path.join(OUT, f"{name}_{W}x{H}.png")
    open(path, "wb").write(base64.b64decode(send("Page.captureScreenshot", format="png")["data"]))
    print("shot", path)


def current():
    return ev("document.querySelector('.reel .mini.on')?.dataset.pick")


try:
    ws = connect()
    send("Emulation.setDeviceMetricsOverride", width=W, height=H, deviceScaleFactor=2 if W < 600 else 1, mobile=W < 600)
    send("Page.navigate", url=f"{BASE}/?t={int(time.time())}")
    wait("#demo"); settle(); shot("welcome")

    click("#demo"); wait("#passport"); settle()
    check("2A to 2B" in ev("document.querySelector('#passport').innerText"), "example passport shows her wave")
    shot("passport")

    click("#try"); wait("#cmp .knot"); settle()
    check(current() == "w06", "try-on opens on the lead wig (w06, auburn with bangs)")
    check(ev("document.querySelector('[data-f=new]').classList.contains('on')"), "lead sits under 'Something new'")
    shot("tryon")

    click("[data-pick=w17]"); wait("#cmp .knot")
    check(current() == "w17", "a newer wig (w17) opens on its saved try-on, not a blank veil")
    click("#keep"); wait("[data-pick=w17] .kept-dot")
    click("[data-f=close]"); wait("[data-f=close].on")
    check(current() == "w01", "'Close to you' leads with the closest wig (w01)")
    click("#keep"); wait("[data-pick=w01] .kept-dot")
    check(ev("document.querySelectorAll('.reel .mini').length") == 3, "'Close to you' holds three wigs for her")

    click("#share"); wait("#copy"); settle()
    check(ev("document.querySelectorAll('.catalog figure').length") == 2, "share screen lists the two kept wigs")
    shot("share")
    link = ev("document.querySelector('a.button.outline[href*=fitter]').href")
    check("#" in link and len(link) < 2000, f"fitter link carries data only ({len(link)} chars)")

    send("Page.navigate", url=link); wait(".tag"); settle()
    check("Dana" in ev("document.querySelector('main').innerText"), "fitter page opens with her tag")
    shot("fitter")
    print("PASS", OUT)
finally:
    proc.kill()
