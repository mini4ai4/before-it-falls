# Before It Falls

**Keep your hair as it is today, so the wig you choose can match it.**

Live: https://before-it-falls.netlify.app · tap *See Dana's example first* for an instant walk-through.

The American Cancer Society tells people facing cancer treatment: *"If you are able to plan ahead, there are a few steps you can take to fit and match your wig before you lose your hair."* Take photos of your hairstyle, save a lock from the front, compare colours in natural light ([ACS, Wigs for Hair Loss](https://www.cancer.org/cancer/managing-cancer/side-effects/hair-skin-nails/hair-loss/choosing-and-wearing-wig.html)). Before It Falls turns that advice into one sitting at home:

1. **Capture** three photos the way a fitter would want them (front, 45° left, 45° right; optional top of head).
2. **Read** the hair: colour from the strands you tap, wave and length from YouCam's hair analysis.
3. **Keep** it on a Hair Passport tag, in the words a wig fitter uses ("≈ level 4, warm"), with your own note.
4. **Try on** wigs on your own face with YouCam hair transfer, each with a match score that explains itself.
5. **Share** a link with your fitter. It carries measurements and your note, never your photos.

## YouCam APIs used

| What | Endpoint | Why |
|---|---|---|
| Wave (curl type) | `POST /s2s/v2.0/task/hair-type-detection` (front, right, left) | Curl class 1–4C for the passport and the match |
| Length | `POST /s2s/v2.0/task/hair-length-detection` | Length class for the passport and the match |
| Try-on | `POST /s2s/v2.1/task/hair-transfer` with the wig product photo as the custom reference | Shows the wig on the person's own face |
| Files and balance | `POST /s2s/v2.0/file`, `GET /s2s/v1.0/client/credit` | Uploads, and a budget guard |

Tried and not used: `hair-density-detection`. We wired it to the optional top-of-head photo, but it never returned a level on our photos (it rejected the head angle each time), so the passport says density is "not recorded" and we don't count it as a feature.

## How the match score works

Every number comes from `src/match.js`, with no model opinions:

- **Colour, 60%:** CIEDE2000 between the measured hair colour and the wig's (checked against the Sharma, Wu & Dalal reference pairs). ΔE ≤ 2 reads as the same colour at arm's length.
- **Wave, 25%:** distance between curl classes ("2A to 2B" is 1.5 on a 0–9 scale).
- **Length, 15%:** a longer wig costs half as much as a shorter one, because a fitter can trim a wig but can't make it longer.

Colour is read by our own code (`src/colour.js`): the median of the tapped strands in CIELAB, with shine and shadow trimmed and lighter strands kept separate. We tested the analyzer's single hair hex on our demo photo and it came out noticeably warmer than the real hair, so we don't rely on one number; the passport also prints fitter words and, following the ACS, still suggests keeping a real lock of hair.

## Honesty and privacy

- Cosmetic language only. No medical claims; the ACS is quoted for timing.
- The example person "Dana" and the wigs are AI-generated and labelled as such. Her wave and length were read by YouCam on these photos, and every try-on in the example is a real YouCam result, saved once so judges can click through without spending units.
- Photos go to YouCam only to be read and tried on. We store nothing. The fitter link holds measurements, scores and the note in the URL itself.
- Live calls pause when the balance falls under 150 units; the example keeps working.

## Run it

```bash
npm install          # esbuild, for the function bundle
npm test             # 36 tests: colour science, scoring, names, YouCam client, API function, example data
NETLIFY_TOKEN=... YOUCAM_API_KEY=... python3 scripts/deploy.py --yes --env   # Netlify site + function; the key is set as a site env var
```

To walk the example in a headless Chrome and save screenshots (no YouCam calls): copy `src/colour.js`, `match.js` and `names.js` into `public/lib/`, serve `public/` (`python3 -m http.server 8000`), then `python3 e2e/drive.py http://127.0.0.1:8000 OUT_DIR 390 844`.

`public/` is the static app (plain ES modules), `netlify/functions/api.js` is the only server code (upload, task, status, health), `src/` holds the shared, tested modules the browser also loads.

## Built for

The YouCam API Skin AI & eCommerce VTO Hackathon (Devpost), 2026.

MIT License · © 2026 Roma Pryvrotskyi
