"""Pulls likely hair pixels from a wig product photo.

Colour alone can't tell blonde hair from a mannequin's skin, so this uses where
hair sits in a front-view product shot: the crown band above the forehead and
the outer strips beside the face, minus the white studio background. Output:
JSON {path: [[r, g, b], ...]} for src/colour.js readHairColour."""
import json, random, sys
from PIL import Image

def is_background(r, g, b):
    return min(r, g, b) > 225 and max(r, g, b) - min(r, g, b) < 18

def in_hair_zone(x, y, w, h):
    crown = 0.03 * h <= y <= 0.16 * h and 0.25 * w <= x <= 0.75 * w
    sides = 0.20 * h <= y <= 0.62 * h and (x <= 0.27 * w or x >= 0.73 * w)
    return crown or sides

def hair_pixels(path, n=3000, seed=7):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    px = im.load()
    keep = [px[x, y] for y in range(0, h, 2) for x in range(0, w, 2)
            if in_hair_zone(x, y, w, h) and not is_background(*px[x, y])]
    random.Random(seed).shuffle(keep)
    return keep[:n]

if __name__ == "__main__":
    json.dump({p: hair_pixels(p) for p in sys.argv[1:]}, sys.stdout)
