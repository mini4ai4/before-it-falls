// Before It Falls — the patient's side. Plain modules, no framework.
import { readHairColour, rgbToLab, hexToRgb } from "/lib/colour.js";
import { rankWigs } from "/lib/match.js";
import { describeHair } from "/lib/names.js";

const app = document.getElementById("app");
const ACS_URL = "https://www.cancer.org/cancer/managing-cancer/side-effects/hair-skin-nails/hair-loss/choosing-and-wearing-wig.html";

const state = {
  mode: null, // "demo" | "live"
  photos: {}, // front, left, right, top → { blob, url, width, height }
  taps: [],
  passport: null,
  catalog: [],
  tryons: {}, // wig id → image url
  kept: [],
  filter: "close",
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const today = () => new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function setHairColour(hex) {
  document.documentElement.style.setProperty("--hair", hex);
}

function screen(step, html) {
  app.innerHTML = `
    <header class="top"><span class="mark">Before It Falls</span><span class="step">${esc(step)}</span></header>
    ${html}
    <footer class="small">A cosmetic tool, not medical advice. ${state.mode === "demo" ? "This example uses an AI-generated person and wigs." : "Your photos are sent to YouCam only to read your hair and try wigs on; nothing is stored by us."}</footer>`;
  window.scrollTo({ top: 0 });
}

// ---------- 1. Welcome ----------
function welcome() {
  screen("", `
    <h1>Keep your hair as it is today.</h1>
    <p class="lede">So the wig you choose can match it, when the time comes.</p>
    <div class="notice">
      <p class="quote">“If you are able to plan ahead, there are a few steps you can take to fit and match your wig before you lose your hair.”</p>
      <p class="source">American Cancer Society, <a href="${ACS_URL}" target="_blank" rel="noopener">Wigs for Hair Loss</a></p>
    </div>
    <h2>What we'll do together</h2>
    <ol>
      <li>Take three photos, the way a fitter would want them.</li>
      <li>Read your colour, wave and length, and keep them on one tag.</li>
      <li>Try wigs on your own face, each with a match score.</li>
      <li>Share the tag with your wig fitter, or print it.</li>
    </ol>
    <div class="actions">
      <button id="live">Start with my photos</button>
      <button id="demo" class="outline">See Dana's example first</button>
    </div>`);
  document.getElementById("live").onclick = () => { state.mode = "live"; capture(); };
  document.getElementById("demo").onclick = loadDemo;
}

// ---------- 2. Capture ----------
const SHOTS = [
  ["front", "1 Front", "Look straight at the camera, hair down over your shoulders."],
  ["left", "2 Turn left", "Turn your head about 45° to your left, like saying no."],
  ["right", "3 Turn right", "Now about 45° to your right."],
  ["top", "4 Look down", "Optional: bow your head so the top of your hair shows."],
];

function capture() {
  const chips = SHOTS.map(([k, label]) => `<span class="chip ${state.photos[k] ? "done" : ""}">${label}${state.photos[k] ? " ✓" : ""}</span>`).join("");
  const next = SHOTS.find(([k]) => k !== "top" && !state.photos[k]) || (!state.photos.top ? SHOTS[3] : null);
  const ready = ["front", "left", "right"].every((k) => state.photos[k]);
  screen("Step 1 of 4", `
    <h1>Record your hair today.</h1>
    <div class="chips">${chips}</div>
    <p class="lede">Stand near a window if you can. Daylight shows your real colour.</p>
    ${next ? `
      <div class="tag"><span class="thread"></span>
        <p class="voice" style="margin:0 0 12px">${esc(next[2])}</p>
        <label class="button">${esc(next[1])}: take or choose a photo
          <input type="file" accept="image/*" capture="user" id="shot" hidden>
        </label>
      </div>` : ""}
    <div class="catalog" style="margin-top:16px">${SHOTS.filter(([k]) => state.photos[k]).map(([k, label]) => `<figure><img src="${state.photos[k].url}" alt="${esc(label)}"><figcaption>${esc(label)}</figcaption></figure>`).join("")}</div>
    <div class="actions">
      ${ready ? `<button id="next">Next: show us your colour</button>` : ""}
      <button id="back" class="outline">Back</button>
    </div>`);
  const input = document.getElementById("shot");
  if (input) input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    state.photos[next[0]] = await normalise(file);
    capture();
  };
  document.getElementById("next")?.addEventListener("click", tap);
  document.getElementById("back").onclick = welcome;
}

// Every photo becomes a 768×1024 JPEG: YouCam asks for same-size angle shots,
// and smaller uploads are kinder on a phone connection.
async function normalise(file) {
  const img = await createImageBitmap(file, { imageOrientation: "from-image" });
  const W = 768, H = 1024;
  const scale = Math.max(W / img.width, H / img.height);
  const canvas = Object.assign(document.createElement("canvas"), { width: W, height: H });
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, (W - img.width * scale) / 2, (H - img.height * scale) / 2, img.width * scale, img.height * scale);
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.9));
  return { blob, url: URL.createObjectURL(blob), width: W, height: H };
}

// ---------- 3. Tap the hair ----------
function tap() {
  state.taps = [];
  screen("Step 2 of 4", `
    <h1>Show us your colour.</h1>
    <p class="lede voice">Tap two or three places on your hair: the lengths, not the roots.</p>
    <div class="photo" id="tapzone"><canvas id="c" width="768" height="1024"></canvas><span class="badge" id="count">0 taps</span></div>
    <div class="actions">
      <button id="read" disabled>Read my hair</button>
      <button id="redo" class="outline">Start the taps again</button>
    </div>`);
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const img = new Image();
  img.onload = () => ctx.drawImage(img, 0, 0, 768, 1024);
  img.src = state.photos.front.url;
  const zone = document.getElementById("tapzone");
  zone.onclick = (e) => {
    if (state.taps.length >= 4) return;
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 768;
    const y = ((e.clientY - r.top) / r.height) * 1024;
    state.taps.push([x, y]);
    const ring = Object.assign(document.createElement("span"), { className: "tap" });
    ring.style.left = `${((e.clientX - r.left) / r.width) * 100}%`;
    ring.style.top = `${((e.clientY - r.top) / r.height) * 100}%`;
    zone.appendChild(ring);
    document.getElementById("count").textContent = `${state.taps.length} tap${state.taps.length === 1 ? "" : "s"}`;
    document.getElementById("read").disabled = state.taps.length < 2;
  };
  document.getElementById("redo").onclick = tap;
  document.getElementById("read").onclick = () => {
    const pixels = [];
    for (const [x, y] of state.taps) {
      const d = ctx.getImageData(Math.max(0, x - 18), Math.max(0, y - 18), 36, 36).data;
      for (let i = 0; i < d.length; i += 8) pixels.push([d[i], d[i + 1], d[i + 2]]);
    }
    const crop = document.createElement("canvas");
    crop.width = crop.height = 160;
    const [cx, cy] = state.taps[0];
    crop.getContext("2d").drawImage(canvas, cx - 80, cy - 80, 160, 160, 0, 0, 160, 160);
    reading(readHairColour(pixels), crop.toDataURL("image/jpeg", 0.85));
  };
}

// ---------- 4. Reading (live calls through our function) ----------
async function api(path, body) {
  const res = await fetch(`/api/${path}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function blobToBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

const uploadBlob = async (blob) => (await api("upload", { image: await blobToBase64(blob) })).fileId;

async function runTask(feature, body, onTick) {
  const { taskId } = await api("task", { feature, body });
  for (let i = 0; i < 60; i += 1) {
    await new Promise((r) => setTimeout(r, 2500));
    onTick?.(i);
    const s = await api(`status?feature=${encodeURIComponent(feature)}&id=${encodeURIComponent(taskId)}`);
    if (s.status === "success") return s.results;
    if (s.status === "error") throw new Error(friendlyError(s.error));
  }
  throw new Error("YouCam is taking longer than usual. Please try again.");
}

function friendlyError(code) {
  return ({
    error_face_angle_invalid: "The head angle wasn't quite right for this photo.",
    error_insufficient_lighting: "The photo was a little too dark.",
    error_face_position_too_small: "Your face was too small in the photo.",
    error_mismatch_image_size: "The three photos need to be the same size.",
  })[code] || `YouCam couldn't read this photo (${code || "unknown"}).`;
}

async function reading(colour, cropUrl) {
  setHairColour(colour.hex);
  const rows = [["curl", "Reading your wave from three angles"], ["length", "Reading your length"], ["density", state.photos.top ? "Reading density from the top photo" : "Density: skipped (no top photo)"]];
  screen("Step 3 of 4", `
    <h1>Reading your hair…</h1>
    <div class="tag"><span class="thread"></span>
      <p><span class="swatch"></span> <span class="voice">${esc(describeHair(colour.lab).name)}</span></p>
      <table class="fields">${rows.map(([k, label]) => `<tr><th>${label}</th><td id="r-${k}"><span class="muted">${k === "density" && !state.photos.top ? "—" : "waiting"}</span></td></tr>`).join("")}</table>
    </div>
    <p class="lede" id="msg" style="margin-top:14px">This takes about a minute. YouCam's hair analysis reads each photo.</p>`);
  const set = (k, v) => { const el = document.getElementById(`r-${k}`); if (el) el.textContent = v; };
  try {
    const [front, left, right] = await Promise.all(["front", "left", "right"].map((k) => uploadBlob(state.photos[k].blob)));
    const top = state.photos.top ? await uploadBlob(state.photos.top.blob) : null;
    const jobs = [
      runTask("hair-type-detection", { src_file_ids: [front, right, left] }).then((r) => { set("curl", `${r.hair_type.mapping} · ${r.hair_type.term}`); return r.hair_type; }),
      runTask("hair-length-detection", { src_file_id: front }).then((r) => { set("length", r.hair_length.term); return r.hair_length.term; }),
      top ? runTask("hair-density-detection", { src_file_id: top }).then((r) => { const lv = r.hair_density?.level ?? r.level ?? JSON.stringify(r); set("density", `Level ${lv}`); return lv; }).catch((e) => { set("density", e.message); return null; }) : Promise.resolve(null),
    ];
    const [curl, length, density] = await Promise.all(jobs);
    state.passport = { date: today(), colour, crop: cropUrl, curl: curl.mapping, curlTerm: curl.term, length, density, note: "" };
    passport();
  } catch (e) {
    document.getElementById("msg").innerHTML = `<span class="voice">${esc(e.message)}</span> <button class="outline" id="again" style="margin-top:10px">Take the photos again</button>`;
    document.getElementById("again").onclick = () => { state.photos = {}; capture(); };
  }
}

// ---------- 5. The passport ----------
function passportTag(p, { editable = false } = {}) {
  const d = describeHair(p.colour.lab);
  return `
    <div class="tag" id="passport"><span class="thread"></span>
      <p class="data" style="margin:0 0 12px;font-size:1rem">Hair kept on ${esc(p.date)}</p>
      <p style="display:flex;align-items:center;gap:12px;margin:0">
        ${p.crop ? `<img src="${p.crop}" alt="A close-up of the hair" style="width:64px;height:64px;border-radius:50%;object-fit:cover">` : ""}
        <span class="swatch"></span>
        <span class="voice" style="font-size:1.15rem;line-height:1.25">${esc(d.name)}${p.colour.spread > 8 ? `,<br>lighter strands ${esc(describeHair(p.colour.highlight.lab).name)}` : ""}</span>
      </p>
      <table class="fields">
        <tr><th>Colour</th><td>${esc(p.colour.hex)}${p.colour.spread > 8 ? ` · strands ${esc(p.colour.highlight.hex)}` : ""}<br><span class="muted">${esc(d.fitter)}</span></td></tr>
        <tr><th>Wave</th><td>${esc(p.curl)}<br><span class="muted">${esc(p.curlTerm)}</span></td></tr>
        <tr><th>Length</th><td>${esc(p.length)}</td></tr>
        <tr><th>Density</th><td>${p.density ? `Level ${esc(p.density)} of 4` : `<span class="muted">add a top-of-head photo to fill this in</span>`}</td></tr>
      </table>
      ${editable ? `<input class="note" id="note" placeholder="Anything your fitter should know? e.g. I tuck it behind my left ear." value="${esc(p.note)}" style="width:100%;border:0;background:transparent;font:inherit;font-variation-settings:var(--voice)">` : p.note ? `<p class="note">${esc(p.note)}</p>` : ""}
    </div>`;
}

function passport() {
  setHairColour(state.passport.colour.hex);
  screen("Step 3 of 4", `
    <h1>Your hair, kept.</h1>
    <p class="lede">This is what a fitter needs to match you. It stays with you.</p>
    ${passportTag(state.passport, { editable: true })}
    <details class="notice" style="margin-top:16px"><summary>How we read your colour</summary>
      <p>We read your colour ourselves from the strands you tapped: the middle of the lengths, ignoring shine and shadow, with lighter strands kept separate. A single number from a photo can drift warm or cool with the light, so we also print the words a fitter uses, and the ACS still suggests keeping a real lock of hair from the front of your head.</p>
    </details>
    <div class="actions">
      <button id="try">Try on wigs</button>
      <button id="share" class="outline">Share with my fitter</button>
    </div>`);
  document.getElementById("note").oninput = (e) => { state.passport.note = e.target.value.slice(0, 160); };
  document.getElementById("try").onclick = tryOn;
  document.getElementById("share").onclick = share;
}

// ---------- 6. Try on ----------
function tryOn() {
  const ranked = rankWigs(state.passport, state.catalog).filter(({ wig }) => (state.filter === "close" ? wig.group === "close" : wig.group !== "close"));
  screen("Step 4 of 4", `
    <h1>Try on.</h1>
    <div class="chips">
      <button class="chip ${state.filter === "close" ? "on" : ""}" data-f="close" style="width:auto;min-height:0">Close to you</button>
      <button class="chip ${state.filter === "new" ? "on" : ""}" data-f="new" style="width:auto;min-height:0">Something new</button>
    </div>
    <div class="board">
      <div class="today"><div class="tag" style="padding:26px 8px 10px"><span class="thread"></span><div class="photo"><img src="${state.photos.front.url}" alt="Today"></div><div class="label">Today</div></div></div>
      <div class="wigs">${ranked.map(({ wig, match }) => wigTag(wig, match)).join("")}</div>
    </div>
    <div class="actions">
      <button id="share">${state.kept.length ? `Share my ${state.kept.length} favourite${state.kept.length > 1 ? "s" : ""} with my fitter` : "Share my tag with my fitter"}</button>
      <button id="back" class="outline">Back to my tag</button>
    </div>`);
  app.querySelectorAll("[data-f]").forEach((b) => { b.onclick = () => { state.filter = b.dataset.f; tryOn(); }; });
  app.querySelectorAll("[data-try]").forEach((b) => { b.onclick = () => runTryOn(b.dataset.try, b); });
  app.querySelectorAll("[data-keep]").forEach((b) => { b.onclick = () => toggleKeep(b.dataset.keep); });
  document.getElementById("share").onclick = share;
  document.getElementById("back").onclick = passport;
}

function wigTag(wig, match) {
  const done = state.tryons[wig.id];
  const kept = state.kept.includes(wig.id);
  return `
    <div class="tag wig ${kept ? "kept" : ""}" style="--wig:${esc(wig.colour.hex)}"><span class="thread"></span>
      <div class="row"><div class="photo"><img src="${done || "/" + wig.image}" alt="${esc(wig.name)}${done ? " tried on" : ""}"></div><div class="strip" title="Your colour above, the wig's below"></div></div>
      <div class="meta">${esc(wig.name)}<br><span class="score">${match.total}</span> · <span class="verdict">${esc(match.verdict.toLowerCase())}</span><br><span style="color:var(--ink-soft)">${esc(match.reasons.join(" · "))}</span></div>
      ${done ? `<button data-keep="${wig.id}" class="${kept ? "" : "outline"}">${kept ? "Kept ✓" : "Keep for my fitter"}</button>` : `<button data-try="${wig.id}" class="outline">Try it on</button>`}
    </div>`;
}

async function runTryOn(id, button) {
  const wig = state.catalog.find((w) => w.id === id);
  button.disabled = true;
  button.innerHTML = `<span class="spinner" style="border-top-color:var(--moss);border-color:rgba(77,97,80,.3)"></span> Trying it on…`;
  try {
    if (state.mode === "demo") {
      state.tryons[id] = `/${state.demo.tryons[id]}`;
    } else {
      state.fileIds ??= {};
      state.fileIds.front ??= await uploadBlob(state.photos.front.blob);
      state.fileIds[id] ??= await uploadBlob(await (await fetch(`/${wig.image}`)).blob());
      const r = await runTask("hair-transfer", { src_file_id: state.fileIds.front, ref_file_id: state.fileIds[id] });
      state.tryons[id] = r.url;
    }
    tryOn();
  } catch (e) {
    button.disabled = false;
    button.textContent = e.message.length < 90 ? e.message : "Couldn't try this one. Tap to retry.";
  }
}

function toggleKeep(id) {
  state.kept = state.kept.includes(id) ? state.kept.filter((k) => k !== id) : [...state.kept, id].slice(-3);
  if (navigator.vibrate) navigator.vibrate(10);
  tryOn();
}

// ---------- 7. Share with the fitter ----------
function sharePayload() {
  const p = state.passport;
  const ranked = rankWigs(p, state.catalog);
  return {
    v: 1,
    who: state.mode === "demo" ? "Dana" : "",
    date: p.date,
    note: p.note,
    colour: { hex: p.colour.hex, lab: p.colour.lab.map((x) => +x.toFixed(1)), strands: p.colour.spread > 8 ? p.colour.highlight.hex : null },
    curl: p.curl, curlTerm: p.curlTerm, length: p.length, density: p.density,
    kept: state.kept.map((id) => ({ id, score: ranked.find((r) => r.wig.id === id).match.total })),
  };
}

function share() {
  const payload = btoa(unescape(encodeURIComponent(JSON.stringify(sharePayload())))).replace(/=+$/, "");
  const link = `${location.origin}/fitter.html#${payload}`;
  screen("Share", `
    <h1>For your wig fitter.</h1>
    <p class="lede">Your fitter sees your tag and your favourites. Your photos stay on this phone: the link carries only the measurements and your note.</p>
    ${passportTag(state.passport)}
    <div class="actions">
      <button id="copy">Copy the link for my fitter</button>
      <a class="button outline" href="${link}" target="_blank" rel="noopener">See what my fitter will see</a>
      <button id="print" class="outline">Save as PDF / print</button>
      <button id="back" class="outline">Back to try on</button>
    </div>`);
  document.getElementById("copy").onclick = async (e) => {
    try { await navigator.clipboard.writeText(link); e.target.textContent = "Copied ✓"; } catch { prompt("Copy this link:", link); }
  };
  document.getElementById("print").onclick = () => window.print();
  document.getElementById("back").onclick = tryOn;
}

// ---------- Demo: a real, frozen run so the example costs nothing ----------
async function loadDemo() {
  state.mode = "demo";
  const demo = await (await fetch("/demo/dana.json")).json();
  state.demo = demo;
  for (const k of ["front", "left", "right"]) state.photos[k] = { url: `/demo/dana_${k}.jpg` };
  state.passport = { ...demo.passport, date: today() };
  state.passport.colour.highlight.lab ??= rgbToLab(hexToRgb(state.passport.colour.highlight.hex));
  passport();
}

async function boot() {
  state.catalog = await (await fetch("/catalog/catalog.json")).json();
  welcome();
}

boot();
