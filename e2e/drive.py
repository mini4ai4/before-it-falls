"""Drives the live site in the CDP browser like a judge would, with waits instead of sleeps."""
import json, sys, time
sys.path.insert(0, "/Users/mini/agents/sora/scripts")
from cdp import CDP

S = "/private/tmp/claude-501/-Users-mini-agents-sora/bdfc3edc-bd24-4be8-b25a-ad4b7473bd9e/scratchpad"
c = CDP(port=9224, url_contains="before-it-falls")
c.send("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=2, mobile=True)


def ev(e):
    return c.send("Runtime.evaluate", expression=e, returnByValue=True, awaitPromise=True).get("result", {}).get("value")


def wait(sel, timeout=15):
    end = time.time() + timeout
    while time.time() < end:
        if ev(f"!!document.querySelector({json.dumps(sel)})"):
            return True
        time.sleep(0.3)
    raise SystemExit(f"timeout waiting for {sel}")


def click(sel):
    wait(sel)
    p = ev(f"(()=>{{const e=document.querySelector({json.dumps(sel)}); e.scrollIntoView({{block:'center'}}); const r=e.getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2]}})()")
    time.sleep(0.3)
    c.send("Input.dispatchMouseEvent", type="mouseMoved", x=p[0], y=p[1])
    for k in ("mousePressed", "mouseReleased"):
        c.send("Input.dispatchMouseEvent", type=k, x=p[0], y=p[1], button="left", clickCount=1)


def images_loaded(timeout=20):
    end = time.time() + timeout
    while time.time() < end:
        if ev("[...document.images].every(i=>i.complete && i.naturalWidth>0)"):
            return True
        time.sleep(0.5)
    return False


def shot(name):
    ev("window.scrollTo(0,0)")
    time.sleep(0.5)
    c.screenshot(f"{S}/{name}.png")


if __name__ == "__main__":
    ev("location.href='https://before-it-falls.netlify.app/?t='+Date.now()")
    time.sleep(2)
    click("#demo"); wait("#passport")
    click("#try"); wait("[data-try=w01]")
    click("[data-try=w01]"); wait("[data-keep=w01]")
    click("[data-try=w15]"); wait("[data-keep=w15]")
    click("[data-keep=w01]"); wait(".wig.kept")
    print("images loaded:", images_loaded())
    print("tags:", ev("[...document.querySelectorAll('.wig')].slice(0,3).map(w=>w.querySelector('img').src.split('/').pop()).join(' ')"))
    shot("e2e_tryon")
    click("#share"); wait("#copy")
    link = ev("document.querySelector('a.button.outline').href")
    print("fitter link length:", len(link))
    shot("e2e_share")
    ev(f"location.href={json.dumps(link)}")
    time.sleep(2)
    wait(".tag")
    images_loaded()
    print("fitter:", ev("document.querySelector('main').innerText.slice(0,300)"))
    shot("e2e_fitter")
