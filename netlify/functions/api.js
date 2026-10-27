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
export const resetForTests = () => { client = undefined; };

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
      const { image } = JSON.parse(event.body || "{}");
      const bytes = Buffer.from(String(image || ""), "base64");
      if (!bytes.length || bytes.length > MAX_BYTES) return json(400, { error: "Photo must be a JPEG under 4 MB" });
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return json(400, { error: "Photo must be a JPEG" });
      return json(200, { fileId: await youcam().upload(bytes) });
    }
    if (event.httpMethod === "POST" && route === "task") {
      const { feature, body } = JSON.parse(event.body || "{}");
      return json(200, { taskId: await youcam().start(feature, cleanBody(feature, body)) });
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
