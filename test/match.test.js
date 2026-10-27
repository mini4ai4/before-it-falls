import assert from "node:assert/strict";
import { test } from "node:test";

import { hexToRgb, rgbToLab } from "../src/colour.js";
import { curlIndex, lengthIndex, lengthScore, matchWig, rankWigs, verdict } from "../src/match.js";

const lab = (hex) => rgbToLab(hexToRgb(hex));
const passport = { colour: { lab: lab("#6b5544") }, curl: "2A to 2B", length: "above chest" };

test("curl ranges map to midpoints and unknown types are rejected", () => {
  assert.equal(curlIndex("1 to 2a"), 0.5);
  assert.equal(curlIndex("2A to 2B"), 1.5);
  assert.equal(curlIndex("4b to 4c"), 8.5);
  assert.throws(() => curlIndex("very wavy"));
});

test("length terms cover every value the API can return", () => {
  for (const t of ["above the ears", "ear length", "ear length or longer", "short hair", "short hair or longer", "above chest", "above chest or longer", "long hair"]) {
    assert.ok(Number.isFinite(lengthIndex(t)), t);
  }
  assert.throws(() => lengthIndex("waist"));
});

test("a longer wig costs less than an equally shorter one", () => {
  const longer = lengthScore("short hair", "above chest");
  const shorter = lengthScore("above chest", "short hair");
  assert.ok(longer.score > shorter.score);
});

test("the same hair scores 100 and reads as very close", () => {
  const m = matchWig(passport, { colour: { lab: lab("#6b5544") }, curl: "2A to 2B", length: "above chest" });
  assert.equal(m.total, 100);
  assert.equal(m.verdict, "Very close to you");
  assert.deepEqual(m.reasons, ["same colour at arm's length"]);
});

test("a platinum straight bob ranks below a close brown wave", () => {
  const close = { id: "close", colour: { lab: lab("#705a48") }, curl: "2a to 2b", length: "above chest or longer" };
  const far = { id: "far", colour: { lab: lab("#e8d8b0") }, curl: "1 to 2a", length: "ear length" };
  const ranked = rankWigs(passport, [far, close]);
  assert.equal(ranked[0].wig.id, "close");
  assert.ok(ranked[0].match.total >= 85, `close scored ${ranked[0].match.total}`);
  assert.ok(ranked[1].match.total < 50, `far scored ${ranked[1].match.total}`);
  assert.ok(ranked[1].match.reasons.includes("a different colour"));
  assert.ok(ranked[1].match.reasons.includes("shorter than your hair"));
});

test("verdict bands", () => {
  assert.equal(verdict(90), "Very close to you");
  assert.equal(verdict(75), "Close");
  assert.equal(verdict(55), "A change");
  assert.equal(verdict(20), "A new look");
});
