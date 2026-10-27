"""Live path: real photos through the real UI → our function → YouCam (≈6 units)."""
import json, sys, time
sys.path.insert(0, "/Users/mini/agents/sora/hackathons/youcam_2026/app/e2e")
from drive import c, ev, wait, click, images_loaded, shot

T = "/Users/mini/agents/sora/hackathons/youcam_2026/test"


def put_file(path):
    wait("#shot")
    root = c.send("DOM.getDocument")["root"]["nodeId"]
    node = c.send("DOM.querySelector", nodeId=root, selector="#shot")["nodeId"]
    c.send("DOM.setFileInputFiles", nodeId=node, files=[path])


ev("location.href='https://before-it-falls.netlify.app/?live='+Date.now()")
time.sleep(2)
click("#live")
for name in ["src.jpg", "src_left.jpg", "src_right.jpg"]:
    before = ev("document.querySelectorAll('.catalog figure').length")
    put_file(f"{T}/{name}")
    end = time.time() + 10
    while time.time() < end and ev("document.querySelectorAll('.catalog figure').length") == before:
        time.sleep(0.3)
print("photos:", ev("document.querySelectorAll('.catalog figure').length"))
click("#next"); wait("#c")
time.sleep(1)
# tap the hair lengths on the scaled canvas
for fx, fy in [(70 / 768, 560 / 1024), (115 / 768, 650 / 1024), (690 / 768, 600 / 1024)]:
    p = ev(f"(()=>{{const r=document.getElementById('c').getBoundingClientRect(); return [r.x+r.width*{fx}, r.y+r.height*{fy}]}})()")
    c.send("Input.dispatchMouseEvent", type="mousePressed", x=p[0], y=p[1], button="left", clickCount=1)
    c.send("Input.dispatchMouseEvent", type="mouseReleased", x=p[0], y=p[1], button="left", clickCount=1)
    time.sleep(0.3)
click("#read")
t0 = time.time()
end = time.time() + 180
while time.time() < end:
    if ev("!!document.getElementById('passport')"):
        break
    msg = ev("document.getElementById('msg')?.innerText || ''")
    if msg and "minute" not in msg:
        print("message:", msg)
        break
    time.sleep(2)
print(f"reading took {time.time() - t0:.0f}s")
print("passport:", ev("document.getElementById('passport')?.innerText.replace(/\\n+/g,' | ').slice(0,300)"))
shot("live_passport")
click("#try"); wait("[data-try=w01]")
click("[data-try=w01]")
t0 = time.time()
wait("[data-keep=w01]", timeout=150)
print(f"try-on took {time.time() - t0:.0f}s")
images_loaded()
print("try-on image:", ev("document.querySelector('.wig img').src.slice(0,90)"))
shot("live_tryon")
