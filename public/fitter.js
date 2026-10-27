// The wig fitter's side: everything comes from the link itself. No photos, no account.
import { describeHair } from "/lib/names.js";

const app = document.getElementById("app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function decode() {
  try {
    const raw = location.hash.slice(1);
    const json = decodeURIComponent(escape(atob(raw + "=".repeat((4 - (raw.length % 4)) % 4))));
    const data = JSON.parse(json);
    if (data.v !== 1 || !Array.isArray(data.colour?.lab)) throw new Error("bad tag");
    return data;
  } catch {
    return null;
  }
}

async function render() {
  const t = decode();
  if (!t) {
    app.innerHTML = `<h1>This link is incomplete.</h1><p class="lede">Ask for the link again: it should end with a long code after the # sign.</p>`;
    return;
  }
  const catalog = await (await fetch("/catalog/catalog.json")).json();
  const d = describeHair(t.colour.lab);
  document.documentElement.style.setProperty("--hair", t.colour.hex);
  const kept = t.kept.map((k) => ({ ...k, wig: catalog.find((w) => w.id === k.id) })).filter((k) => k.wig);
  app.innerHTML = `
    <header class="top"><span class="mark">Before It Falls</span><span class="step">for the wig fitter</span></header>
    <p class="voice" style="font-size:1.35rem;line-height:1.35;margin:4px 0 8px">Hi${t.who ? `, this is ${esc(t.who)}` : ""}. This is my hair before treatment${kept.length ? `, and ${kept.length === 1 ? "this is the wig I liked most" : `these are the ${kept.length} wigs I liked most`}` : ""}.</p>
    ${t.note ? `<p class="voice" style="font-size:1.1rem;color:var(--ink-soft);margin:0 0 22px">“${esc(t.note)}”</p>` : ""}
    <div class="tag"><span class="thread"></span>
      <p class="data" style="margin:0 0 12px;font-size:1rem">Hair kept on ${esc(t.date)}${t.who ? ` · ${esc(t.who)}` : ""}</p>
      <p style="display:flex;align-items:center;gap:12px;margin:0"><span class="swatch"></span><span class="voice" style="font-size:1.15rem">${esc(d.name)}</span></p>
      <table class="fields">
        <tr><th>Colour</th><td>${esc(t.colour.hex)}${t.colour.strands ? ` · strands ${esc(t.colour.strands)}` : ""}<br><span class="muted">${esc(d.fitter)} · CIELAB ${t.colour.lab.map((x) => x.toFixed(1)).join(" / ")}</span></td></tr>
        <tr><th>Wave</th><td>${esc(t.curl)}<br><span class="muted">${esc(t.curlTerm)}</span></td></tr>
        <tr><th>Length</th><td>${esc(t.length)}</td></tr>
        <tr><th>Density</th><td>${t.density ? `Level ${esc(t.density)} of 4` : `<span class="muted">not recorded</span>`}</td></tr>
      </table>
    </div>
    ${kept.length ? `<h2>Wigs they liked</h2>
      <div class="catalog">${kept.map(({ wig, score }) => `<figure style="cursor:default"><img src="/${esc(wig.image)}" alt="${esc(wig.name)}"><figcaption>${esc(wig.name)}<br><b>${score}</b> match · <span class="swatch small" style="background:${esc(wig.colour.hex)}"></span> ${esc(wig.colour.hex)}</figcaption></figure>`).join("")}</div>` : ""}
    <div class="notice" style="margin-top:18px">Colour was measured from the client's own photo in daylight and is a guide, not a lab reading. Wave and length were read by YouCam's hair analysis. If you can, compare against a real lock of their hair, as the American Cancer Society suggests.</div>
    <div class="actions no-print"><button id="print" class="outline">Print this tag</button></div>
    <footer class="small">Before It Falls. The client's photos are not part of this link and are never stored.</footer>`;
  document.getElementById("print").onclick = () => window.print();
}

render();
