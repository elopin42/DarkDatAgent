/* Demo board: simulates a live run for now.
   Later it polls the session events and work/runs/ every 2 seconds (see docs/LANDING.md). */

const DATA = JSON.parse(document.getElementById("board-data").textContent);
const $ = (id) => document.getElementById(id);

const money = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tc = (s) => Math.floor(s / 60) + ":" + String(Math.round(s % 60)).padStart(2, "0");
const dur = (s) => (s >= 60 ? `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, "0")}` : `${Math.round(s)} s`);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

let timer = null;
let i = 0;
let script = [];
let state = {};

function buildScript(armKey, inv) {
  const [y, m, d] = inv.date.split("-");
  const vars = {
    supplier: inv.supplier,
    ref: inv.ref,
    date: `${d}/${m}/${y}`,
    label: inv.label,
    ht: money(inv.ht),
    vat: String(inv.vat),
    ttc: money(inv.ht * (1 + inv.vat / 100)),
  };
  const fill = (s) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
  const outdated = armKey === "old-voice";
  return DATA.script
    .filter((x) => outdated || !x.old_only)
    .map((x) => ({ s: x.s, a: fill(x.a), drift: outdated ? x.drift : null }));
}

function counters() {
  $("a-counters").textContent = `step ${i} · $${money(state.cost)} · ${dur(state.elapsed)}`;
}

function setup() {
  clearInterval(timer);
  timer = null;
  i = 0;
  const armKey = $("arm").value;
  const inv = DATA.invoices[+$("row").value - 1];
  const skill = DATA.arms[armKey].skill;
  state = { armKey, inv, skill, cost: 0, elapsed: 0 };
  script = buildScript(armKey, inv);
  $("go").textContent = "Start";
  $("go").disabled = false;

  const src = skill && skill.source;
  $("t-date").textContent = src ? src.date : "none";
  $("t-end").textContent = src ? tc(src.duration) : "";
  $("t-now").textContent = src ? "0:00" : "";
  $("t-head").value = 0;
  $("t-frame").hidden = true;
  $("t-quote").textContent = src
    ? "Waiting for the agent’s first step"
    : "This arm has no tutorial: the agent only gets the one-sentence task";

  $("s-rev").textContent = skill ? `revision ${skill.revision}` : "";
  $("s-body").innerHTML = skill
    ? `<ol class="skill-live">${skill.steps.map((s, k) => `<li data-k="${k + 1}">${esc(s.text)}</li>`).join("")}</ol>`
    : `<p>No skill loaded. dependency_revisions is empty for this arm.</p>`;

  $("a-session").textContent = DATA.sessions[`${armKey}-${String(inv.id).padStart(2, "0")}`] || "—";
  $("a-log").innerHTML = `<li>No action yet. Chrome is waiting on http://localhost:8080</li>`;
  counters();

  $("q-before").textContent = "12";
  $("q-after").textContent = "—";
  $("q-state").textContent = "waiting";
  $("q-row").innerHTML = "";
}

function tick() {
  if (i >= script.length) return finish();
  const x = script[i];
  i += 1;
  state.cost += 0.0037;
  state.elapsed += 11 + ((i * 7) % 9);

  if (i === 1) $("a-log").innerHTML = "";
  const li = document.createElement("li");
  li.value = i;
  if (x.drift) li.className = "drift";
  li.innerHTML = `${esc(x.a)}${x.drift ? ` (${esc(x.drift)}) <span class="tag drift">drift</span>` : ""}`;
  $("a-log").prepend(li);
  counters();

  document.querySelectorAll(".skill-live li").forEach((el) => {
    const k = +el.dataset.k;
    el.classList.toggle("on", k === x.s);
    el.classList.toggle("done", k < x.s);
    el.setAttribute("aria-current", k === x.s ? "step" : "false");
    if (k === x.s && x.drift) el.classList.add("drifted");
  });

  if (state.skill) {
    const step = state.skill.steps[x.s - 1];
    const src = state.skill.source;
    let quote = step.text;
    if (src.is_2021) {
      const shot = DATA.storyboard.filter((s) => s.t <= step.t + 1).pop();
      quote = shot.en;
      $("t-frame").src = window.FRAMES_URL + shot.frame;
      $("t-frame").hidden = false;
    }
    $("t-quote").textContent = `“${quote}”`;
    $("t-now").textContent = tc(step.t);
    $("t-head").value = step.t / src.duration;
  }
}

function finish() {
  clearInterval(timer);
  timer = null;
  const inv = state.inv;
  $("go").textContent = "Done";
  $("go").disabled = true;
  $("q-after").textContent = "13";
  $("q-state").textContent = "invoice found, validated";
  $("q-row").innerHTML = `<table>
    <thead><tr><th>ref</th><th>ref_supplier</th><th>nom</th><th class="num">total_ht</th><th class="num">total_ttc</th><th>fk_statut</th></tr></thead>
    <tbody><tr><td>SI2611-0013</td><td>${esc(inv.ref)}</td><td>${esc(inv.supplier)}</td><td class="num">${money(inv.ht)}</td><td class="num">${money(inv.ht * (1 + inv.vat / 100))}</td><td>1 · validated</td></tr></tbody>
  </table>`;
}

$("row").innerHTML = DATA.invoices.map((v) => `<option value="${v.id}">Invoice ${v.id} · ${esc(v.supplier)}</option>`).join("");
["arm", "row"].forEach((id) => $(id).addEventListener("change", setup));
$("reset").addEventListener("click", setup);
$("go").addEventListener("click", () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
    $("go").textContent = "Resume";
    return;
  }
  $("go").textContent = "Pause";
  $("q-state").textContent = "read after the run";
  tick();
  timer = setInterval(tick, +$("speed").value);
});
setup();
if (new URLSearchParams(location.search).has("autoplay")) $("go").click();
