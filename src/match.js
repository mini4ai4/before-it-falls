// How close a wig is to the hair in the passport. Deterministic and explainable:
// every number on screen comes from this file, no model opinions.
import { deltaE2000 } from "./colour.js";

const CURL_ORDER = ["1", "2a", "2b", "2c", "3a", "3b", "3c", "4a", "4b", "4c"];

const LENGTH_ORDER = {
  "above the ears": 0,
  "ear length": 1,
  "ear length or longer": 1.5,
  "short hair": 2,
  "short hair or longer": 2.5,
  "above chest": 3,
  "above chest or longer": 3.5,
  "long hair": 4,
};

export const WEIGHTS = Object.freeze({ colour: 0.6, curl: 0.25, length: 0.15 });

const clamp = (v) => Math.max(0, Math.min(100, v));

// "2A to 2B" → 1.5 (the midpoint between the two curl classes).
export function curlIndex(mapping) {
  const parts = String(mapping).toLowerCase().split(/\s*to\s*/).map((p) => p.trim());
  const idx = parts.map((p) => CURL_ORDER.indexOf(p));
  if (!idx.length || idx.some((i) => i < 0)) throw new Error(`Unknown curl type: ${mapping}`);
  return idx.reduce((s, i) => s + i, 0) / idx.length;
}

export function lengthIndex(term) {
  const v = LENGTH_ORDER[String(term).toLowerCase().trim()];
  if (v === undefined) throw new Error(`Unknown hair length: ${term}`);
  return v;
}

export function colourScore(passportLab, wigLab) {
  const dE = deltaE2000(passportLab, wigLab);
  return { dE, score: clamp(100 - 5 * dE) };
}

export function curlScore(passportMapping, wigMapping) {
  const dist = Math.abs(curlIndex(passportMapping) - curlIndex(wigMapping));
  return { dist, score: clamp(100 - 30 * dist) };
}

// A fitter can cut a wig shorter but can't make it longer, so a longer wig costs half.
export function lengthScore(passportTerm, wigTerm) {
  const diff = lengthIndex(wigTerm) - lengthIndex(passportTerm);
  const penalty = diff > 0 ? 12.5 * diff : 25 * -diff;
  return { diff, score: clamp(100 - penalty) };
}

export function colourWords(dE) {
  if (dE <= 2) return "same colour at arm's length";
  if (dE <= 5) return "very close colour";
  if (dE <= 10) return "slightly different shade";
  return "a different colour";
}

export function verdict(total) {
  if (total >= 85) return "Very close to you";
  if (total >= 70) return "Close";
  if (total >= 50) return "A change";
  return "A new look";
}

export function matchWig(passport, wig) {
  const colour = colourScore(passport.colour.lab, wig.colour.lab);
  const curl = curlScore(passport.curl, wig.curl);
  const length = lengthScore(passport.length, wig.length);
  const total = Math.round(WEIGHTS.colour * colour.score + WEIGHTS.curl * curl.score + WEIGHTS.length * length.score);
  const reasons = [colourWords(colour.dE)];
  if (curl.dist >= 1) reasons.push(curl.dist >= 2 ? "very different curl" : "a bit more or less wave");
  if (length.diff > 0) reasons.push("longer, can be trimmed");
  if (length.diff < 0) reasons.push("shorter than your hair");
  return { total, verdict: verdict(total), colour, curl, length, reasons };
}

export function rankWigs(passport, wigs) {
  return wigs.map((wig) => ({ wig, match: matchWig(passport, wig) })).sort((a, b) => b.match.total - a.match.total);
}
