// Before It Falls — the patient's side. Plain modules, no framework.
import { readHairColour, rgbToLab, hexToRgb } from "/lib/colour.js";
import { rankWigs, splitByCloseness } from "/lib/match.js";
import { describeHair } from "/lib/names.js";
import { hang } from "/sway.js";

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

// Two panes: on a phone they stack exactly as before (plain blocks); from 1024 px wide they sit side by side.
const split = (a, b, cls = "") => `<div class="split ${cls}"><div class="pane">${a}</div><div class="pane">${b}</div></div>`;

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
  // Long threads first: each tag is its own layer, so earlier strings paint behind later tags.
  const tags = [
    { src: "/demo/tryon_w06.jpg", cap: "69", x: "84%", len: 196, w: 78 },
    { src: "/demo/tryon_w01.jpg", cap: "83", x: "16%", len: 150, w: 92 },
    { src: "/demo/tryon_w15.jpg", cap: "73", x: "78%", len: 26, w: 84 },
    { src: "/demo/dana_front.jpg", cap: "Today", x: "47%", len: 70, w: 138, today: true },
  ];
  screen("", split(`
    <div class="mobile" id="mobile" aria-hidden="true">
      ${tags.map((t) => `<div class="hang" data-hang style="--x:${t.x};--len:${t.len}px;--w:${t.w}px"><div class="string"></div><div class="mini ${t.today ? "today" : ""}"><img src="${t.src}" alt=""><div class="cap">${t.cap}</div></div></div>`).join("")}
    </div>`, `
    <h1 class="hero">Keep your hair as it is today.</h1>
    <p class="lede">So the wig you choose can match it, when the time comes.</p>
    <div class="actions" style="margin-top:14px">
      <button id="live">Begin with my photos</button>
      <button id="demo" class="outline">See Dana's example</button>
    </div>
    <div class="notice" style="margin-top:26px">
      <p class="quote">“If you are able to plan ahead, there are a few steps you can take to fit and match your wig before you lose your hair.”</p>
      <p class="source">American Cancer Society, <a href="${ACS_URL}" target="_blank" rel="noopener">Wigs for Hair Loss</a></p>
    </div>
    <h2>What we'll do together</h2>
    <ol>
      <li>Take three photos, the way a fitter would want them.</li>
      <li>Read your colour, wave and length, and keep them on one tag.</li>
      <li>Try wigs on your own face: drag the thread to compare.</li>
      <li>Share the tag with your wig fitter, or print it.</li>
    </ol>`, "welcome"));
  state.unhang?.();
  state.unhang = hang(document.getElementById("mobile"));
  document.getElementById("live").onclick = () => { state.unhang?.(); state.mode = "live"; capture(); };
  document.getElementById("demo").onclick = () => { state.unhang?.(); loadDemo(); };
}

// ---------- 2. Capture ----------
const SHOTS = [
  ["front", "1 Front", "Look straight at the camera, hair down over your shoulders."],
  ["left", "2 Turn left", "Turn your head about 45° to your left, like saying no."],
  ["right", "3 Turn right", "Now about 45° to your right."],
  ["top", "4 Look down", "Optional: bow your head so the top of your hair shows."],
];

function capture() {
  // The current shot is the one the person picked (to redo it), else the next missing one.
  const chosen = SHOTS.find(([k]) => k === state.activeShot);
  const next = chosen || SHOTS.find(([k]) => k !== "top" && !state.photos[k]) || (!state.photos.top ? SHOTS[3] : null);
  const chips = SHOTS.map(([k, label]) => `<button class="chip ${next && next[0] === k ? "on" : state.photos[k] ? "done" : ""}" data-shot="${k}" style="width:auto;min-height:0">${label}${state.photos[k] ? " ✓" : ""}</button>`).join("");
  const ready = ["front", "left", "right"].every((k) => state.photos[k]);
  screen("Step 1 of 4", `
    <h1>Record your hair today.</h1>
    <div class="chips">${chips}</div>
    <p class="lede">Stand near a window if you can. Daylight shows your real colour.</p>
    ${split(`${next ? `
      <div class="tag"><span class="thread"></span>
        <p class="data" style="margin:0 0 6px;color:var(--ink-soft)">${esc(next[1])}</p><p class="voice" style="margin:0 0 14px">${esc(next[2])}</p>
        <div style="display:grid;gap:10px">
          <label class="button">Take the photo
            <input type="file" accept="image/*" capture="user" class="shot" hidden>
          </label>
          <label class="button outline">Choose from my photos
            <input type="file" accept="image/*" class="shot" hidden>
          </label>
        </div>
      </div>` : ""}`, `
    <div class="catalog" style="margin-top:16px">${SHOTS.filter(([k]) => state.photos[k]).map(([k, label]) => `<figure style="cursor:default"><img src="${state.photos[k].url}" alt="${esc(label)}"><figcaption style="display:flex;justify-content:space-between;align-items:center;gap:4px">${esc(label)}<button class="chip" data-retake="${k}" style="width:auto;min-height:0;padding:3px 8px">Retake</button></figcaption></figure>`).join("")}</div>
    <div class="actions">
      ${ready ? `<button id="next">Next: show us your colour</button>` : ""}
      <button id="back" class="outline">Back</button>
    </div>`)}`);
  // One input opens the camera; the other (no capture attribute) opens the photo library.
  app.querySelectorAll("input.shot").forEach((input) => {
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      state.photos[next[0]] = await normalise(file);
      state.activeShot = null;
      capture();
    };
  });
  app.querySelectorAll("[data-shot]").forEach((b) => { b.onclick = () => { state.activeShot = b.dataset.shot; capture(); }; });
  app.querySelectorAll("[data-retake]").forEach((b) => {
    b.onclick = () => { delete state.photos[b.dataset.retake]; state.fileIds = null; state.activeShot = b.dataset.retake; capture(); };
  });
  document.getElementById("next")?.addEventListener("click", () => { state.activeShot = null; tap(); });
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
    <p class="lede voice">Tap three or four places on your hair, spread across the lengths: not the roots, not the shine.</p>
    ${split(`<div class="photo" id="tapzone"><canvas id="c" width="768" height="1024"></canvas><span class="badge" id="count">0 taps</span></div>`, `
    <div class="actions">
      <button id="read" disabled>Read my hair</button>
      <button id="redo" class="outline">Start the taps again</button>
    </div>`)}`);
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
      ${editable ? `<textarea class="note" id="note" rows="2" maxlength="160" placeholder="Anything your fitter should know? For example: I tuck it behind my left ear." style="width:100%;border:0;background:transparent;font:inherit;font-variation-settings:var(--voice);resize:none">${esc(p.note)}</textarea>` : p.note ? `<p class="note">${esc(p.note)}</p>` : ""}
    </div>`;
}

function passport() {
  setHairColour(state.passport.colour.hex);
  screen("Step 3 of 4", `
    <h1>Your hair, kept.</h1>
    <p class="lede">This is what a fitter needs to match you. It stays with you.</p>
    ${split(passportTag(state.passport, { editable: true }), `
    <details class="notice" style="margin-top:16px"><summary>How we read your colour</summary>
      <p>We read your colour ourselves from the strands you tapped: the middle of the lengths, ignoring shine and shadow, with lighter strands kept separate. A single number from a photo can drift warm or cool with the light, so we also print the words a fitter uses, and the ACS still suggests keeping a real lock of hair from the front of your head.</p>
    </details>
    <div class="actions">
      <button id="try">Try on wigs</button>
      <button id="share" class="outline">Share with my fitter</button>
    </div>`)}`);
  document.getElementById("note").oninput = (e) => { state.passport.note = e.target.value.slice(0, 160); };
  document.getElementById("try").onclick = tryOn;
  document.getElementById("share").onclick = share;
}

// Small 240 px copies for the reel: catalogue photos and the example's frozen try-ons. Live try-ons are used as they are.
const thumb = (url) => (/^\/(catalog|demo)\/[^/]+\.jpg$/.test(url) ? url.replace(/\/([^/]+\.jpg)$/, "/t/$1") : url);

// ---------- 6. Try on: drag the red thread across your face ----------
function tryOn() {
  const groups = splitByCloseness(rankWigs(state.passport, state.catalog));
  // The example opens on its lead wig (one that clearly changes her), wherever it ranks, so the split sells itself.
  if (state.lead) {
    state.filter = groups.close.some((r) => r.wig.id === state.lead) ? "close" : "new";
    state.current = state.lead;
    state.lead = null;
  }
  const ranked = state.filter === "close" ? groups.close : groups.other;
  if (!ranked.some((r) => r.wig.id === state.current)) state.current = ranked[0]?.wig.id;
  const { wig, match } = ranked.find((r) => r.wig.id === state.current);
  // The example's try-ons are already real YouCam results, so it opens straight onto the thread.
  if (state.mode === "demo" && !state.tryons[wig.id] && state.demo.tryons[wig.id]) state.tryons[wig.id] = `/${state.demo.tryons[wig.id]}`;
  const done = state.tryons[wig.id];
  const kept = state.kept.includes(wig.id);
  screen("Step 4 of 4", `
    <h1>Drag to try on.</h1>
    <div class="chips">
      <button class="chip ${state.filter === "close" ? "on" : ""}" data-f="close" style="width:auto;min-height:0">Close to you</button>
      <button class="chip ${state.filter === "new" ? "on" : ""}" data-f="new" style="width:auto;min-height:0">Something new</button>
    </div>
    ${split(`<div class="tag" style="padding:30px 12px 14px"><span class="thread"></span>
      ${done ? `<div class="stamp"><b>${match.total}</b><small>${esc(match.verdict)}</small></div>` : ""}
      <div class="compare" id="cmp">
        <img src="${state.photos.front.url}" alt="Your hair today">
        <img class="after" src="${done || "/" + wig.image}" alt="${esc(wig.name)}${done ? " on your face" : ""}">
        ${done ? `<div class="divider"></div><div class="knot" role="slider" aria-label="Drag to compare" tabindex="0"></div><span class="side l">today</span><span class="side r">wig</span>`
               : `<div class="veil"><button id="tryit">Try it on my face</button></div>`}
      </div>
      <p class="data" style="margin:12px 0 0;font-size:0.92rem">${esc(wig.name)}</p>
      <div class="duo"><span style="background:${esc(state.passport.colour.hex)}">your colour</span><span style="background:${esc(wig.colour.hex)}">this wig</span></div>
      <p class="source" style="margin:2px 0 0">${esc(match.reasons.join(" · "))}</p>
      ${done ? `<div class="actions" style="margin-top:14px"><button id="keep" class="${kept ? "" : "outline"}">${kept ? "Kept for my fitter ✓" : "Keep for my fitter"}</button></div>` : ""}
    </div>`, `
    <div class="reel" id="reel">${ranked.map(({ wig: w, match: m }) => `
      <div class="mini ${w.id === state.current ? "on" : ""}" data-pick="${w.id}">${state.kept.includes(w.id) ? `<span class="kept-dot"></span>` : ""}
        <img src="${thumb(state.tryons[w.id] || "/" + w.image)}" alt="${esc(w.name)}" loading="lazy" decoding="async"><div class="cap">${m.total}</div></div>`).join("")}
    </div>
    <details class="notice" style="margin-top:12px"><summary>How the score works</summary>
      <p>Every number is worked out the same way, with no opinions from a model. <b>Colour counts 60%</b>: the CIEDE2000 difference between your measured colour and the wig's (2 or less looks the same at arm's length). <b>Wave counts 25%</b>: how far apart the curl types are. <b>Length counts 15%</b>: a longer wig costs half as much as a shorter one, because a fitter can trim a wig but can't make it longer. The try-on photo is YouCam's hair transfer on your own face.</p>
    </details>
    <div class="actions">
      <button id="share">${state.kept.length ? `Share my ${state.kept.length} favourite${state.kept.length > 1 ? "s" : ""} with my fitter` : "Share my tag with my fitter"}</button>
      <button id="back" class="outline">Back to my tag</button>
    </div>`, "tryon")}`);
  app.querySelectorAll("[data-f]").forEach((b) => { b.onclick = () => { state.filter = b.dataset.f; state.current = null; tryOn(); }; });
  app.querySelectorAll("[data-pick]").forEach((t) => { t.onclick = () => { state.current = t.dataset.pick; tryOn(); }; });
  document.getElementById("tryit")?.addEventListener("click", (e) => runTryOn(wig.id, e.currentTarget));
  document.getElementById("keep")?.addEventListener("click", () => toggleKeep(wig.id));
  document.getElementById("share").onclick = share;
  document.getElementById("back").onclick = passport;
  document.querySelector(".reel .on")?.scrollIntoView({ inline: "center", block: "nearest" });
  if (done) dragThread(document.getElementById("cmp"));
}

// The red thread is the divider: drag it to reveal the wig on your own face.
function dragThread(cmp) {
  const set = (f) => cmp.style.setProperty("--cut", `${(Math.max(0.03, Math.min(0.97, f)) * 100).toFixed(1)}%`);
  const from = (e) => { const r = cmp.getBoundingClientRect(); return (e.clientX - r.left) / r.width; };
  let dragging = false;
  cmp.addEventListener("pointerdown", (e) => { dragging = true; cmp.setPointerCapture(e.pointerId); set(from(e)); });
  cmp.addEventListener("pointermove", (e) => { if (dragging) set(from(e)); });
  cmp.addEventListener("pointerup", () => { dragging = false; });
  cmp.querySelector(".knot")?.addEventListener("keydown", (e) => {
    const now = parseFloat(cmp.style.getPropertyValue("--cut") || "50") / 100;
    if (e.key === "ArrowLeft") set(now - 0.05);
    if (e.key === "ArrowRight") set(now + 0.05);
  });
  // A first glide shows what the thread does, unless motion is reduced.
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches && !state.glided) {
    state.glided = true;
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / 1400);
      const ease = 1 - (1 - p) ** 3;
      set(0.92 - 0.42 * ease);
      if (p < 1 && !dragging) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

async function runTryOn(id, button) {
  const wig = state.catalog.find((w) => w.id === id);
  button.disabled = true;
  button.innerHTML = `<span class="spinner"></span> Trying it on…`;
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
    ${split(passportTag(state.passport), `${state.kept.length ? `<h2>The wigs I liked</h2><div class="catalog">${state.kept.map((id) => {
      const wig = state.catalog.find((w) => w.id === id);
      const m = rankWigs(state.passport, [wig])[0].match;
      return `<figure style="cursor:default"><img src="${state.tryons[id] || "/" + wig.image}" alt="${esc(wig.name)} tried on"><figcaption>${esc(wig.name)}<br><b>${m.total}</b> · ${esc(m.verdict.toLowerCase())}</figcaption></figure>`;
    }).join("")}</div><p class="source">These try-on photos stay on this phone and in your printout. The link only carries the measurements.</p>` : ""}
    <div class="actions">
      <button id="copy">Copy the link for my fitter</button>
      <button id="shop" class="outline">Ask a wig shop for this</button>
      <a class="button outline" href="${link}" target="_blank" rel="noopener">See what my fitter will see</a>
      <button id="print" class="outline">Save as PDF / print</button>
      <button id="back" class="outline">Back to try on</button>
    </div>`)}`);
  document.getElementById("copy").onclick = async (e) => {
    try { await navigator.clipboard.writeText(link); e.target.textContent = "Copied ✓"; } catch { prompt("Copy this link:", link); }
  };
  // The buying step: one message a person can paste into any wig shop's chat or contact form. It describes the
  // hair the way shops list wigs (colour level and tone, curl type, length) plus the wigs they liked, by name.
  document.getElementById("shop").onclick = async (e) => {
    const p = state.passport;
    const liked = state.kept.map((id) => state.catalog.find((w) => w.id === id)?.name).filter(Boolean);
    const msg = [
      "Hi, I'm looking for a wig that matches my own hair before treatment.",
      `Colour: ${describeHair(p.colour.lab).name}, ${describeHair(p.colour.lab).fitter} (hex ${p.colour.hex}).`,
      `Curl: ${p.curl.toUpperCase()}${p.curlTerm ? ` (${p.curlTerm})` : ""}. Length: ${p.length}.`,
      liked.length ? `Styles I liked: ${liked.join("; ")}.` : "",
      "Do you have something close? Thank you.",
    ].filter(Boolean).join("\n");
    try { await navigator.clipboard.writeText(msg); e.target.textContent = "Message copied ✓ paste it into the shop's chat"; } catch { prompt("Copy this message:", msg); }
  };
  document.getElementById("print").onclick = () => window.print();
  document.getElementById("back").onclick = tryOn;
}

// ---------- Demo: a real, frozen run so the example costs nothing ----------
async function loadDemo() {
  state.mode = "demo";
  const demo = await (await fetch("/demo/dana.json")).json();
  state.demo = demo;
  state.lead = demo.lead;
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
