import { Game, STATE } from "./engine.js?v=202609241920";
import { AudioEngine } from "./audio.js?v=202609241920";
import { createRenderer } from "./renderer.js?v=202609241920";
import { Input } from "./input.js?v=202609241920";


// iOS Safari: trava pinch / double-tap / scale (não dá pra "deszoomar" por JS)
(function lockMobileZoom() {
  const stop = (e) => {
    if (e.cancelable) e.preventDefault();
  };
  ["gesturestart", "gesturechange", "gestureend"].forEach((type) => {
    document.addEventListener(type, stop, { passive: false, capture: true });
  });
  document.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches && e.touches.length > 1) stop(e);
      // iOS antigo: e.scale !== 1 durante pinch
      if (typeof e.scale === "number" && e.scale !== 1) stop(e);
    },
    { passive: false, capture: true },
  );
  let lastTouchEnd = 0;
  document.addEventListener(
    "touchend",
    (e) => {
      const t = e.target;
      // botões do menu podem receber toque normal
      if (t && t.closest && t.closest("button, a, .theme-swatch, .layout-chip, .chip, .cta, .linkish")) {
        lastTouchEnd = Date.now();
        return;
      }
      const now = Date.now();
      // bloqueia double-tap zoom em qualquer outro lugar (tabuleiro incluso)
      if (now - lastTouchEnd <= 350) stop(e);
      lastTouchEnd = now;
    },
    { passive: false, capture: true },
  );
  // se o visualViewport já estiver com scale != 1, recentra
  const recenter = () => {
    try {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    } catch {}
  };
  recenter();
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", recenter);
    window.visualViewport.addEventListener("scroll", recenter);
  }
})();
const BEST_KEY = "tetrok-recorde";
const HOWTO_KEY = "tetrok-como-jogar";
const TIP_KEY = "tetrok-dica";
const THEME_KEY = "tetrok-tema";
const LAYOUT_KEY = "tetrok-layout";
const HOWTO_MS = 1800;
const THEMES = [
  { id: "neon", label: "Neon" },
  { id: "magma", label: "Magma" },
  { id: "crt", label: "CRT" },
  { id: "pixel", label: "Pixel" },
];
const LAYOUTS = [
  { id: "full", label: "Tela cheia" },
  { id: "strip", label: "Faixa" },
  { id: "gesture", label: "Gestos" },
  { id: "micro", label: "Micro" },
];

const HOWTO_STEPS = [
  {
    title: "Mexe aí!",
    text: "◀ ▶ pra dançar a peça. Girar pra virar o jogo.",
  },
  {
    title: "Joga pra baixo",
    text: "Segura ▼ pra descer mais rápido. Clássico e simples!",
  },
  {
    title: "Limpa e explode",
    text: "Fecha a linha e ganha ponto. Quatro de uma vez? TETROK!!!",
  },
  {
    title: "No celular",
    text: "Desliza pra mover, toque pra girar, puxa pra baixo pra soltar. Sem botões.",
  },
];

const els = {
  score: document.getElementById("stat-score"),
  level: document.getElementById("stat-level"),
  lines: document.getElementById("stat-lines"),
  scoreM: document.getElementById("stat-score-m"),
  levelM: document.getElementById("stat-level-m"),
  linesM: document.getElementById("stat-lines-m"),
  scoreRail: document.getElementById("stat-score-rail"),
  levelRail: document.getElementById("stat-level-rail"),
  linesRail: document.getElementById("stat-lines-rail"),
  scoreFloat: document.getElementById("stat-score-float"),
  levelFloat: document.getElementById("stat-level-float"),
  linesFloat: document.getElementById("stat-lines-float"),
  comboFloat: document.getElementById("stat-combo-float"),
  comboWrap: document.getElementById("combo-float"),
  bestFloat: document.getElementById("stat-best-float"),
  board: document.getElementById("board"),
  hold: document.getElementById("hold"),
  next: document.getElementById("next"),
  holdM: document.getElementById("hold-m"),
  nextM: document.getElementById("next-m"),
  holdSlot: document.getElementById("pad-hold"),
  holdSlotFloat: document.getElementById("pad-hold-float"),
  overlay: document.getElementById("overlay"),
  overlayTitle: document.getElementById("overlay-title"),
  overlayText: document.getElementById("overlay-text"),
  overlayScore: document.getElementById("overlay-score"),
  btnPlay: document.getElementById("btn-play"),
  btnHome: document.getElementById("btn-home"),
  btnHomeOverlay: document.getElementById("btn-home-overlay"),
  btnPause: document.getElementById("btn-pause"),
  btnTheme: document.getElementById("btn-theme"),
  btnMute: document.getElementById("btn-mute"),
  tipToast: document.getElementById("tip-toast"),
  btnTipDismiss: document.getElementById("btn-tip-dismiss"),
  themeLabel: document.getElementById("theme-label"),
  themePicker: document.getElementById("theme-picker"),
  layoutPicker: document.getElementById("layout-picker"),
  wrap: document.getElementById("board-wrap"),
  app: document.getElementById("app"),
  howto: document.getElementById("howto"),
  howtoTitle: document.getElementById("howto-title"),
  howtoText: document.getElementById("howto-text"),
  howtoVisual: document.getElementById("howto-visual"),
  howtoDots: document.getElementById("howto-dots"),
  btnHowToNext: document.getElementById("btn-howto-next"),
  btnHowToSkip: document.getElementById("btn-howto-skip"),
};

const audio = new AudioEngine();
const nextCanvases = [
  document.getElementById("next-side"),
  document.getElementById("next"),
  document.getElementById("next-0"),
  document.getElementById("next-1"),
  document.getElementById("next-2"),
  document.getElementById("next-3"),
  document.getElementById("next-m"),
  document.getElementById("next-float"),
  document.getElementById("next-strip"),
].filter(Boolean);

const holdFloat = document.getElementById("hold-float");

const minisSpec = [
  { canvas: els.hold, kind: "hold" },
  { canvas: els.holdM, kind: "hold" },
  ...(holdFloat ? [{ canvas: holdFloat, kind: "hold" }] : []),
  ...nextCanvases.map((canvas) => ({ canvas, kind: "next", index: 0 })),
];
const created = await createRenderer(els.board, minisSpec, {
  failEl: document.getElementById("webgl-fail"),
});
const renderer = created.renderer;
els.board = created.canvas;
renderer.minis.forEach((mini) => {
  if (mini.kind !== "next") return;
  const id = mini.canvas.id;
  if (id === "next-1") mini.index = 1;
  else if (id === "next-2") mini.index = 2;
  else if (id === "next-3") mini.index = 3;
  else if (id === "next") mini.index = 1;
  else mini.index = 0; // next-side, next-float, next-strip, next-0, next-m
});


function readTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "neon" || v === "magma" || v === "crt" || v === "pixel") return v;
    if (v === "candy") return "magma"; // Doce removido
    if (v === "aurora" || v === "navy" || v === "crimson") return "neon";
  } catch {}
  return "neon";
}

function writeTheme(id) {
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch {}
}

function applyTheme(id) {
  const t = THEMES.find((x) => x.id === id) || THEMES[0];
  renderer.setTheme(t.id);
  document.body.classList.remove(
    "theme-neon", "theme-magma", "theme-crt", "theme-pixel",
    "theme-aurora", "theme-navy", "theme-crimson", "skin-cyber",
  );
  document.body.classList.add(`theme-${t.id}`);
  if (els.themeLabel) els.themeLabel.textContent = t.label;
  if (els.themePicker) {
    for (const btn of els.themePicker.querySelectorAll(".theme-swatch")) {
      btn.classList.toggle("is-on", btn.dataset.theme === t.id);
    }
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const colors = { neon: "#050814", magma: "#0a0402", crt: "#0a0800", pixel: "#0b1220" };
    meta.setAttribute("content", colors[t.id] || "#050814");
  }
  currentTheme = t.id;
}

let currentTheme = readTheme();
applyTheme(currentTheme);

function readLayout() {
  // Configuração única: Tela cheia
  try { localStorage.setItem(LAYOUT_KEY, "full"); } catch {}
  return "full";
}

function writeLayout(id) {
  try { localStorage.setItem(LAYOUT_KEY, id); } catch {}
}

function applyLayout(id) {
  const L = LAYOUTS.find((x) => x.id === id) || LAYOUTS[0];
  document.body.classList.remove("layout-full", "layout-strip", "layout-gesture", "layout-micro");
  document.body.classList.add(`layout-${L.id}`);
  if (els.layoutPicker) {
    for (const btn of els.layoutPicker.querySelectorAll(".layout-chip")) {
      btn.classList.toggle("is-on", btn.dataset.layout === L.id);
    }
  }
  currentLayout = L.id;
  requestAnimationFrame(() => layout());
}


let currentLayout = readLayout();
applyLayout(currentLayout);

function cycleTheme() {
  const i = THEMES.findIndex((x) => x.id === currentTheme);
  const next = THEMES[(i + 1) % THEMES.length];
  writeTheme(next.id);
  applyTheme(next.id);
}

function onPickTheme(id) {
  audio.unlock();
  writeTheme(id);
  applyTheme(id);
  try { renderer.draw(game); } catch {}
}

if (els.btnTheme) {
  els.btnTheme.hidden = false;
  const go = (ev) => {
    ev.preventDefault();
    audio.unlock();
    cycleTheme();
    try { renderer.draw(game); } catch {}
  };
  els.btnTheme.addEventListener("pointerup", go);
  els.btnTheme.addEventListener("click", go);
}
if (els.themePicker) {
  const pick = (ev) => {
    const btn = ev.target.closest(".theme-swatch");
    if (!btn) return;
    ev.preventDefault();
    onPickTheme(btn.dataset.theme);
  };
  els.themePicker.addEventListener("pointerup", pick);
  els.themePicker.addEventListener("click", pick);
}

function onPickLayout(id) {
  if (!id) return;
  audio.unlock();
  writeLayout(id);
  applyLayout(id);
  try { renderer.draw(game); } catch {}
  try { layout(); } catch {}
}

if (els.layoutPicker) {
  const pickL = (ev) => {
    const btn = ev.target.closest(".layout-chip");
    if (!btn) return;
    ev.preventDefault();
    ev.stopPropagation();
    onPickLayout(btn.dataset.layout);
  };
  els.layoutPicker.addEventListener("pointerup", pickL);
  els.layoutPicker.addEventListener("click", pickL);
  // fallback: bind each chip directly (mobile-friendly)
  for (const btn of els.layoutPicker.querySelectorAll(".layout-chip")) {
    const go = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      onPickLayout(btn.dataset.layout);
    };
    btn.addEventListener("pointerup", go);
    btn.addEventListener("click", go);
  }
}


let best = readBest();
let hudScoreShown = 0;
let hudScoreAnim = 0;
let tutorialOpen = false;
let tutorialStep = 0;
let tutorialTimer = 0;
let hidePauseTimer = 0;

const game = new Game({
  onScore: syncHud,
  onStart: () => {
    hideOverlay();
    dismissTip(true);
    hudScoreShown = game.score;
    syncHud();
  },
  onPause: () => {
    try { audio.pause(); } catch (_) {}
    showOverlay("Pausa", "Cafézinho? Quando quiser, bora de novo.", false);
    // na pausa: esconde seletor de tema pra não parecer menu inicial
    if (els.themePicker) els.themePicker.hidden = true;
    const themeLab = document.getElementById("theme-label-ui");
    if (themeLab) themeLab.hidden = true;
    if (els.btnHomeOverlay) els.btnHomeOverlay.hidden = false;
    els.btnPause.setAttribute("aria-pressed", "true");
    els.btnPause.setAttribute("aria-label", "Continuar");
    els.btnPause.title = "Continuar";
    els.btnPause.textContent = "▶";
    syncPauseOverlay();
  },
  onResume: () => {
    try { audio.resume(); } catch (_) {}
    hideOverlay();
    els.btnPause.setAttribute("aria-pressed", "false");
    els.btnPause.setAttribute("aria-label", "Pausar");
    els.btnPause.title = "Pausar";
    els.btnPause.textContent = "❚❚";
  },
  onLock: ({ hard, piece, dropCells, fromY }) => {
    if (!hard) audio.lock();
    renderer.spawnLock(Boolean(hard), piece, dropCells || 0, fromY);
  },
  onRotate: () => audio.rotate(),
  onHold: () => {
    audio.hold();
    syncHud();
  },
  onLineClear: ({ count, label, rows, combo, b2b, perfect, gained }) => {
    try { audio.lineClear(count, combo || 0); } catch (_) {}
    renderer.spawnClear(rows, game.board, count);
    let tip = label;
    if (combo > 1) tip = `${label}  ·  Combo x${combo}`;
    if (b2b) tip = tip.includes("B2B") ? tip : `B2B · ${tip}`;
    renderer.showToast(tip);
    renderer.spawnScorePop(gained || 0, perfect ? "Limpeza" : b2b ? "Back-to-back" : combo > 1 ? `Combo x${combo}` : "");
    if (navigator.vibrate) {
      try {
        navigator.vibrate(
          perfect ? [20, 30, 20, 30, 40]
            : count >= 4 ? [24, 40, 24, 40, 36]
            : count >= 2 ? [16, 20, 16]
            : 14
        );
      } catch {
        /* ignore */
      }
    }
    syncHud();
  },
  onLevelUp: () => {
    audio.levelUp();
    renderer.pulseLevel();
    const lv = game.level;
    // não sobrescreve toast de linha na mesma hora
    window.setTimeout(() => {
      if (game.level === lv) renderer.showToast(`Nível ${lv}! Mais rápido`);
    }, 700);
    syncHud();
  },
  onGameOver: (snap) => {
    if (snap.score > best) {
      best = snap.score;
      writeBest(best);
    }
    const roast =
      snap.score < 500
        ? "Quase. A pilha fechou em cima de você."
        : snap.score < 2000
          ? "Ritmo bom. Agora busca limpeza e combo."
          : snap.score < 5000
            ? "Pressão alta. Você joga limpo."
            : "Élite. Isso aqui já é vitrine.";
    // overlay primeiro: audio não pode bloquear o fim de jogo
    showOverlay("Game over!", roast, true, snap.score);
    try { renderer.gameOverFx(); } catch (_) {}
    try { audio.gameOver(); } catch (_) {}
    els.btnPause.textContent = "❚❚";
    els.btnPause.setAttribute("aria-pressed", "false");
    els.btnPause.setAttribute("aria-label", "Pausar");
    els.btnPause.title = "Pausar";
    syncHud();
  },
  onSpawn: () => { renderer.onSpawnFlash(); syncHud(); },
});

const buttons = [
  [document.getElementById("pad-left"), "left"],
  [document.getElementById("pad-right"), "right"],
  [document.getElementById("pad-soft"), "soft"],
  [document.getElementById("pad-rot"), "rotR"],
  [document.getElementById("pad-hold"), "hold"],
  [document.getElementById("pad-hold-float"), "hold"],
].filter(([el]) => el);

const input = new Input(game, audio, {
  onPause: handlePauseButton,
  boardEl: els.board,
  buttons,
  isBlocked: () => tutorialOpen,
});

els.btnPlay.addEventListener("click", () => {
  audio.unlock();
  dismissTip(true);
  if (game.state === STATE.OVER || game.state === STATE.READY) {
    game.start();
    audio.start();
  } else if (game.state === STATE.PAUSED) {
    game.start();
  }
});

els.btnPause.addEventListener("click", () => {
  audio.unlock();
  handlePauseButton();
});

function goHome() {
  audio.unlock();
  if (tutorialOpen) return;
  try { game.reset(); } catch (_) {}
  try { audio.pause(); } catch (_) {}
  hudScoreShown = game.score;
  els.btnPause.setAttribute("aria-pressed", "false");
  els.btnPause.setAttribute("aria-label", "Pausar");
  els.btnPause.title = "Pausar";
  els.btnPause.textContent = "❚❚";
  showStart();
  syncHud();
  try { layout(); } catch (_) {}
  try { renderer.syncMinis(); } catch (_) {}
  try { renderer.draw(game); } catch (_) {}
}

if (els.btnHome) {
  els.btnHome.addEventListener("click", goHome);
}
if (els.btnHomeOverlay) {
  els.btnHomeOverlay.addEventListener("click", goHome);
}

els.btnHowToNext.addEventListener("click", () => {
  audio.unlock();
  advanceHowTo();
});

els.btnHowToSkip.addEventListener("click", () => {
  audio.unlock();
  finishHowTo();
});

document.addEventListener(
  "pointerdown",
  () => {
    audio.unlock();
  },
  { once: true, capture: true },
);

let lastWrapW = 0;
let lastWrapH = 0;
let last = performance.now();

window.addEventListener("resize", layout);
window.addEventListener("orientationchange", () => setTimeout(layout, 120));
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", layout);
}

document.addEventListener("visibilitychange", () => {
  window.clearTimeout(hidePauseTimer);
  if (!document.hidden) return;
  if (tutorialOpen) return;
  if (game.state !== STATE.PLAYING) return;
  hidePauseTimer = window.setTimeout(() => {
    if (document.hidden && game.state === STATE.PLAYING && !tutorialOpen) {
      game.togglePause();
    }
  }, 450);
});


function syncMuteBtn() {
  if (!els.btnMute) return;
  const muted = !!audio.muted;
  els.btnMute.setAttribute("aria-pressed", muted ? "true" : "false");
  els.btnMute.setAttribute("aria-label", muted ? "Ativar efeitos sonoros" : "Silenciar efeitos sonoros");
  els.btnMute.title = muted ? "Som ligado" : "Mudo";
  els.btnMute.textContent = muted ? "🔇" : "🔊";
}

if (els.btnMute) {
  const goMute = (ev) => {
    ev.preventDefault();
    audio.unlock();
    audio.toggleMute();
    syncMuteBtn();
  };
  els.btnMute.addEventListener("pointerup", goMute);
  els.btnMute.addEventListener("click", goMute);
  syncMuteBtn();
}

function readTipSeen() {
  try { return localStorage.getItem(TIP_KEY) === "1"; } catch { return false; }
}
function writeTipSeen() {
  try { localStorage.setItem(TIP_KEY, "1"); } catch {}
}
function dismissTip(persist) {
  if (els.tipToast) {
    els.tipToast.hidden = true;
    els.tipToast.setAttribute("hidden", "");
  }
  if (persist) writeTipSeen();
}
function showTipIfNeeded() {
  if (!els.tipToast) return;
  if (readTipSeen()) {
    dismissTip(false);
    return;
  }
  els.tipToast.hidden = false;
  els.tipToast.removeAttribute("hidden");
}
if (els.btnTipDismiss) {
  els.btnTipDismiss.addEventListener("click", (ev) => {
    ev.preventDefault();
    dismissTip(true);
  });
}
if (els.tipToast) {
  els.tipToast.addEventListener("pointerup", (ev) => {
    if (ev.target && ev.target.id === "btn-tip-dismiss") return;
    dismissTip(true);
  });
}

bootScreen();
layout();
syncHud();
requestAnimationFrame(loop);

function loop(now) {
  const dt = Math.min(48, now - last);
  last = now;
  try {
    if (game.state === STATE.PLAYING) input.step(dt);
    game.tick(dt);
    renderer.stepFx(dt);
    layoutIfNeeded();
    // placar sobe suave
    if (hudScoreShown < game.score) {
      const gap = game.score - hudScoreShown;
      hudScoreShown += Math.max(1, Math.ceil(gap * Math.min(1, dt / 120)));
      if (hudScoreShown > game.score) hudScoreShown = game.score;
      if (els.scoreFloat) els.scoreFloat.textContent = String(hudScoreShown);
      if (els.score) els.score.textContent = String(hudScoreShown);
      if (els.scoreRail) els.scoreRail.textContent = String(hudScoreShown);
    } else if (hudScoreShown > game.score) {
      hudScoreShown = game.score;
    }
    // classe de perigo no chrome quando a pilha sobe
    try {
      let danger = false;
      if (game.state === STATE.PLAYING && game.board) {
        for (let y = 2; y < 8 && !danger; y++) {
          for (let x = 0; x < 10; x++) {
            if (game.board[y][x]) { danger = true; break; }
          }
        }
      }
      els.app.classList.toggle("is-danger", danger);
    } catch (_) {}
    try { syncPauseOverlay(); } catch (_) {}
    renderer.draw(game);
  } catch (err) {
    console.error(err);
  }
  requestAnimationFrame(loop);
}

function handlePauseButton() {
  if (tutorialOpen) return;
  // Pausa só pausa/continua — não inicia partida (use Jogar / Espaço / Enter)
  if (game.state === STATE.READY || game.state === STATE.OVER) return;
  game.togglePause();
  // garante UI mesmo se o hook falhar
  syncPauseOverlay();
}

/** Se o estado é pausa, o overlay TEM que estar visível */
function syncPauseOverlay() {
  if (game.state !== STATE.PAUSED) return;
  if (!els.overlay || !els.overlay.hidden) {
    // ainda assim reforça display
    if (els.overlay) {
      els.overlay.hidden = false;
      els.overlay.removeAttribute("hidden");
      els.overlay.style.display = "grid";
    }
    return;
  }
  showOverlay("Pausa", "Cafézinho? Quando quiser, bora de novo.", false);
  if (els.themePicker) els.themePicker.hidden = true;
  const themeLab = document.getElementById("theme-label-ui");
  if (themeLab) themeLab.hidden = true;
  if (els.btnHomeOverlay) els.btnHomeOverlay.hidden = false;
  els.btnPlay.textContent = "Continuar";
  els.btnPause.textContent = "▶";
}

function syncHud() {
  const lv = String(game.level);
  const ln = String(game.lines);
  const set = (el, v) => { if (el) el.textContent = v; };
  // placar numérico é atualizado no loop (tween); aqui só força se estiver sincronizado
  if (hudScoreShown === game.score) {
    const s = String(game.score);
    set(els.score, s); set(els.scoreM, s); set(els.scoreRail, s); set(els.scoreFloat, s);
  }
  set(els.level, lv); set(els.lines, ln);
  set(els.levelM, lv); set(els.linesM, ln);
  set(els.levelRail, lv); set(els.linesRail, ln);
  set(els.levelFloat, lv);
  set(els.linesFloat, ln);
  if (els.comboFloat) {
    const c = game.combo || 0;
    els.comboFloat.textContent = c > 1 ? `x${c}` : "";
    if (els.comboWrap) els.comboWrap.hidden = c <= 1;
  }
  if (els.bestFloat) els.bestFloat.textContent = String(best || 0);
  // destaque se bateu recorde na partida
  if (els.scoreFloat && best > 0 && game.score >= best) {
    els.scoreFloat.classList.add("is-record");
  } else if (els.scoreFloat) {
    els.scoreFloat.classList.remove("is-record");
  }
  const empty = !game.hold;
  if (els.holdSlot) els.holdSlot.classList.toggle("is-empty", empty);
  if (els.holdSlotFloat) els.holdSlotFloat.classList.toggle("is-empty", empty);
}

function bootScreen() {
  writeHowToSeen(); // tutorial multi-passo fica desligado; tip leve abaixo
  showStart();
  showTipIfNeeded();
}

function openHowTo() {
  tutorialOpen = true;
  tutorialStep = 0;
  els.overlay.hidden = true;
  els.howto.hidden = false;
  els.app.classList.add("is-overlay");
  renderHowTo();
  queueHowToTick();
}

function renderHowTo() {
  const step = HOWTO_STEPS[tutorialStep];
  els.howtoTitle.textContent = step.title;
  els.howtoText.textContent = step.text;
  els.howtoVisual.dataset.step = String(tutorialStep);
  els.howtoDots.innerHTML = HOWTO_STEPS.map(
    (_, i) => `<span class="${i === tutorialStep ? "is-on" : ""}"></span>`,
  ).join("");
  const last = tutorialStep >= HOWTO_STEPS.length - 1;
  els.btnHowToNext.textContent = last ? "Bora!" : "Próximo";
}

function queueHowToTick() {
  window.clearTimeout(tutorialTimer);
  tutorialTimer = window.setTimeout(() => {
    if (!tutorialOpen) return;
    advanceHowTo();
  }, HOWTO_MS);
}

function advanceHowTo() {
  if (tutorialStep >= HOWTO_STEPS.length - 1) {
    finishHowTo();
    return;
  }
  tutorialStep += 1;
  renderHowTo();
  queueHowToTick();
}

function finishHowTo() {
  window.clearTimeout(tutorialTimer);
  tutorialOpen = false;
  els.howto.hidden = true;
  writeHowToSeen();
  showStart();
}

function showStart() {
  showOverlay("TETROK", "Encaixe. Limpe. Suba de nível.", false);
  els.btnPlay.textContent = "Jogar!";
  if (best > 0) {
    els.overlayScore.hidden = false;
    els.overlayScore.innerHTML = `<span>Recorde</span><strong>${best}</strong><span>Meta</span><strong>${Math.ceil(best * 1.25)}</strong>`;
  } else {
    els.overlayScore.hidden = true;
  }
  if (els.themePicker) els.themePicker.hidden = false;
  if (els.layoutPicker) els.layoutPicker.hidden = false;
  if (els.btnHomeOverlay) els.btnHomeOverlay.hidden = true;
}

function showOverlay(title, text, again, score) {
  els.overlay.hidden = false;
  els.overlay.removeAttribute("hidden");
  els.overlay.style.display = "grid";
  els.overlayTitle.textContent = title;
  els.overlayText.textContent = text;
  els.overlayText.hidden = !text;
  if (els.themePicker) els.themePicker.hidden = !!again; // visível no início e na pausa
  if (els.layoutPicker) {
    els.layoutPicker.hidden = !!again;
    const lab = document.getElementById("layout-label");
    if (lab) lab.hidden = !!again;
  }
  const themeLab = document.getElementById("theme-label-ui");
  if (themeLab) themeLab.hidden = !!again;
  els.btnPlay.textContent = again ? "Jogar de novo" : game.state === STATE.PAUSED ? "Continuar" : "Jogar";
  if (els.btnHomeOverlay) {
    els.btnHomeOverlay.hidden = !(again || game.state === STATE.PAUSED);
  }
  if (typeof score === "number") {
    els.overlayScore.hidden = false;
    els.overlayScore.innerHTML = `<span>Pontos</span><strong>${score}</strong><span>Recorde</span><strong>${best}</strong>`;
  } else {
    els.overlayScore.hidden = true;
  }
  els.app.classList.add("is-overlay");
}

function hideOverlay() {
  els.overlay.hidden = true;
  els.overlay.setAttribute("hidden", "");
  els.overlay.style.display = "none";
  els.app.classList.remove("is-overlay");
}

function layoutIfNeeded() {
  const box = els.wrap.getBoundingClientRect();
  if (Math.abs(box.height - lastWrapH) > 1 || Math.abs(box.width - lastWrapW) > 1) {
    layout();
  }
}

function layout() {
  const wrap = els.wrap;
  const rect = wrap.getBoundingClientRect();
  // Em iOS com zoom grudado, usa a viewport VISÍVEL pra não estourar a tela
  const vv = window.visualViewport;
  const scale = vv && vv.scale ? vv.scale : 1;
  let maxW = rect.width || wrap.clientWidth;
  let maxH = rect.height || wrap.clientHeight;
  if (vv && scale > 1.01) {
    maxW = Math.min(maxW, vv.width);
    maxH = Math.min(maxH, vv.height * 0.78);
  }
  lastWrapW = maxW;
  lastWrapH = maxH;

  if (!maxW || !maxH) {
    maxW = Math.min(360, (vv ? vv.width : window.innerWidth) * 0.92);
    maxH = Math.min(640, (vv ? vv.height : window.innerHeight) * 0.6);
  }

  // margem de segurança pra HUD flutuante não cortar
  maxW = Math.max(120, maxW - 4);
  maxH = Math.max(180, maxH - 4);

  const ratio = 10 / 20;
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  w = Math.floor(w);
  h = Math.floor(h);
  renderer.resize(w, h);
}

function readBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}

function writeBest(value) {
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch {
    /* ignore */
  }
}

function readHowToSeen() {
  try {
    return localStorage.getItem(HOWTO_KEY) === "1";
  } catch {
    return false;
  }
}

function writeHowToSeen() {
  try {
    localStorage.setItem(HOWTO_KEY, "1");
  } catch {
    /* ignore */
  }
}
