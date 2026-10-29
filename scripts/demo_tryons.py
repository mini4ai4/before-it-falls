"""Runs a real YouCam hair-transfer of the demo person with every catalogue wig, once.
The results are frozen into public/demo/ so the example costs judges nothing."""
import json, sys
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[2] / "test"))
from yc import upload, run, credit

cat = json.load(open("catalog/catalog.json"))
print("credit before", credit())
src = upload("public/demo/dana_front.jpg")
import os
done = json.load(open("public/demo/tryons.json")) if os.path.exists("public/demo/tryons.json") else {}
for w in cat:
    if w["id"] in done:
        continue  # frozen once already
    try:
        ref = upload(w["image"])
        run("hair-transfer", {"src_file_id": src, "ref_file_id": ref}, out=f"public/demo/tryon_{w['id']}.jpg")
        done[w["id"]] = f"demo/tryon_{w['id']}.jpg"
        print(w["id"], "ok", flush=True)
    except Exception as e:
        print(w["id"], "FAILED", e, flush=True)
json.dump(done, open("public/demo/tryons.json", "w"), indent=1)
print("credit after", credit())
