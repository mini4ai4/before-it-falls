import assert from "node:assert/strict";
import { test } from "node:test";

import { hexToRgb, rgbToLab } from "../src/colour.js";
import { describeHair, hairLevel } from "../src/names.js";

const d = (hex) => describeHair(rgbToLab(hexToRgb(hex)));

test("levels run from black to lightest blonde", () => {
  assert.equal(hairLevel([4, 0, 0]), 1);
  assert.equal(hairLevel([95, 0, 0]), 10);
  assert.ok(d("#151316").level <= 2, "black wig reads as black");
  assert.ok(d("#cfa97f").level >= 7, "honey blonde reads as blonde");
});

test("the demo hair reads as a warm brown, not auburn", () => {
  const r = d("#665143");
  assert.ok([5, 6].includes(r.level), `level ${r.level}`);
  assert.match(r.name, /brown/);
  assert.doesNotMatch(r.name, /copper/);
});

test("silver and grey are named as such", () => {
  assert.equal(d("#c6c3c7").name, "silver");
  assert.equal(d("#675c5c").tone, "grey-brown", "brown with a silver blend");
  assert.match(d("#675c5c").name, /with grey$/);
});

test("auburn reads as copper", () => {
  assert.equal(d("#8a3b22").tone, "copper");
  assert.equal(d("#633322").tone, "copper", "the auburn wig");
  assert.equal(d("#645655").tone, "ash", "the cool ash brown wig");
});

test("the fitter line is short and plain", () => {
  assert.match(d("#665143").fitter, /^≈ level \d+, [a-z-]+$/);
});
