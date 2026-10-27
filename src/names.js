// Turns a measured hair colour (CIELAB) into the words a wig fitter uses:
// a level from 1 (black) to 10 (lightest blonde) and a tone.

const LEVEL_WORDS = {
  1: "black",
  2: "soft black",
  3: "darkest brown",
  4: "dark brown",
  5: "medium brown",
  6: "light brown",
  7: "dark blonde",
  8: "medium blonde",
  9: "light blonde",
  10: "lightest blonde",
};

// Hair in daylight photos sits darker than printed level charts, so levels are
// interpolated through anchors measured on real wig photos (black ≈ L* 6,
// deep mocha ≈ 16, chestnut ≈ 33, light caramel ≈ 51, honey blonde ≈ 72).
const LEVEL_ANCHORS = [[5, 1], [12, 2], [18, 3], [24, 4], [31, 5], [39, 6], [48, 7], [58, 8], [68, 9], [78, 10]];

export function hairLevel([L]) {
  if (L <= LEVEL_ANCHORS[0][0]) return 1;
  for (let i = 1; i < LEVEL_ANCHORS.length; i += 1) {
    const [l1, v1] = LEVEL_ANCHORS[i - 1];
    const [l2, v2] = LEVEL_ANCHORS[i];
    if (L <= l2) return Math.round(v1 + ((L - l1) / (l2 - l1)) * (v2 - v1));
  }
  return 10;
}

export function hairTone([L, a, b]) {
  const chroma = Math.hypot(a, b);
  const hue = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  if (chroma < 6) return L > 55 ? "silver" : L > 30 ? "grey-brown" : "neutral";
  if (chroma < 11) return "ash";
  if (hue < 50 && chroma >= 18) return "copper";
  if (hue > 68) return "golden";
  return "warm";
}

export function describeHair(lab) {
  const level = hairLevel(lab);
  const tone = hairTone(lab);
  const words = LEVEL_WORDS[level];
  const name = tone === "silver" ? "silver" : tone === "neutral" ? words : tone === "grey-brown" ? `${words} with grey` : `${tone} ${words}`;
  return { level, tone, name, fitter: `≈ level ${level}, ${tone}` };
}
