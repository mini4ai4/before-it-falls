import assert from "node:assert/strict";
import { test } from "node:test";

import { YouCam } from "../src/youcam.js";

function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, opts = {}) => {
    calls.push({ url, method: opts.method, body: opts.body });
    const route = routes.find(([match]) => url.includes(match));
    if (!route) throw new Error(`unexpected ${url}`);
    const [, status, payload] = route;
    const text = typeof payload === "function" ? JSON.stringify(payload(url, opts)) : JSON.stringify(payload);
    return { ok: status < 400, status, text: async () => text };
  };
  return { impl, calls };
}

const credit = (amount) => ["/client/credit", 200, { status: 200, results: [{ amount }] }];

test("refuses to run without a key", () => {
  assert.throws(() => new YouCam({ key: "" }));
});

test("blocks live tasks when the balance is under the floor", async () => {
  const { impl, calls } = fakeFetch([credit(120)]);
  const yc = new YouCam({ key: "k", fetchImpl: impl });
  await assert.rejects(yc.start("hair-transfer", {}), (e) => e.code === "budget");
  assert.equal(calls.filter((c) => c.url.includes("/task/")).length, 0, "no task was created");
});

test("only allow-listed features can run", async () => {
  const { impl } = fakeFetch([credit(900)]);
  const yc = new YouCam({ key: "k", fetchImpl: impl });
  await assert.rejects(yc.start("face-swap", {}), /not allowed/);
  await assert.rejects(yc.status("text-to-image", "abcd"), /not allowed/);
});

test("starts a task under the right API version and resets the credit cache", async () => {
  const { impl, calls } = fakeFetch([credit(900), ["/task/hair-transfer", 200, { status: 200, data: { task_id: "T123" } }]]);
  const yc = new YouCam({ key: "k", fetchImpl: impl });
  assert.equal(await yc.start("hair-transfer", { src_file_id: "a", ref_file_id: "b" }), "T123");
  assert.ok(calls.some((c) => c.url.endsWith("/s2s/v2.1/task/hair-transfer") && c.method === "POST"));
  assert.equal(yc.creditCache, null);
});

test("credit is cached for a minute", async () => {
  let t = 0;
  const { impl, calls } = fakeFetch([credit(500)]);
  const yc = new YouCam({ key: "k", fetchImpl: impl, now: () => t });
  await yc.credit();
  t = 30_000;
  await yc.credit();
  assert.equal(calls.length, 1);
  t = 61_000;
  await yc.credit();
  assert.equal(calls.length, 2);
});

test("upload asks for a presigned URL, then PUTs the bytes", async () => {
  const { impl, calls } = fakeFetch([
    ["/s2s/v2.0/file", 200, { status: 200, data: { files: [{ file_id: "F1", requests: [{ url: "https://s3.example/put", headers: { "Content-Type": "image/jpg" } }] }] } }],
    ["s3.example/put", 200, {}],
  ]);
  const yc = new YouCam({ key: "k", fetchImpl: impl });
  assert.equal(await yc.upload(new Uint8Array([1, 2, 3])), "F1");
  assert.equal(JSON.parse(calls[0].body).files[0].file_size, 3);
  assert.equal(calls[1].method, "PUT");
});

test("status returns the result and rejects odd task ids", async () => {
  const { impl } = fakeFetch([["/task/hair-type-detection/", 200, { status: 200, data: { task_status: "success", results: { hair_type: { mapping: "2A to 2B" } } } }]]);
  const yc = new YouCam({ key: "k", fetchImpl: impl });
  const s = await yc.status("hair-type-detection", "T-1");
  assert.equal(s.status, "success");
  assert.equal(s.results.hair_type.mapping, "2A to 2B");
  await assert.rejects(yc.status("hair-type-detection", "../../client/credit"), /Bad task id/);
});

test("API errors surface their error code", async () => {
  const { impl } = fakeFetch([["/client/credit", 401, { status: 401, error_code: "InvalidApiKey" }]]);
  const yc = new YouCam({ key: "k", fetchImpl: impl });
  await assert.rejects(yc.credit(), /401 InvalidApiKey/);
});
