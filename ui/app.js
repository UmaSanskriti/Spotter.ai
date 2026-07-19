// Spotter UI — one hash-routed SPA serving every Layer 3 surface (spotter.md §4.2–4.6).
// Served by the Spotter local service, so all data is live from the on-device ledger.

const app = document.getElementById("app");

// ---------- API client (same-origin) ----------
const api = {
  async get(path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  },
  async post(path, body) {
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    return r.json();
  },
};

// ---------- helpers ----------
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function healthColor(pct) {
  if (pct == null) return "var(--ink-3)";
  if (pct >= 80) return "var(--good)";
  if (pct >= 60) return "var(--accent)";
  if (pct >= 45) return "var(--warn)";
  return "var(--low)"; // amber-orange, never alarm-red (calm tech)
}
const STATUS = {
  protect: { emoji: "🔒", label: "Protect", color: "var(--accent)" },
  watch: { emoji: "👁", label: "Watch", color: "var(--good)" },
  letgo: { emoji: "📦", label: "Let go", color: "var(--ink-3)" },
  ignore: { emoji: "·", label: "Ignore", color: "var(--ink-3)" },
};

/** SVG health ring with the claw in the center. */
function ring(pct, { size = 64, glyph = "🐾" } = {}) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const val = pct == null ? 100 : pct;
  const off = c * (1 - val / 100);
  const col = healthColor(pct);
  return `<div class="ring-wrap" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="4"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="4"
        stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"
        style="transition:stroke-dashoffset .6s ease"/>
    </svg>
    <div class="glyph">${glyph}</div>
  </div>`;
}

function whyChips(why) {
  const M = { verification: "🛡 Verification", career: "🏛 Career capital", trajectory: "🧭 Trajectory", chosen: "💙 Chosen" };
  return (why || []).map((w) => `<span class="why">${M[w] || w}</span>`).join(" · ");
}

// ---------- router ----------
const routes = {
  "": renderMirror,
  "mirror": renderMirror,
  "popover": renderPopover,
  "ledger": renderLedger,
  "digest": renderDigest,
  "waitcard": renderWaitCard,
  "charter": renderCharter,
};

async function route() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [name, qs] = hash.split("?");
  const params = new URLSearchParams(qs || "");
  document.body.className = name === "popover" ? "popover" : name === "waitcard" ? "waitcard" : "";
  const fn = routes[name] || renderMirror;
  try {
    await fn(params);
  } catch (e) {
    app.innerHTML = `<div class="window"><div class="panel" style="padding:24px">
      <b>Can't reach Spotter.</b><p class="muted">Is the server running? <code>spotter serve</code></p>
      <p class="muted" style="margin-top:8px;font-size:12px">${esc(e.message)}</p></div></div>`;
  }
}
window.addEventListener("hashchange", route);
window.addEventListener("DOMContentLoaded", route);
route();

// ================= VIEWS =================

// ---- shared main-window chrome ----
function windowChrome(active, health, inner) {
  return `<div class="window fade-in">
    <div class="topbar">
      ${ring(health, { size: 44 })}
      <h1>Spotter</h1>
      <nav class="tabs">
        <a href="#/mirror" class="${active === "mirror" ? "active" : ""}">Mirror</a>
        <a href="#/ledger" class="${active === "ledger" ? "active" : ""}">Ledger</a>
        <a href="#/digest" class="${active === "digest" ? "active" : ""}">Digest</a>
      </nav>
    </div>
    ${inner}
  </div>`;
}

// ---- MIRROR (Wrapped moment) + charter confirmation ----
async function renderMirror() {
  const [mirror, state] = await Promise.all([api.get("/api/mirror?days=60"), api.get("/api/state")]);
  const health = state.health;
  const maxDel = Math.max(1, ...mirror.rows.map((r) => r.delegationPct));

  // highlight the "and falling" retention phrase like the spec copy
  const headline = esc(mirror.headline).replace(/(\d+% and falling\.?)/, "<em>$1</em>");

  const sources = Object.entries(mirror.bySource || {})
    .map(([k, v]) => `<span class="pill">${esc(k)} · ${v}</span>`)
    .join("");

  const bars = mirror.rows
    .map((r) => {
      const ret = r.retentionPct != null ? `${r.retentionPct}% retention` : "building curve";
      return `<div class="bar-row">
        <div class="name">${STATUS[r.status]?.emoji || ""} ${esc(r.label)}</div>
        <div class="track"><span style="width:${(r.delegationPct / maxDel) * 100}%;background:${healthColor(r.retentionPct)}"></span></div>
        <div class="val">${r.delegationPct}% delegated · ${ret}</div>
      </div>`;
    })
    .join("");

  const roleLabel = state.role?.label || "you";
  const protect = state.watchlist.slice(0, 6);
  const tags = protect
    .map(
      (s) => `<button class="skill-tag" onclick="location.hash='#/ledger'">
        ${STATUS[s.status]?.emoji || ""} ${esc(s.label)} <span class="why">${whyChips(s.why)}</span></button>`
    )
    .join("");

  app.innerHTML = windowChrome(
    "mirror",
    health,
    `
    <section class="panel mirror-hero">
      <div class="kicker">Your Delegation Mirror · last 60 days</div>
      <div class="headline">${headline}</div>
      <div class="sources">${sources}</div>
    </section>

    <section class="panel charter-card">
      <h2>You look like a ${esc(roleLabel)}.</h2>
      <p class="muted">Protecting these ${protect.length} — tap any to change. Everything else is tracked quietly in the ledger.</p>
      <div class="charter-grid">${tags}</div>
    </section>

    <section class="panel" style="padding:20px">
      <div class="row spread" style="margin-bottom:14px"><b>What you're offloading</b><span class="muted">across all agents</span></div>
      <div class="bars">${bars}</div>
    </section>
  `
  );
}

// ---- CHARTER (standalone confirmation) ----
async function renderCharter() {
  const state = await api.get("/api/state");
  const tags = state.watchlist
    .map((s) => `<button class="skill-tag" onclick="location.hash='#/ledger'">${STATUS[s.status]?.emoji || ""} ${esc(s.label)}
      <span class="why">${whyChips(s.why)}</span></button>`)
    .join("");
  app.innerHTML = windowChrome(
    "mirror",
    state.health,
    `<section class="panel charter-card">
      <h2>You look like a ${esc(state.role?.label || "knowledge worker")}.</h2>
      <p class="muted">Smart defaults, total visibility, one-tap override — autonomy means control, not paperwork (SDT).</p>
      <div class="charter-grid">${tags}</div>
      <div class="row" style="margin-top:18px;gap:8px">
        <button class="btn" onclick="location.hash='#/mirror'">Looks right — start protecting</button>
        <a class="btn ghost" href="#/ledger">Adjust in the ledger</a>
      </div>
    </section>`
  );
}

// ---- LEDGER + settings ----
async function renderLedger() {
  const [led, state, budget] = await Promise.all([
    api.get("/api/ledger"),
    api.get("/api/state"),
    api.get("/api/budget"),
  ]);
  const rows = led.skills
    .map((s) => {
      const st = STATUS[s.status] || STATUS.ignore;
      const ret = s.retentionPct;
      const bar = ret != null
        ? `<span class="mini-track"><span style="width:${ret}%;background:${healthColor(ret)}"></span></span> ${ret}%`
        : `<span class="muted">—</span>`;
      const seg = ["protect", "watch", "letgo"]
        .map((a) => `<button class="${s.status === a ? "on" : ""}" data-skill="${esc(s.id)}" data-action="${a}">${STATUS[a].emoji}</button>`)
        .join("");
      return `<tr>
        <td>${s.onWatchlist ? "★ " : ""}<span class="status-dot" style="background:${st.color}"></span>${esc(s.label)}
          <div class="muted" style="font-size:11px">${whyChips(s.why)}</div></td>
        <td>${(s.delegationIntensity * 100).toFixed(0)}%</td>
        <td>${bar}</td>
        <td>${s.halfLifeDays != null ? s.halfLifeDays + "d" : "—"}</td>
        <td>${s.reps}</td>
        <td><div class="seg">${seg}</div></td>
      </tr>`;
    })
    .join("");

  app.innerHTML = windowChrome(
    "ledger",
    state.health,
    `
    <section class="panel ledger">
      <table>
        <thead><tr><th>Skill</th><th>Delegated</th><th>Retention</th><th>Half-life</th><th>Reps</th><th>Charter</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>

    <section class="panel settings">
      <h3>Settings</h3>
      <div class="setting-row">
        <div><b>Daily probe budget</b><div class="muted" style="font-size:12px">Hard cap. One question each, ≤90s. Sacred.</div></div>
        <div class="row"><input id="budget" type="range" min="0" max="6" step="1" value="${budget.budget}"/><span id="budgetVal" class="pill">${budget.budget}/day</span></div>
      </div>
      <div class="setting-row">
        <div><b>Pause everything</b><div class="muted" style="font-size:12px">Crunch week — silence all probes, no comment.</div></div>
        <label class="switch"><input id="pause" type="checkbox" ${state.paused ? "checked" : ""}/><span class="slot"></span></label>
      </div>
      <div class="setting-row">
        <div><b>Reset demo data</b><div class="muted" style="font-size:12px">Reload the multi-agent replay corpus.</div></div>
        <button class="btn ghost" id="reseed">Reseed</button>
      </div>
    </section>
  `
  );

  // wire settings
  app.querySelectorAll(".seg button").forEach((b) =>
    b.addEventListener("click", async () => {
      await api.post("/api/charter", { skill_id: b.dataset.skill, action: b.dataset.action });
      renderLedger();
    })
  );
  const budgetEl = app.querySelector("#budget");
  budgetEl.addEventListener("input", () => (app.querySelector("#budgetVal").textContent = `${budgetEl.value}/day`));
  budgetEl.addEventListener("change", () => api.post("/api/budget", { budget: Number(budgetEl.value) }));
  app.querySelector("#pause").addEventListener("change", (e) => api.post("/api/pause", { paused: e.target.checked }));
  app.querySelector("#reseed").addEventListener("click", async () => {
    await api.post("/api/seed", {});
    renderLedger();
  });
}

// ---- DIGEST (weekly, exception-based) ----
async function renderDigest() {
  const [digest, state] = await Promise.all([api.get("/api/digest"), api.get("/api/state")]);
  const card = (icon, title, s, tone) =>
    s
      ? `<div class="panel digest-card">
          <div class="big">${icon}</div>
          <div><div class="muted" style="font-size:12px;text-transform:uppercase;letter-spacing:.6px">${title}</div>
          <div style="font-size:16px;font-weight:700">${esc(s.label)}</div>
          <div class="${tone}">${s.retentionPct}% retention</div></div>
        </div>`
      : "";
  const sugg = digest.suggestion
    ? `<div class="panel digest-card">
        <div class="big">🎯</div>
        <div><div class="muted" style="font-size:12px;text-transform:uppercase;letter-spacing:.6px">One suggested rep</div>
        <div style="font-size:16px;font-weight:700">${esc(digest.suggestion.label)}</div></div>
        <button class="btn" style="margin-left:auto" onclick="location.hash='#/waitcard?skill=${esc(digest.suggestion.skillId)}'">Do the rep</button>
      </div>`
    : "";
  app.innerHTML = windowChrome(
    "digest",
    state.health,
    `<section class="panel mirror-hero" style="text-align:left;padding:22px">
      <div class="kicker">Skill Health · this week</div>
      <div class="headline" style="font-size:20px;max-width:none;margin:10px 0">${esc(digest.headline)}</div>
      <p class="muted">Exception-based by design — biggest mover, biggest gainer, one action. Never forty progress bars.</p>
    </section>
    ${card("📉", "Biggest decliner", digest.decliner, "delta-down")}
    ${card("📈", "Biggest gainer", digest.gainer, "delta-up")}
    ${sugg}`
  );
}

// ---- POPOVER (menu-bar) ----
async function renderPopover() {
  const state = await api.get("/api/state");
  const weather = state.watchlist
    .slice(0, 3)
    .map(
      (s) => `<div class="w-row"><span>${STATUS[s.status]?.emoji || ""} ${esc(s.label)}</span>
        <span class="pill" style="color:${healthColor(s.retentionPct)}">${s.retentionPct != null ? s.retentionPct + "%" : "—"}</span></div>`
    )
    .join("");
  const sugg = state.suggestion;
  app.innerHTML = `<div class="panel popover fade-in">
    <div class="head">
      ${ring(state.health, { size: 52 })}
      <div class="who">
        <div class="health">Skills ${state.health}% sharp</div>
        <div class="role">${esc(state.role?.label || "—")}${state.paused ? " · paused" : ""}</div>
      </div>
    </div>
    <div class="weather">${weather || '<span class="muted">No skills tracked yet.</span>'}</div>
    ${
      sugg && !state.paused
        ? `<div class="suggest">
            <div class="lead">Today's rep</div>
            <div class="task">${esc(sugg.label)} — a 60-second sharpener</div>
            <button class="btn" style="width:100%" onclick="openWait('${esc(sugg.skillId)}')">Take the rep <span class="hotkey">⌘⇧S</span></button>
          </div>`
        : `<div class="suggest"><div class="lead">All calm</div><div class="task">Nothing due. Your skills are holding.</div></div>`
    }
    <div class="budget-line">
      <span>Budget</span>
      <input id="pbudget" type="range" min="0" max="6" step="1" value="${state.budget}" style="flex:1"/>
      <span class="pill">${state.probesUsedToday}/${state.budget} today</span>
    </div>
    <div class="foot">
      <a href="#/mirror" target="_blank">Mirror</a>
      <a href="#/ledger" target="_blank">Ledger</a>
      <a href="#/digest" target="_blank">Digest</a>
      <span class="grow"></span>
      <label class="row" style="gap:6px;font-size:12px"><input id="ppause" type="checkbox" ${state.paused ? "checked" : ""}/> Pause</label>
    </div>
  </div>`;

  app.querySelector("#pbudget").addEventListener("change", (e) => api.post("/api/budget", { budget: Number(e.target.value) }));
  app.querySelector("#ppause").addEventListener("change", (e) => api.post("/api/pause", { paused: e.target.checked }).then(renderPopover));
}
window.openWait = (skillId) => {
  // In Electron this asks the main process to slide in a wait-card window; in a
  // browser we just navigate to the wait-card route.
  if (window.spotter?.openWaitCard) window.spotter.openWaitCard(skillId);
  else window.open(`#/waitcard?skill=${encodeURIComponent(skillId)}`, "_blank");
};

// ---- WAIT-CARD (Call-your-shot / Veil / Ship A-or-B) ----
async function renderWaitCard(params) {
  const skill = params.get("skill") || "";
  const context = params.get("context") || skill.replace(/-/g, " ");
  const wc = await api.get(`/api/wait-card?context=${encodeURIComponent(context)}`);

  if (wc.surface === "none") {
    app.innerHTML = `<div class="panel waitcard"><div class="wc-head"><div class="ring-wrap sm">${ring(100,{size:44})}</div>
      <div><div class="t">All calm</div><div class="sub">${esc(wc.reason || "nothing due")}</div></div></div>
      <p class="muted">No rep right now. Back to your flow.</p></div>`;
    return;
  }

  const head = `<div class="wc-head">
    ${ring(wc.retentionPct, { size: 44, glyph: "🐾" })}
    <div><div class="t">${esc(wc.skillLabel)}</div>
    <div class="sub">${wc.retentionPct != null ? wc.retentionPct + "% retention · " : ""}the agent's working — take the beat</div></div>
    <button class="skip" style="margin-left:auto" onclick="dismissWait()">Skip</button>
  </div>`;

  if (wc.surface === "call-your-shot" && wc.fileTree) {
    const files = wc.fileTree
      .map((f) => `<button data-f="${esc(f.path)}"><span>${esc(f.path)}</span><span class="fhint">${esc(f.hint)}</span></button>`)
      .join("");
    app.innerHTML = `<div class="panel waitcard">
      ${head}
      <div class="prompt">${esc(wc.probe)}</div>
      <div class="filetree">${files}</div>
      <div class="conf"><label>Confidence <span id="cv">60%</span></label><input id="conf" type="range" min="0" max="100" value="60"/></div>
      <div class="wc-actions"><button class="btn grow" id="lockin" disabled>Lock in your call</button></div>
      <div id="wcResult"></div>
    </div>`;
    let picked = null;
    app.querySelectorAll(".filetree button").forEach((b) =>
      b.addEventListener("click", () => {
        app.querySelectorAll(".filetree button").forEach((x) => x.classList.remove("picked"));
        b.classList.add("picked");
        picked = b.dataset.f;
        app.querySelector("#lockin").disabled = false;
      })
    );
    const conf = app.querySelector("#conf");
    conf.addEventListener("input", () => (app.querySelector("#cv").textContent = conf.value + "%"));
    app.querySelector("#lockin").addEventListener("click", async () => {
      const truth = wc.fileTree[1].path; // the "real" culprit in the mock
      const res = await api.post("/api/grade", {
        skill_id: wc.skillId,
        user_answer: picked,
        reference: truth,
        confidence: Number(conf.value) / 100,
      });
      const right = picked === truth;
      app.querySelector("#wcResult").innerHTML = `<div class="result fade-in">
        <div>${right ? "🎯 Called it." : "Close — the culprit was <code>" + esc(truth) + "</code>."} That's the rep either way.</div>
        <div class="delta">Retention now ${res.newRetentionPct ?? "—"}% · half-life ${res.newHalfLifeDays ?? "—"}d</div>
      </div>`;
      app.querySelector("#lockin").disabled = true;
    });
    return;
  }

  if (wc.surface === "veil") {
    app.innerHTML = `<div class="panel waitcard">
      ${head}
      <div class="prompt">${esc(wc.probe)}</div>
      <div class="veil-answer" id="veil">
        <div class="content">// The agent's solution is ready.\n// Take a beat and form your instinct first —\n// this pause is the rep. Auto-reveals shortly.</div>
        <div class="veil-cta"><span class="muted">Instinct first…</span><button class="btn subtle" onclick="reveal()">Show now</button></div>
      </div>
      <div class="wc-actions"><button class="btn grow" onclick="dismissWait()">Got my beat</button></div>
    </div>`;
    // auto-reveal after ~10s (spotter.md §4.3 The Veil)
    window.reveal = () => app.querySelector("#veil")?.classList.add("revealed");
    setTimeout(() => window.reveal(), 10000);
    return;
  }

  // fallback: ship A or B (comparative judgment)
  app.innerHTML = `<div class="panel waitcard">
    ${head}
    <div class="prompt">Which should ship?</div>
    <div class="ab">
      <div class="opt" data-pick="A"><h4>Option A</h4><pre>the agent's primary\napproach</pre></div>
      <div class="opt" data-pick="B"><h4>Option B</h4><pre>a plausible\nalternative</pre></div>
    </div>
    <div id="wcResult"></div>
  </div>`;
  app.querySelectorAll(".ab .opt").forEach((o) =>
    o.addEventListener("click", async () => {
      const res = await api.post("/api/grade", { skill_id: wc.skillId, user_answer: o.dataset.pick, reference: "A", confidence: 0.5 });
      app.querySelector("#wcResult").innerHTML = `<div class="result fade-in">Nice — that's the rep. Retention now ${res.newRetentionPct ?? "—"}%.</div>`;
    })
  );
}
window.dismissWait = () => {
  if (window.spotter?.dismissWaitCard) window.spotter.dismissWaitCard();
  else app.innerHTML = `<div class="panel waitcard"><p class="muted">Skipped — no worries. A skip is data, not failure.</p></div>`;
};

// Global hotkey inside the browser too (⌘⇧S / Ctrl+Shift+S) — pull mode.
window.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "s") {
    e.preventDefault();
    api.get("/api/state").then((s) => s.suggestion && window.openWait(s.suggestion.skillId));
  }
});
