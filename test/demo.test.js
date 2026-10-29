import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { matchWig } from "../src/match.js";

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url)));
const demo = read("public/demo/dana.json");
const catalog = read("catalog/catalog.json");

test("the example has a saved try-on for every wig, so no wig opens on a blank veil", () => {
  for (const wig of catalog) {
    const file = demo.tryons[wig.id];
    assert.ok(file, `no saved try-on for ${wig.id}`);
    assert.ok(existsSync(new URL(`../public/${file}`, import.meta.url)), file);
    assert.ok(existsSync(new URL(`../public/demo/t/${file.split("/").pop()}`, import.meta.url)), `thumbnail for ${file}`);
  }
});

test("the example opens on a wig that clearly changes her, not one that looks like her own hair", () => {
  const lead = catalog.find((w) => w.id === demo.lead);
  assert.ok(lead && demo.tryons[lead.id]);
  const m = matchWig(demo.passport, lead);
  assert.ok(m.colour.dE > 5, `lead colour is too close to hers (ΔE ${m.colour.dE.toFixed(1)})`);
});
