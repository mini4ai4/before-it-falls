// Server-side YouCam API client. The key never leaves the server; the browser
// only ever talks to our functions, which call this.

const HOST = "https://yce-api-01.makeupar.com";

// The only tasks this app runs, and the API version each one lives under.
export const FEATURES = Object.freeze({
  "hair-transfer": "v2.1",
  "skin-tone-analysis": "v2.0",
  "hair-type-detection": "v2.0",
  "hair-length-detection": "v2.0",
  "hair-density-detection": "v2.0",
  "hair-color": "v2.0",
});

export const CREDIT_FLOOR = 150;

export class YouCam {
  constructor({ key, fetchImpl = fetch, now = () => Date.now(), floor = CREDIT_FLOOR } = {}) {
    if (!key) throw new Error("YOUCAM_API_KEY is not set");
    this.key = key;
    this.fetch = fetchImpl;
    this.now = now;
    this.floor = floor;
    this.creditCache = null;
  }

  async call(method, path, body) {
    const res = await this.fetch(HOST + path, {
      method,
      headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`YouCam ${method} ${path}: ${res.status} ${text.slice(0, 200)}`);
    }
    if (!res.ok) throw new Error(`YouCam ${method} ${path}: ${res.status} ${json.error_code || json.error || ""}`.trim());
    return json;
  }

  // Remaining units, cached for a minute so every request doesn't cost a round trip.
  async credit() {
    if (this.creditCache && this.now() - this.creditCache.at < 60_000) return this.creditCache.amount;
    const r = await this.call("GET", "/s2s/v1.0/client/credit");
    const amount = (r.results ?? []).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    this.creditCache = { amount, at: this.now() };
    return amount;
  }

  async assertBudget() {
    const amount = await this.credit();
    if (amount < this.floor) {
      const err = new Error(`Live try-ons are paused to protect the demo budget (${amount} units left).`);
      err.code = "budget";
      throw err;
    }
    return amount;
  }

  async upload(bytes, { contentType = "image/jpg", name = "photo.jpg" } = {}) {
    const r = await this.call("POST", "/s2s/v2.0/file", {
      files: [{ content_type: contentType, file_name: name, file_size: bytes.byteLength }],
    });
    const file = r.data.files[0];
    const put = file.requests[0];
    const res = await this.fetch(put.url, { method: "PUT", headers: put.headers ?? { "Content-Type": contentType }, body: bytes });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return file.file_id;
  }

  async start(feature, body) {
    const version = FEATURES[feature];
    if (!version) throw new Error(`Feature not allowed: ${feature}`);
    await this.assertBudget();
    const r = await this.call("POST", `/s2s/${version}/task/${feature}`, body);
    this.creditCache = null;
    return r.data.task_id;
  }

  async status(feature, taskId) {
    const version = FEATURES[feature];
    if (!version) throw new Error(`Feature not allowed: ${feature}`);
    if (!/^[A-Za-z0-9_\-+=/]{1,200}$/.test(String(taskId))) throw new Error("Bad task id");
    const r = await this.call("GET", `/s2s/${version}/task/${feature}/${encodeURIComponent(taskId)}`);
    const d = r.data ?? {};
    return { status: d.task_status, results: d.results ?? null, error: d.error ?? null };
  }
}
