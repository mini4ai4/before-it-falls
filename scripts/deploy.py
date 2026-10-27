"""Deploys Before It Falls to Netlify through the API (no CLI, no build service).

    python3 scripts/deploy.py            # plan only
    python3 scripts/deploy.py --yes      # deploy
    python3 scripts/deploy.py --yes --env  # also (re)set YOUCAM_API_KEY from the vault first

Static files come from public/. The API function is bundled by esbuild into one
.mjs (Lambda format) and uploaded as a zip. /api/* is routed to it by _redirects.
"""
import hashlib, io, json, os, re, subprocess, sys, time, urllib.request, zipfile
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
SITE = "before-it-falls"
TOKEN = re.search(r"TOKEN = '([^']+)'", Path("/Users/mini/agents/sora/scripts/netlify_deploy.py").read_text()).group(1)


def api(path, method="GET", data=None, raw=None, ctype="application/json"):
    body = raw if raw is not None else (json.dumps(data).encode() if data is not None else None)
    req = urllib.request.Request("https://api.netlify.com/api/v1" + path, data=body, method=method,
                                 headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": ctype})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            text = r.read()
            return json.loads(text) if text else {}
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {path} → {e.code} {e.read()[:400]}")


def bundle_function():
    out = APP / ".build" / "api.mjs"
    out.parent.mkdir(exist_ok=True)
    subprocess.run(["npx", "esbuild", "netlify/functions/api.js", "--bundle", "--platform=node", "--format=esm",
                    "--target=node20", f"--outfile={out}"], cwd=APP, check=True, capture_output=True)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        info = zipfile.ZipInfo("api.mjs", date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, out.read_bytes())
    return buf.getvalue()


def static_files():
    files = {}
    for p in sorted((APP / "public").rglob("*")):
        if p.is_file() and not p.name.startswith("."):
            files["/" + p.relative_to(APP / "public").as_posix()] = p.read_bytes()
    files["/_redirects"] = b"/api/*  /.netlify/functions/api/:splat  200\n"
    return files


def set_env(site):
    key = subprocess.run(["python3", "/Users/mini/agents/sora/scripts/secret.py", "S45"], capture_output=True, text=True).stdout.strip()
    if not key.startswith("sk-"):
        raise SystemExit("Could not read the YouCam key from the vault (S45)")
    acct = site["account_id"]
    existing = api(f"/accounts/{acct}/env?site_id={site['id']}")
    if any(e.get("key") == "YOUCAM_API_KEY" for e in existing):
        api(f"/accounts/{acct}/env/YOUCAM_API_KEY?site_id={site['id']}", "DELETE")
    api(f"/accounts/{acct}/env?site_id={site['id']}", "POST",
        [{"key": "YOUCAM_API_KEY", "values": [{"value": key, "context": "all"}]}])
    print("env YOUCAM_API_KEY set (value not printed)")


def main():
    site = next(s for s in api("/sites?per_page=100") if s["name"] == SITE)
    files = static_files()
    fn = bundle_function()
    print(f"{len(files)} files, function {len(fn) // 1024} KB → {site['ssl_url']}")
    for path in files:
        print("  ", path)
    if "--yes" not in sys.argv:
        print("plan only; add --yes to deploy")
        return
    if "--env" in sys.argv:
        set_env(site)
    fsha = hashlib.sha256(fn).hexdigest()
    digests = {path: hashlib.sha1(b).hexdigest() for path, b in files.items()}
    d = api(f"/sites/{site['id']}/deploys", "POST", {"files": digests, "functions": {"api": fsha}})
    need = set(d.get("required") or [])
    for path, b in files.items():
        if digests[path] in need:
            api(f"/deploys/{d['id']}/files{path}", "PUT", raw=b, ctype="application/octet-stream")
    if fsha in (d.get("required_functions") or []):
        api(f"/deploys/{d['id']}/functions/api?runtime=js", "PUT", raw=fn, ctype="application/octet-stream")
    for _ in range(60):
        s = api(f"/deploys/{d['id']}")
        if s["state"] in ("ready", "error"):
            break
        time.sleep(3)
    print("deploy", s["state"], s.get("error_message") or "", site["ssl_url"])


if __name__ == "__main__":
    main()
