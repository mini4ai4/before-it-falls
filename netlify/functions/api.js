// One Netlify function for the three calls the browser makes:
//   POST /api/upload  {image: base64 JPEG}      → {fileId}
//   POST /api/task    {feature, body}           → {taskId}
//   GET  /api/status?feature=…&id=…             → {status, results, error}
// The YouCam key lives only in this function's environment.
import { YouCam } from "../../src/youcam.js";

const MAX_BYTES = 4 * 1024 * 1024;

const json = (statusCode, data) => ({
  statusCode,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
  body: JSON.stringify(data),
});

let client;
const youcam = () => (client ??= new YouCam({ key: process.env.YOUCAM_API_KEY }));

// Guards for a public demo that has to last until judging ends: only our own pages may start paid work, each
// visitor gets a fair share per hour, and the whole site has a daily ceiling. A browser that hits a limit gets a
// plain sentence, and the frozen example keeps working because it never calls YouCam.
const ORIGINS = (process.env.ALLOWED_ORIGINS || "https://before-it-falls.netlify.app,http://localhost:8888")
  .split(",").map((o) => o.trim()).filter(Boolean);
const PER_IP_PER_HOUR = Number(process.env.TASKS_PER_IP_PER_HOUR || 24);   // a full session is about 8 tasks
const PER_DAY = Number(process.env.TASKS_PER_DAY || 160);
let perIp = new Map(), day = { key: "", n: 0 };
export const resetForTests = () => { client = undefined; perIp = new Map(); day = { key: "", n: 0 }; };

function guard(event) {
  const h = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  if (h.origin && !ORIGINS.includes(h.origin)) return "This demo only takes requests from its own page.";
  const ip = h["x-nf-client-connection-ip"] || h["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const now = Date.now(), hour = 3600e3;
  const recent = (perIp.get(ip) || []).filter((t) => now - t < hour);
  if (recent.length >= PER_IP_PER_HOUR) return "That's a lot of try-ons for one hour. Please come back a little later.";
  const today = new Date(now).toISOString().slice(0, 10);
  if (day.key !== today) day = { key: today, n: 0 };
  if (day.n >= PER_DAY) return "The live demo has reached today's limit. The example still works; live try-ons resume tomorrow.";
  recent.push(now); perIp.set(ip, recent); day.n += 1;
  return null;
}

// Only file ids that came from our own uploads may be sent on to a task.
function cleanBody(feature, body = {}) {
  const id = (v) => typeof v === "string" && /^[A-Za-z0-9+/=_-]{8,300}$/.test(v);
  if (feature === "hair-type-detection") {
    if (!Array.isArray(body.src_file_ids) || body.src_file_ids.length !== 3 || !body.src_file_ids.every(id)) throw new Error("Three photos are needed");
    return { src_file_ids: body.src_file_ids };
  }
  if (!id(body.src_file_id)) throw new Error("Missing photo");
  if (feature === "hair-transfer") {
    if (!id(body.ref_file_id)) throw new Error("Missing wig photo");
    return { src_file_id: body.src_file_id, ref_file_id: body.ref_file_id };
  }
  if (feature === "skin-tone-analysis") return { src_file_id: body.src_file_id, face_angle_strictness_level: "medium" };
  return { src_file_id: body.src_file_id };
}

export const handler = async (event) => {
  // Works for both /api/upload (redirected) and /.netlify/functions/api/upload.
  const route = String(event.path || "").split("/").filter(Boolean).pop();
  try {
    if (event.httpMethod === "POST" && route === "upload") {
      const h = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
      if (h.origin && !ORIGINS.includes(h.origin)) return json(403, { error: "This demo only takes requests from its own page." });
      const { image } = JSON.parse(event.body || "{}");
      const bytes = Buffer.from(String(image || ""), "base64");
      if (!bytes.length || bytes.length > MAX_BYTES) return json(400, { error: "Photo must be a JPEG under 4 MB" });
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return json(400, { error: "Photo must be a JPEG" });
      return json(200, { fileId: await youcam().upload(bytes) });
    }
    if (event.httpMethod === "POST" && route === "task") {
      const { feature, body } = JSON.parse(event.body || "{}");
      const cleaned = cleanBody(feature, body);
      const refused = guard(event);
      if (refused) return json(429, { error: refused });
      return json(200, { taskId: await youcam().start(feature, cleaned) });
    }
    if (event.httpMethod === "GET" && route === "status") {
      const { feature, id } = event.queryStringParameters || {};
      return json(200, await youcam().status(feature, id));
    }
    if (event.httpMethod === "GET" && route === "health") {
      return json(200, { ok: true, credit: await youcam().credit() });
    }
    return json(404, { error: "Not found" });
  } catch (error) {
    if (error.code === "budget") return json(429, { error: error.message });
    return json(400, { error: error.message });
  }
};
