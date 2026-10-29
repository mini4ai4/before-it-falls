"""Deploys Before It Falls to Netlify through the API (no CLI, no build service).

    python3 scripts/deploy.py            # plan only
    python3 scripts/deploy.py --yes      # deploy
    python3 scripts/deploy.py --yes --env  # also (re)set YOUCAM_API_KEY on the site from the environment

Static files come from public/. The API function is bundled by esbuild into one
.mjs (Lambda format) and uploaded as a zip. /api/* is routed to it by _redirects.
"""
import hashlib, io, json, os, re, subprocess, sys, time, urllib.request, zipfile
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
SITE = "before-it-falls"
LOCAL = APP / ".deploy.env"  # git-ignored: optional SECRET_VAULT_CMD=... for a local secret store
for line in (LOCAL.read_text().splitlines() if LOCAL.exists() else []):
    if "=" in line and not line.startswith("#"):
        os.environ.setdefault(*line.split("=", 1))
VAULT = os.environ.get("SECRET_VAULT_CMD", "")


def secret(env_name, label):
    """Environment first (anyone can deploy their own copy); an optional local secret command as a fallback."""
    if os.environ.get(env_name):
        return os.environ[env_name]
    if not VAULT:
        raise SystemExit(f"Set {env_name} in the environment")
    return subprocess.run([*VAULT.split(), label], capture_output=True, text=True).stdout.strip()


TOKEN = secret("NETLIFY_TOKEN", "S47")


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


def sync_shared():
    """The browser runs the same tested modules as the tests: copy them in."""
    lib = APP / "public" / "lib"
    lib.mkdir(exist_ok=True)
    for name in ("colour.js", "match.js", "names.js"):
        (lib / name).write_bytes((APP / "src" / name).read_bytes())
    (APP / "public" / "catalog").mkdir(exist_ok=True)
    (APP / "public" / "catalog" / "catalog.json").write_bytes((APP / "catalog" / "catalog.json").read_bytes())


def static_files():
    sync_shared()
    files = {}
    for p in sorted((APP / "public").rglob("*")):
        if p.is_file() and not p.name.startswith("."):
            files["/" + p.relative_to(APP / "public").as_posix()] = p.read_bytes()
    files["/_redirects"] = b"/api/*  /.netlify/functions/api/:splat  200\n"
    return files


def set_env(site):
    key = secret("YOUCAM_API_KEY", "S45")
    if not key.startswith("sk-"):
        raise SystemExit("Set YOUCAM_API_KEY in the environment")
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
