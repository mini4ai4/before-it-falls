// Reads each wig's colour with the same code the patient's photo goes through.
import { readFileSync, writeFileSync } from "node:fs";
import { readHairColour } from "../src/colour.js";

const pixels = JSON.parse(readFileSync(process.argv[2], "utf8"));
const labels = JSON.parse(readFileSync("catalog/labels.json", "utf8"));
const catalog = labels.map((w) => {
  const reading = readHairColour(pixels[`catalog/${w.id}.jpg`]);
  return { ...w, image: `catalog/${w.id}.jpg`, colour: { hex: reading.hex, lab: reading.lab.map((v) => +v.toFixed(2)), highlight: reading.highlight.hex, samples: reading.samples } };
});
writeFileSync("catalog/catalog.json", JSON.stringify(catalog, null, 1));
for (const w of catalog) console.log(w.id, w.colour.hex, w.colour.highlight, w.curl, w.length, w.name);
