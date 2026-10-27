import assert from "node:assert/strict";
import { test } from "node:test";

process.env.YOUCAM_API_KEY = "test-key";
let credit = 900;
const sent = [];
globalThis.fetch = async (url, opts = {}) => {
  sent.push({ url, method: opts.method, body: opts.body });
  const reply = (status, data) => ({ ok: status < 400, status, text: async () => JSON.stringify(data) });
  if (url.includes("/client/credit")) return reply(200, { results: [{ amount: credit }] });
  if (url.endsWith("/s2s/v2.0/file")) return reply(200, { data: { files: [{ file_id: "FILEID123456", requests: [{ url: "https://s3.example/put" }] }] } });
  if (url.includes("s3.example")) return reply(200, {});
  if (url.includes("/task/hair-transfer") && opts.method === "POST") return reply(200, { data: { task_id: "TASK1" } });
  if (url.includes("/task/hair-transfer/TASK1")) return reply(200, { data: { task_status: "success", results: { url: "https://cdn.example/out.jpg" } } });
  throw new Error(`unexpected ${url}`);
};

const { handler, resetForTests } = await import("../netlify/functions/api.js");
const call = (method, path, body, query) => handler({ httpMethod: method, path, body: body && JSON.stringify(body), queryStringParameters: query });
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString("base64");

test("health reports the remaining units", async () => {
  const r = await call("GET", "/api/health");
  assert.equal(r.statusCode, 200);
  assert.equal(JSON.parse(r.body).credit, 900);
});

test("upload accepts a JPEG and rejects anything else", async () => {
  assert.equal(JSON.parse((await call("POST", "/api/upload", { image: jpeg })).body).fileId, "FILEID123456");
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");
  assert.equal((await call("POST", "/api/upload", { image: png })).statusCode, 400);
  assert.equal((await call("POST", "/api/upload", {})).statusCode, 400);
});

test("a try-on needs both photos and only forwards known fields", async () => {
  const bad = await call("POST", "/api/task", { feature: "hair-transfer", body: { src_file_id: "FILEID123456" } });
  assert.equal(bad.statusCode, 400);
  sent.length = 0;
  const ok = await call("POST", "/api/task", { feature: "hair-transfer", body: { src_file_id: "FILEID123456", ref_file_id: "FILEID654321", extra: "x" } });
  assert.equal(JSON.parse(ok.body).taskId, "TASK1");
  const forwarded = JSON.parse(sent.find((s) => s.url.includes("/task/hair-transfer")).body);
  assert.deepEqual(forwarded, { src_file_id: "FILEID123456", ref_file_id: "FILEID654321" });
});

test("features outside the allow-list are refused", async () => {
  const r = await call("POST", "/api/task", { feature: "face-swap", body: { src_file_id: "FILEID123456" } });
  assert.equal(r.statusCode, 400);
});

test("status works through the redirected path", async () => {
  const r = await call("GET", "/api/status", null, { feature: "hair-transfer", id: "TASK1" });
  assert.equal(JSON.parse(r.body).results.url, "https://cdn.example/out.jpg");
});

test("live calls pause politely when the budget runs low", async () => {
  credit = 100;
  resetForTests();
  const r = await call("POST", "/api/task", { feature: "hair-transfer", body: { src_file_id: "FILEID123456", ref_file_id: "FILEID654321" } });
  assert.equal(r.statusCode, 429);
  assert.match(JSON.parse(r.body).error, /paused to protect the demo budget/);
  credit = 900;
  resetForTests();
});

test("unknown routes are 404", async () => {
  assert.equal((await call("GET", "/api/nope")).statusCode, 404);
});
