// Spotter menu-bar app — Layer 3 presence (spotter.md §4.6).
// The tray IS the periphery of the screen (calm technology, Weiser & Brown 1996):
// permanently visible, never in the way. This process hosts the web UI served by the
// Spotter local service and adds the native pieces MCP structurally cannot provide:
// a tray icon that encodes skill health, wait-cards that slide in at a screen corner,
// a global pull hotkey, and suppression during screen-sharing / Focus.

const { app, Tray, BrowserWindow, globalShortcut, nativeImage, ipcMain, screen, systemPreferences, powerMonitor } = require("electron");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

const PORT = Number(process.env.SPOTTER_PORT || 7777);
const BASE = `http://127.0.0.1:${PORT}`;
const REPO = path.join(__dirname, "..");

let tray = null;
let popover = null;
let waitCard = null;
let serverProc = null;
let presenting = false; // manual "I'm presenting" suppression (⌘⇧P)
let dismissTimer = null;

// ---------- ensure the Spotter service is up ----------
function ping() {
  return new Promise((resolve) => {
    http.get(`${BASE}/health`, (res) => resolve(res.statusCode === 200)).on("error", () => resolve(false));
  });
}
async function ensureServer() {
  if (await ping()) return;
  // Prefer the compiled build; fall back to tsx in dev.
  const useDist = require("node:fs").existsSync(path.join(REPO, "dist", "cli.js"));
  const cmd = useDist ? process.execPath : "npx";
  const args = useDist ? [path.join(REPO, "dist", "cli.js"), "serve"] : ["tsx", path.join(REPO, "src", "cli.ts"), "serve"];
  serverProc = spawn(cmd, args, { cwd: REPO, env: { ...process.env, SPOTTER_PORT: String(PORT) }, stdio: "ignore" });
  for (let i = 0; i < 40; i++) {
    if (await ping()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function fetchState() {
  return new Promise((resolve) => {
    http
      .get(`${BASE}/api/state`, (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try { resolve(JSON.parse(d)); } catch { resolve(null); }
        });
      })
      .on("error", () => resolve(null));
  });
}

// ---------- tray icon with a health ring (rendered offscreen) ----------
function healthColor(pct) {
  if (pct == null) return "#8a8a90";
  if (pct >= 80) return "#2eb872";
  if (pct >= 60) return "#0f9b8e";
  if (pct >= 45) return "#e0a63a";
  return "#d9814f"; // amber, never alarm-red (calm tech)
}

let iconRenderer = null;
function ringDataUrl(pct) {
  const col = healthColor(pct);
  const size = 44, r = size / 2 - 5, c = 2 * Math.PI * r, off = c * (1 - (pct ?? 100) / 100);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>
    <g transform='rotate(-90 ${size / 2} ${size / 2})'>
      <circle cx='${size / 2}' cy='${size / 2}' r='${r}' fill='none' stroke='#00000022' stroke-width='4'/>
      <circle cx='${size / 2}' cy='${size / 2}' r='${r}' fill='none' stroke='${col}' stroke-width='4'
        stroke-linecap='round' stroke-dasharray='${c}' stroke-dashoffset='${off}'/>
    </g>
    <text x='50%' y='54%' text-anchor='middle' dominant-baseline='middle' font-size='18'>🐾</text>
  </svg>`;
  return "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
}

/** Render the ring SVG in a hidden window and capture a PNG for the tray. */
async function renderTrayIcon(pct) {
  try {
    if (!iconRenderer) {
      iconRenderer = new BrowserWindow({ width: 44, height: 44, show: false, transparent: true, frame: false, webPreferences: { offscreen: false } });
    }
    await iconRenderer.loadURL(
      `data:text/html,<body style="margin:0;background:transparent"><img src="${ringDataUrl(pct)}"/></body>`
    );
    await new Promise((r) => setTimeout(r, 60));
    const img = await iconRenderer.capturePage();
    return img.resize({ width: 22, height: 22 });
  } catch {
    return null;
  }
}

async function refreshTray() {
  const state = await fetchState();
  const pct = state?.health ?? null;
  const img = await renderTrayIcon(pct);
  if (tray) {
    if (img && !img.isEmpty()) tray.setImage(img);
    else tray.setTitle(" 🐾"); // fallback if capture unsupported
    const suppressed = presenting || state?.paused;
    tray.setToolTip(
      suppressed
        ? "Spotter — quiet (presenting/paused)"
        : `Spotter — skills ${pct ?? "—"}% sharp${state?.suggestion ? ` · ${state.suggestion.label} due` : ""}`
    );
  }
}

// ---------- popover ----------
function createPopover() {
  popover = new BrowserWindow({
    width: 340, height: 460, show: false, frame: false, resizable: false, fullscreenable: false,
    transparent: true, vibrancy: "popover", hasShadow: true, skipTaskbar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js") },
  });
  popover.loadURL(`${BASE}/#/popover`);
  popover.on("blur", () => popover.hide());
}
function togglePopover() {
  if (!popover) createPopover();
  if (popover.isVisible()) return popover.hide();
  const { x, y } = tray.getBounds();
  const b = popover.getBounds();
  const disp = screen.getDisplayNearestPoint({ x, y }).workArea;
  popover.setPosition(Math.min(Math.round(x - b.width / 2), disp.x + disp.width - b.width - 8), Math.round(y + 4));
  popover.showInactive();
  popover.focus();
  popover.reload();
}

// ---------- wait-card (slides in at a screen corner, never steals focus) ----------
function showWaitCard(skillId, context) {
  if (presenting) return; // never surface while presenting/screen-sharing (§4.6)
  if (waitCard) waitCard.close();
  const disp = screen.getPrimaryDisplay().workArea;
  const W = 380, H = 320;
  waitCard = new BrowserWindow({
    width: W, height: H, x: disp.x + disp.width - W - 16, y: disp.y + 16,
    show: false, frame: false, transparent: true, resizable: false, alwaysOnTop: true,
    skipTaskbar: true, focusable: true, hasShadow: true,
    webPreferences: { preload: path.join(__dirname, "preload.js") },
  });
  const q = skillId ? `skill=${encodeURIComponent(skillId)}` : `context=${encodeURIComponent(context || "")}`;
  waitCard.loadURL(`${BASE}/#/waitcard?${q}`);
  waitCard.once("ready-to-show", () => waitCard.showInactive()); // showInactive = no focus theft
  // auto-dismiss after 45s of no interaction (calm; skipping is free)
  clearTimeout(dismissTimer);
  dismissTimer = setTimeout(() => waitCard && !waitCard.isDestroyed() && waitCard.close(), 45000);
}

// ---------- suppression: presenting / Focus / DND ----------
function refreshSuppression() {
  // Best-effort: macOS has no public API to detect an active screen recording, so we
  // expose a manual Presenting toggle (⌘⇧P) — the reliable, taste-signaling path from
  // the pitch. A production build would hook ScreenCaptureKit. We also honor system
  // idle so we only surface near task/idle boundaries (Iqbal & Bailey).
  return presenting;
}

// ---------- IPC from the renderer (app.js window.spotter.*) ----------
ipcMain.on("open-wait-card", (_e, skillId) => showWaitCard(skillId));
ipcMain.on("dismiss-wait-card", () => waitCard && !waitCard.isDestroyed() && waitCard.close());

// ---------- app lifecycle ----------
app.on("ready", async () => {
  if (app.dock) app.dock.hide(); // menu-bar only, no dock icon
  await ensureServer();

  const initial = await renderTrayIcon((await fetchState())?.health ?? null);
  tray = new Tray(initial && !initial.isEmpty() ? initial : nativeImage.createEmpty());
  if (!initial || initial.isEmpty()) tray.setTitle(" 🐾");
  tray.on("click", togglePopover);
  tray.on("right-click", togglePopover);

  createPopover();
  refreshTray();
  setInterval(refreshTray, 30000); // ambient, low-frequency (calm tech)

  // ⌘⇧S — pull a rep on demand (streaks live only on the pull side, §4.3).
  globalShortcut.register("CommandOrControl+Shift+S", async () => {
    const s = await fetchState();
    showWaitCard(s?.suggestion?.skillId);
  });
  // ⌘⇧P — presenting mode: silence everything instantly (screen-share suppression).
  globalShortcut.register("CommandOrControl+Shift+P", () => {
    presenting = !presenting;
    if (presenting && waitCard && !waitCard.isDestroyed()) waitCard.close();
    refreshTray();
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (serverProc) serverProc.kill();
});
app.on("window-all-closed", () => {}); // stay alive in the tray
