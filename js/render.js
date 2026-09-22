import { COLS, ROWS, HIDDEN, PIECES, cellsOf, LOCK_DELAY_MS } from "./pieces.js?v=43-polish";
import { ghostY } from "./engine.js?v=43-polish";
import { skinColors, skinStyle } from "./skins.js?v=43-polish";
const MAX_DPR = 2.75;

export class Renderer {
  constructor(boardCanvas, minis) {
    this.board = boardCanvas;
    this.bctx = boardCanvas.getContext("2d");
    this.minis = minis.map(({ canvas, kind, index }) => ({
      canvas,
      ctx: canvas.getContext("2d"),
      kind,
      index: typeof index === "number" ? index : 0,
    }));
    this.particles = [];
    this.beams = [];
    this.rings = [];
    this.scorePops = [];
    this.dropTrails = [];
    this.flash = 0;
    this.flashColor = "120, 220, 255";
    this.shake = 0;
    this.toast = "";
    this.toastMs = 0;
    this.levelFlash = 0;
    this.spawnFlash = 0;
    this.theme = "neon";
    this.reducedMotion = false;
    try {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      this.reducedMotion = !!mq.matches;
      if (mq.addEventListener) {
        mq.addEventListener("change", (e) => { this.reducedMotion = !!e.matches; });
      }
    } catch (_) {}
  }

  resize(cssWidth, cssHeight) {
    sizeCanvas(this.board, this.bctx, cssWidth, cssHeight, true);
    this.syncMinis();
  }

  syncMinis() {
    for (const miniCanvas of this.minis) {
      const canvas = miniCanvas.canvas;
      let rect = canvas.getBoundingClientRect();
      let w = rect.width;
      let h = rect.height;
      // NEXT flutuante / strip: nunca deixar canvas zerado (pai display:none ou overflow)
      const id = canvas.id || "";
      const isNextPreview =
        id === "next-float" || id === "next-strip" || id === "next-side" || id === "next-0";
      if ((w < 8 || h < 8) && isNextPreview) {
        w = Math.max(w, 56);
        h = Math.max(h, 56);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
      if (w < 8 || h < 8) continue;
      sizeCanvas(canvas, miniCanvas.ctx, w, h, false);
    }
  }

  setTheme(id) {
    const ok = id === "neon" || id === "magma" || id === "crt" || id === "pixel";
    this.theme = ok ? id : "neon";
  }

  spawnClear(rows, board, count) {
    const m = this.metrics();
    const theme = this.theme;
    let hues, flashColor;
    if (theme === "magma") {
      hues = count >= 4
        ? ["#ff6b2c", "#ffd166", "#ff3d5a", "#ff9f1c"]
        : count === 3
          ? ["#ff6b2c", "#ffd166", "#ef4444"]
          : count === 2
            ? ["#fb923c", "#fbbf24"]
            : ["#f97316", "#fdba74"];
      flashColor = count >= 4 ? "255, 120, 40" : "249, 115, 22";
    } else if (theme === "crt") {
      hues = ["#ffb000", "#ffc933", "#ffe08a", "#e09a00"];
      flashColor = "255, 176, 0";
    } else if (theme === "pixel") {
      hues = count >= 4
        ? ["#ff4d5e", "#2ee6ff", "#ffe14a", "#4dff6a"]
        : ["#4d7dff", "#d46bff", "#2ee6ff"];
      flashColor = count >= 4 ? "255, 77, 94" : "46, 230, 255";
    } else {
      hues = count >= 4
        ? ["#ff4fd8", "#7cf0ff", "#ffe566", "#a78bfa"]
        : count === 3
          ? ["#7cf0ff", "#ff7ad9", "#b8f26e"]
          : count === 2
            ? ["#5eead4", "#60a5fa"]
            : ["#38bdf8", "#a5b4fc"];
      flashColor = count >= 4 ? "255, 90, 210" : "90, 210, 255";
    }
    this.flashColor = flashColor;
    const rm = this.reducedMotion;
    this.flash = rm ? (count >= 4 ? 0.28 : 0.12) : (count >= 4 ? 0.78 : 0.34 + count * 0.09);
    this.shake = rm ? 0 : (count >= 4 ? 18 : 5 + count * 1.8);
    const sparkN = rm ? 0 : (count >= 4 ? 4 + count : 2 + count);
    for (const y of rows) {
      const visY = y - HIDDEN;
      if (visY < 0) continue;
      const cy = m.inset + (visY + 0.5) * m.ch;
      const left = m.inset;
      const right = m.inset + COLS * m.cw;
      if (!rm) {
        this.beams.push({
          y: cy,
          life: 460 + count * 50,
          max: 500 + count * 50,
          h: Math.max(3, m.ch * (0.6 + count * 0.1)),
          color: hues[visY % hues.length],
          left,
          right,
        });
        this.rings.push({
          x: (left + right) / 2,
          y: cy,
          r: m.cw * 0.2,
          vr: m.cw * (3.1 + count * 0.55),
          life: 520 + count * 55,
          max: 560 + count * 55,
          color: hues[(visY + 1) % hues.length],
          lw: Math.max(2, m.dpr * 2.4),
        });
      }
      if (sparkN <= 0) continue;
      for (let x = 0; x < COLS; x++) {
        const cellData = board[y][x];
        const color = cellData?.color || hues[x % hues.length];
        const px = m.inset + (x + 0.5) * m.cw;
        for (let i = 0; i < sparkN; i++) {
          const dir = i % 2 === 0 ? -1 : 1;
          this.particles.push({
            x: px,
            y: cy,
            vx: dir * (160 + Math.random() * 260) * m.dpr,
            vy: (Math.random() - 0.5) * 50 * m.dpr,
            life: 380 + Math.random() * 240,
            max: 620,
            size: (2 + Math.random() * 2.8) * m.dpr,
            color,
            kind: "spark",
          });
        }
      }
    }
    // TETROK quad: anel extra no centro do poço
    if (!rm && count >= 4) {
      const cx = m.inset + (COLS * m.cw) / 2;
      const cy = m.inset + (ROWS * m.ch) / 2;
      this.rings.push({
        x: cx, y: cy, r: m.cw * 0.4, vr: m.cw * 5.5,
        life: 700, max: 700, color: hues[0], lw: Math.max(3, m.dpr * 3),
      });
    }
  }

  spawnLock(hard, piece, dropCells = 0, fromY = null) {
    const m = this.metrics();
    const pal = piece ? skinColors(this.theme, piece.id) : null;
    const color = hard
      ? (pal?.color || "#ffe9a8")
      : (this.theme === "magma" ? "#fdba74" : this.theme === "crt" ? "#ffb000" : "#9ae6ff");

    if (hard && piece && dropCells > 1 && fromY != null) {
      // trilha de queda rápida
      for (const { x, y } of cellsOf(piece)) {
        const visY = y - HIDDEN;
        if (visY < 0) continue;
        const topVis = Math.max(0, fromY + (y - piece.y) - HIDDEN);
        this.dropTrails.push({
          x: m.inset + (x + 0.5) * m.cw,
          y0: m.inset + (topVis + 0.2) * m.ch,
          y1: m.inset + (visY + 0.8) * m.ch,
          life: 280 + dropCells * 12,
          max: 320 + dropCells * 12,
          color,
          w: Math.max(2, m.cw * 0.22),
        });
      }
    }

    const cells = piece ? cellsOf(piece) : [];
    if (cells.length) {
      for (const { x, y } of cells) {
        const visY = y - HIDDEN;
        if (visY < 0 || visY >= ROWS) continue;
        const px = m.inset + (x + 0.5) * m.cw;
        const py = m.inset + (visY + 0.5) * m.ch;
        const n = this.reducedMotion ? 0 : (hard ? 5 : 3);
        for (let i = 0; i < n; i++) {
          this.particles.push({
            x: px,
            y: py,
            vx: (Math.random() - 0.5) * (hard ? 260 : 140) * m.dpr,
            vy: (-60 - Math.random() * (hard ? 220 : 120)) * m.dpr,
            life: 260 + Math.random() * 200,
            max: 480,
            size: (1.4 + Math.random() * 2.2) * m.dpr,
            color,
          });
        }
      }
    } else {
      const n = this.reducedMotion ? 0 : (hard ? 18 : 10);
      for (let i = 0; i < n; i++) {
        this.particles.push({
          x: m.inset + Math.random() * (this.board.width - m.inset * 2),
          y: m.inset + this.board.height * (0.55 + Math.random() * 0.4),
          vx: (Math.random() - 0.5) * 200 * m.dpr,
          vy: (-80 - Math.random() * 180) * m.dpr,
          life: 280 + Math.random() * 220,
          max: 500,
          size: (1.6 + Math.random() * 2.4) * m.dpr,
          color,
        });
      }
    }
    if (hard) {
      if (this.reducedMotion) {
        this.flash = Math.max(this.flash, 0.18);
      } else {
        this.flash = Math.max(this.flash, 0.4);
        this.shake = Math.max(this.shake, 8 + Math.min(7, dropCells * 0.18));
      }
    }
  }

  showToast(text) {
    this.toast = text;
    const big = /TETROK|LIMPEZA|B2B/i.test(text || "");
    this.toastMs = big ? 1600 : 1150;
  }

  spawnScorePop(points, label) {
    if (!points) return;
    const m = this.metrics();
    this.scorePops.push({
      text: `+${points}`,
      sub: label || "",
      x: m.inset + (COLS * m.cw) / 2,
      y: m.inset + m.ch * 6,
      life: 1100,
      max: 1100,
      vy: -42 * m.dpr,
    });
  }

  onSpawnFlash() {
    this.spawnFlash = this.reducedMotion ? 0.12 : 0.35;
  }

  gameOverFx() {
    if (this.reducedMotion) {
      this.flashColor = "255, 90, 90";
      this.flash = Math.max(this.flash, 0.22);
      return;
    }
    this.flashColor = "255, 70, 90";
    this.flash = Math.max(this.flash, 0.48);
    this.shake = Math.max(this.shake, 11);
  }

  pulseLevel() {
    this.levelFlash = this.reducedMotion ? 0.45 : 1;
  }

  stepFx(dt) {
    const t = dt;
    this.flash = Math.max(0, this.flash - t / 380);
    this.shake = Math.max(0, this.shake - t / 50);
    this.toastMs = Math.max(0, this.toastMs - t);
    this.levelFlash = Math.max(0, this.levelFlash - t / 700);
    this.spawnFlash = Math.max(0, this.spawnFlash - t / 420);
    if (this.particles.length) {
      const next = [];
      for (const p of this.particles) {
        p.life -= t;
        p.x += (p.vx * t) / 1000;
        p.y += (p.vy * t) / 1000;
        if (p.kind !== "spark") p.vy += (380 * t) / 1000;
        else p.vx *= 1 - t / 900;
        if (p.life > 0) next.push(p);
      }
      this.particles = next;
    }
    if (this.beams.length) {
      const nextBeams = [];
      for (const b of this.beams) {
        b.life -= t;
        if (b.life > 0) nextBeams.push(b);
      }
      this.beams = nextBeams;
    }
    if (this.rings.length) {
      const nextRings = [];
      for (const r of this.rings) {
        r.life -= t;
        r.r += (r.vr * t) / 1000;
        if (r.life > 0) nextRings.push(r);
      }
      this.rings = nextRings;
    }
    if (this.scorePops.length) {
      const nextPops = [];
      for (const s of this.scorePops) {
        s.life -= t;
        s.y += (s.vy * t) / 1000;
        if (s.life > 0) nextPops.push(s);
      }
      this.scorePops = nextPops;
    }
    if (this.dropTrails.length) {
      const nextTrails = [];
      for (const tr of this.dropTrails) {
        tr.life -= t;
        if (tr.life > 0) nextTrails.push(tr);
      }
      this.dropTrails = nextTrails;
    }
  }

  draw(game) {
    this.drawBoard(game);
    const holdDim = !game.canHold && game.state === "playing";
    const queue = game.queue || [];
    for (const mini of this.minis) {
      try {
        if (!mini.ctx || !mini.canvas) continue;
        let id = null;
        if (mini.kind === "hold") id = game.hold;
        else {
          const idx = typeof mini.index === "number" ? mini.index : 0;
          id = queue[idx] || null;
        }
        this.drawMini(mini.ctx, mini.canvas, id, mini.kind === "hold" && holdDim);
      } catch (_) {
        /* um mini quebrado não pode apagar o NEXT */
      }
    }
  }

  metrics() {
    const w = this.board.width;
    const h = this.board.height;
    const dpr = dprOf(this.board);
    const inset = Math.max(10, dpr * 5);
    return {
      w,
      h,
      dpr,
      inset,
      cw: (w - inset * 2) / COLS,
      ch: (h - inset * 2) / ROWS,
    };
  }


  paintWell(ctx, w, h, dpr, cw) {
    const theme = this.theme || "neon";
    const radius = theme === "magma" ? cw * 0.16 : theme === "pixel" ? cw * 0.06 : cw * 0.14;
    roundRect(ctx, 0, 0, w, h, radius);
    ctx.save();
    roundRect(ctx, 0, 0, w, h, radius);
    ctx.clip();

    if (theme === "magma") {
      const base = ctx.createLinearGradient(0, 0, 0, h);
      base.addColorStop(0, "#1a0a06");
      base.addColorStop(0.55, "#0c0503");
      base.addColorStop(1, "#050201");
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
      let g = ctx.createRadialGradient(w * 0.5, h * 1.05, 0, w * 0.5, h * 1.05, h * 0.7);
      g.addColorStop(0, "rgba(234, 88, 12, 0.38)");
      g.addColorStop(0.45, "rgba(127, 29, 29, 0.18)");
      g.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      g = ctx.createRadialGradient(w * 0.2, h * 0.1, 0, w * 0.2, h * 0.1, w * 0.55);
      g.addColorStop(0, "rgba(251, 191, 36, 0.12)");
      g.addColorStop(1, "rgba(251, 191, 36, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // brasas
      ctx.fillStyle = "rgba(255,120,40,0.55)";
      for (let i = 0; i < 18; i++) {
        const sx = ((i * 73) % 1000) / 1000 * w;
        const sy = 0.55 * h + ((i * 41) % 1000) / 1000 * h * 0.42;
        ctx.globalAlpha = 0.12 + (i % 4) * 0.05;
        ctx.beginPath();
        ctx.arc(sx, sy, (1.2 + (i % 3) * 0.6) * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (theme === "crt") {
      ctx.fillStyle = "#050300";
      ctx.fillRect(0, 0, w, h);
      // scanlines
      ctx.fillStyle = "rgba(255, 176, 0, 0.045)";
      const step = Math.max(2, dpr * 2);
      for (let y = 0; y < h; y += step) ctx.fillRect(0, y, w, 1 * dpr);
      let g = ctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.4, w * 0.85);
      g.addColorStop(0, "rgba(255, 176, 0, 0.08)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    } else if (theme === "pixel") {
      ctx.fillStyle = "#0b1220";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(59, 130, 246, 0.06)";
      ctx.fillRect(0, 0, w, h);
    } else {
      // neon vidro
      const base = ctx.createLinearGradient(0, 0, 0, h);
      base.addColorStop(0, "#0b1020");
      base.addColorStop(0.45, "#0a0e1a");
      base.addColorStop(1, "#07080f");
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
      let aurora = ctx.createRadialGradient(w * 0.22, h * 0.18, 0, w * 0.22, h * 0.18, w * 0.85);
      aurora.addColorStop(0, "rgba(56, 189, 248, 0.38)");
      aurora.addColorStop(0.45, "rgba(34, 211, 238, 0.12)");
      aurora.addColorStop(1, "rgba(34, 211, 238, 0)");
      ctx.fillStyle = aurora;
      ctx.fillRect(0, 0, w, h);
      aurora = ctx.createRadialGradient(w * 0.82, h * 0.55, 0, w * 0.82, h * 0.55, w * 0.9);
      aurora.addColorStop(0, "rgba(167, 139, 250, 0.34)");
      aurora.addColorStop(0.5, "rgba(129, 140, 248, 0.12)");
      aurora.addColorStop(1, "rgba(129, 140, 248, 0)");
      ctx.fillStyle = aurora;
      ctx.fillRect(0, 0, w, h);
      aurora = ctx.createRadialGradient(w * 0.5, h * 1.05, 0, w * 0.5, h * 1.05, h * 0.55);
      aurora.addColorStop(0, "rgba(45, 212, 191, 0.16)");
      aurora.addColorStop(1, "rgba(45, 212, 191, 0)");
      ctx.fillStyle = aurora;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      for (let i = 0; i < 28; i++) {
        const sx = ((i * 97) % 1000) / 1000 * w;
        const sy = ((i * 53) % 1000) / 1000 * h;
        const r = (i % 3 === 0 ? 1.1 : 0.7) * dpr;
        ctx.globalAlpha = 0.18 + (i % 5) * 0.05;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      const glass = ctx.createLinearGradient(0, 0, 0, h);
      glass.addColorStop(0, "rgba(255,255,255,0.06)");
      glass.addColorStop(0.2, "rgba(255,255,255,0)");
      glass.addColorStop(0.85, "rgba(0,0,0,0)");
      glass.addColorStop(1, "rgba(0,0,0,0.35)");
      ctx.fillStyle = glass;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();

    if (theme === "magma") {
      ctx.strokeStyle = "rgba(249, 115, 22, 0.75)";
      ctx.lineWidth = Math.max(2.4, dpr * 1.4);
      roundRect(ctx, 2, 2, w - 4, h - 4, radius);
      ctx.stroke();
      ctx.strokeStyle = "rgba(127, 29, 29, 0.65)";
      ctx.lineWidth = Math.max(1.2, dpr * 0.7);
      roundRect(ctx, 6, 6, w - 12, h - 12, radius * 0.85);
      ctx.stroke();
    } else if (theme === "crt") {
      ctx.strokeStyle = "rgba(255, 176, 0, 0.7)";
      ctx.lineWidth = Math.max(2, dpr * 1.3);
      roundRect(ctx, 2, 2, w - 4, h - 4, radius);
      ctx.stroke();
    } else if (theme === "pixel") {
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = Math.max(3, dpr * 2);
      ctx.strokeRect(2, 2, w - 4, h - 4);
    } else {
      ctx.strokeStyle = "rgba(125, 211, 252, 0.6)";
      ctx.lineWidth = Math.max(2.2, dpr * 1.2);
      roundRect(ctx, 1.5, 1.5, w - 3, h - 3, radius);
      ctx.stroke();
      ctx.strokeStyle = "rgba(167, 139, 250, 0.35)";
      ctx.lineWidth = Math.max(1, dpr * 0.7);
      roundRect(ctx, 4, 4, w - 8, h - 8, cw * 0.12);
      ctx.stroke();
    }
  }

  paintGrid(ctx, cw, ch, innerW, innerH, dpr) {
    const theme = this.theme || "neon";
    let even, odd, hLine, vLine;
    if (theme === "magma") {
      even = "rgba(251, 146, 60, 0.05)";
      odd = "rgba(0, 0, 0, 0.22)";
      hLine = "rgba(251, 146, 60, 0.14)";
      vLine = "rgba(249, 115, 22, 0.12)";
    } else if (theme === "crt") {
      even = "rgba(255, 176, 0, 0.03)";
      odd = "rgba(0, 0, 0, 0.25)";
      hLine = "rgba(255, 176, 0, 0.2)";
      vLine = "rgba(255, 176, 0, 0.22)";
    } else if (theme === "pixel") {
      even = "rgba(59, 130, 246, 0.05)";
      odd = "rgba(0, 0, 0, 0.15)";
      hLine = "rgba(96, 165, 250, 0.25)";
      vLine = "rgba(96, 165, 250, 0.25)";
    } else {
      even = "rgba(125, 211, 252, 0.045)";
      odd = "rgba(15, 23, 42, 0.22)";
      hLine = "rgba(226, 232, 240, 0.14)";
      vLine = "rgba(165, 243, 252, 0.22)";
    }
    for (let x = 0; x < COLS; x++) {
      ctx.fillStyle = x % 2 === 0 ? even : odd;
      ctx.fillRect(x * cw, 0, cw, innerH);
    }
    ctx.strokeStyle = hLine;
    ctx.lineWidth = Math.max(1, dpr * 0.55);
    for (let y = 1; y < ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * ch);
      ctx.lineTo(innerW, y * ch);
      ctx.stroke();
    }
    ctx.strokeStyle = vLine;
    ctx.lineWidth = Math.max(1.15, dpr * 0.7);
    for (let x = 1; x < COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cw, 0);
      ctx.lineTo(x * cw, innerH);
      ctx.stroke();
    }
  }

  drawBoard(game) {
    const ctx = this.bctx;
    const { w, h, dpr, inset, cw, ch } = this.metrics();

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    const ox = this.shake ? (Math.random() - 0.5) * this.shake * dpr : 0;
    const oy = this.shake ? (Math.random() - 0.5) * this.shake * dpr : 0;
    ctx.translate(ox, oy);

    this.paintWell(ctx, w, h, dpr, cw);

    ctx.save();
    ctx.translate(inset, inset);
    const innerW = cw * COLS;
    const innerH = ch * ROWS;
    this.paintGrid(ctx, cw, ch, innerW, innerH, dpr);

    const clearing = new Set(game.clearingRows);
    const pulse = game.state === "clearing"
      ? 0.55 + 0.45 * Math.sin((game.clearAnimMs / 280) * Math.PI * 6)
      : 1;

    for (let y = HIDDEN; y < HIDDEN + ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const cell = game.board[y][x];
        if (!cell) continue;
        const visY = y - HIDDEN;
        const style = skinStyle(this.theme);
        if (clearing.has(y)) {
          const flash = style === "crt"
            ? { color: "#ffe08a", deep: "#ffb000" }
            : style === "magma"
              ? { color: "#fff1f2", deep: "#fb7185" }
              : { color: "#fff7d6", deep: "#f4c95d" };
          drawCell(ctx, x, visY, cw, ch, flash.color, flash.deep, 1, pulse, false, false, style, false);
        } else {
          const pal = skinColors(this.theme, cell.id || "viga");
          drawCell(ctx, x, visY, cw, ch, pal.color, pal.deep, 1, 1, false, false, style, !!pal.hatch);
        }
      }
    }

    if (game.active && game.state !== "over" && game.state !== "clearing") {
      const style = skinStyle(this.theme);
      const pal = skinColors(this.theme, game.active.id);
      // Sombra de queda (ghost)
      const gy = ghostY(game.board, game.active);
      if (gy !== game.active.y) {
        const ghost = { ...game.active, y: gy };
        for (const { x, y } of cellsOf(ghost)) {
          const visY = y - HIDDEN;
          if (visY < 0 || visY >= ROWS) continue;
          drawGhostCell(ctx, x, visY, cw, ch, pal.color, style);
        }
      }
      // Peça ativa — pulsa leve quando está travando no chão
      const lockPulse = game.grounded
        ? 0.88 + 0.12 * Math.sin((performance.now() / 120) * Math.PI)
        : 1;
      for (const { x, y } of cellsOf(game.active)) {
        const visY = y - HIDDEN;
        if (visY < 0 || visY >= ROWS) continue;
        drawCell(ctx, x, visY, cw, ch, pal.color, pal.deep, 1, lockPulse, true, false, style, !!pal.hatch);
      }
      // medidor de trava (quando no chão)
      if (game.grounded && game.lockMs > 0) {
        const ratio = Math.min(1, game.lockMs / LOCK_DELAY_MS);
        ctx.save();
        for (const { x, y } of cellsOf(game.active)) {
          const visY = y - HIDDEN;
          if (visY < 0 || visY >= ROWS) continue;
          const px = x * cw;
          const py = (visY + 1) * ch - Math.max(2, ch * 0.1);
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = "rgba(0,0,0,0.45)";
          ctx.fillRect(px + cw * 0.12, py, cw * 0.76, Math.max(2, ch * 0.08));
          ctx.fillStyle = pal.color;
          ctx.shadowColor = pal.color;
          ctx.shadowBlur = 8;
          ctx.fillRect(px + cw * 0.12, py, cw * 0.76 * ratio, Math.max(2, ch * 0.08));
          ctx.shadowBlur = 0;
        }
        ctx.restore();
      }
    }

    // alerta de perigo: pilha alta
    let danger = 0;
    for (let y = HIDDEN; y < HIDDEN + 6; y++) {
      for (let x = 0; x < COLS; x++) {
        if (game.board[y][x]) { danger = Math.max(danger, (HIDDEN + 6 - y) / 6); }
      }
    }
    if (danger > 0.15 && game.state === "playing") {
      const pulseD = 0.08 + 0.1 * Math.sin(performance.now() / 180);
      const g = ctx.createLinearGradient(0, 0, 0, innerH * 0.35);
      g.addColorStop(0, `rgba(239, 68, 68, ${danger * pulseD})`);
      g.addColorStop(1, "rgba(239,68,68,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, innerW, innerH * 0.35);
    }

    // trilhas de hard drop
    for (const tr of this.dropTrails) {
      const a = Math.max(0, tr.life / tr.max);
      const grd = ctx.createLinearGradient(0, tr.y0 - inset, 0, tr.y1 - inset);
      grd.addColorStop(0, "rgba(255,255,255,0)");
      grd.addColorStop(0.35, tr.color);
      grd.addColorStop(1, "rgba(255,255,255,0.85)");
      ctx.globalAlpha = a * 0.75;
      ctx.fillStyle = grd;
      ctx.shadowColor = tr.color;
      ctx.shadowBlur = 12;
      ctx.fillRect(tr.x - inset - tr.w / 2, tr.y0 - inset, tr.w, Math.max(1, tr.y1 - tr.y0));
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;

    for (const b of this.beams) {
      const a = Math.max(0, b.life / b.max);
      const grd = ctx.createLinearGradient(b.left - inset, 0, b.right - inset, 0);
      grd.addColorStop(0, "rgba(255,255,255,0)");
      grd.addColorStop(0.15, b.color);
      grd.addColorStop(0.5, "#ffffff");
      grd.addColorStop(0.85, b.color);
      grd.addColorStop(1, "rgba(255,255,255,0)");
      ctx.globalAlpha = a;
      ctx.fillStyle = grd;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 18;
      ctx.fillRect(b.left - inset, b.y - inset - b.h / 2, b.right - b.left, b.h);
      ctx.shadowBlur = 0;
    }
    for (const r of this.rings) {
      const a = Math.max(0, r.life / r.max);
      ctx.globalAlpha = a * 0.9;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.lw;
      ctx.beginPath();
      ctx.arc(r.x - inset, r.y - inset, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      if (p.kind === "spark") {
        ctx.fillRect(p.x - inset - p.size * 1.6, p.y - inset - p.size * 0.35, p.size * 3.2, p.size * 0.7);
      } else {
        ctx.beginPath();
        ctx.arc(p.x - inset, p.y - inset, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(${this.flashColor}, ${this.flash})`;
      ctx.fillRect(0, 0, innerW, innerH);
    }

    if (this.toastMs > 0 && this.toast) {
      const alpha = Math.min(1, this.toastMs / 280);
      const big = /TETROK|LIMPEZA|B2B/i.test(this.toast);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `800 ${Math.round(ch * (big ? 0.88 : 0.72))}px Sora, Manrope, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = this.theme === "magma" ? "#ffedd5" : this.theme === "crt" ? "#ffb000" : this.theme === "pixel" ? "#e2e8f0" : "#fff6d2";
      ctx.shadowColor = this.theme === "magma" ? "rgba(249, 115, 22, 0.95)" : this.theme === "crt" ? "rgba(255,176,0,0.95)" : "rgba(103, 232, 249, 0.9)";
      ctx.shadowBlur = 32;
      ctx.fillText(this.toast, innerW / 2, innerH * 0.4);
      ctx.restore();
    }

    for (const s of this.scorePops) {
      const a = Math.min(1, s.life / 280) * Math.min(1, (s.max - s.life) / 120 + 0.2);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `800 ${Math.round(ch * 0.55)}px Sora, Manrope, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = this.theme === "magma" ? "#fdba74" : this.theme === "crt" ? "#ffc933" : "#67e8f9";
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 16;
      ctx.fillText(s.text, s.x - inset, s.y - inset);
      if (s.sub) {
        ctx.font = `700 ${Math.round(ch * 0.28)}px Manrope, sans-serif`;
        ctx.fillStyle = "rgba(248,250,252,0.85)";
        ctx.shadowBlur = 0;
        ctx.fillText(s.sub, s.x - inset, s.y - inset + ch * 0.4);
      }
      ctx.restore();
    }

    // vinheta cinematográfica
    const vig = ctx.createRadialGradient(innerW / 2, innerH / 2, innerH * 0.25, innerW / 2, innerH / 2, innerH * 0.72);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.28)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, innerW, innerH);

    if (this.spawnFlash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.spawnFlash * 0.18})`;
      ctx.fillRect(0, 0, innerW, innerH);
    }

    if (this.levelFlash > 0) {
      ctx.fillStyle = `rgba(125, 211, 252, ${this.levelFlash * 0.12})`;
      ctx.fillRect(0, 0, innerW, innerH);
    }

    ctx.restore();

    if (this.theme === "magma") {
      ctx.strokeStyle = "rgba(249, 115, 22, 0.5)";
      ctx.lineWidth = Math.max(2, dpr * 1.4);
      roundRect(ctx, 1, 1, w - 2, h - 2, cw * 0.14);
      ctx.stroke();
    } else {
      ctx.strokeStyle = "rgba(150, 245, 225, 0.38)";
      ctx.lineWidth = Math.max(2, dpr * 1.5);
      roundRect(ctx, 1, 1, w - 2, h - 2, cw * 0.16);
      ctx.stroke();
    }

    ctx.restore();
  }

  drawMini(ctx, canvas, pieceId, dimmed) {
    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const theme = this.theme;
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    if (theme === "magma") {
      bg.addColorStop(0, "#2a0c08");
      bg.addColorStop(1, "#0a0402");
    } else if (theme === "crt") {
      bg.addColorStop(0, "#1a1200");
      bg.addColorStop(1, "#050300");
    } else if (theme === "pixel") {
      bg.addColorStop(0, "#1e293b");
      bg.addColorStop(1, "#0b1220");
    } else {
      bg.addColorStop(0, "#1e293b");
      bg.addColorStop(1, "#0f172a");
    }
    ctx.fillStyle = bg;
    const rad = theme === "pixel" ? 4 : Math.max(6, Math.min(w, h) * 0.18);
    roundRect(ctx, 0, 0, w, h, rad);
    ctx.fill();
    ctx.strokeStyle =
      theme === "magma"
        ? "rgba(249, 115, 22, 0.55)"
        : theme === "crt"
          ? "rgba(255,176,0,0.55)"
          : theme === "pixel"
            ? "#3b82f6"
            : "rgba(125, 211, 252, 0.35)";
    ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.04);
    roundRect(ctx, 1, 1, w - 2, h - 2, rad);
    ctx.stroke();

    if (!pieceId) {
      ctx.restore();
      return;
    }
    const def = PIECES[pieceId];
    if (!def || !def.shapes || !def.shapes[0]) {
      ctx.restore();
      return;
    }
    const cells = def.shapes[0];
    let minX = 99, minY = 99, maxX = 0, maxY = 0;
    for (const [x, y] of cells) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const pad = Math.min(w, h) * 0.14;
    const cell = Math.max(2, Math.min((w - pad * 2) / bw, (h - pad * 2) / bh));
    const ox = (w - bw * cell) / 2;
    const oy = (h - bh * cell) / 2;
    const pal = skinColors(this.theme, pieceId);
    const color = pal.color || "#22d3ee";
    const deep = pal.deep || shade(color, -0.25);
    ctx.globalAlpha = dimmed ? 0.4 : 1;

    // Preview SEMPRE sólido (neon transparente some no canvas pequenino)
    for (const [x, y] of cells) {
      const px = ox + (x - minX) * cell;
      const py = oy + (y - minY) * cell;
      const inset = Math.max(1, cell * 0.1);
      if (theme === "crt") {
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1.5, cell * 0.12);
        ctx.shadowColor = color;
        ctx.shadowBlur = cell * 0.25;
        ctx.strokeRect(px + inset, py + inset, cell - inset * 2, cell - inset * 2);
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255,176,0,0.22)";
        ctx.fillRect(px + inset, py + inset, cell - inset * 2, cell - inset * 2);
      } else if (theme === "pixel") {
        ctx.fillStyle = color;
        ctx.fillRect(px + inset, py + inset, cell - inset * 2, cell - inset * 2);
        ctx.fillStyle = shade(color, 0.35);
        ctx.fillRect(px + inset, py + inset, cell - inset * 2, Math.max(1, cell * 0.14));
        ctx.fillStyle = deep;
        ctx.fillRect(px + inset, py + cell - inset - Math.max(1, cell * 0.14), cell - inset * 2, Math.max(1, cell * 0.14));
        ctx.strokeStyle = "#000";
        ctx.lineWidth = Math.max(1, cell * 0.08);
        ctx.strokeRect(px + inset * 0.5, py + inset * 0.5, cell - inset, cell - inset);
      } else if (theme === "magma") {
        const r = Math.max(2, cell * 0.18);
        // crosta escura
        ctx.fillStyle = deep;
        roundRect(ctx, px + inset * 0.15, py + inset * 0.15, cell - inset * 0.3, cell - inset * 0.3, r);
        ctx.fill();
        // miolo lava
        const g = ctx.createLinearGradient(px, py, px + cell, py + cell);
        g.addColorStop(0, shade(color, 0.35));
        g.addColorStop(0.45, color);
        g.addColorStop(1, deep);
        ctx.fillStyle = g;
        ctx.shadowColor = color;
        ctx.shadowBlur = cell * 0.4;
        roundRect(ctx, px + inset, py + inset, cell - inset * 2, cell - inset * 2, r);
        ctx.fill();
        ctx.shadowBlur = 0;
        // brasa
        ctx.fillStyle = "rgba(255, 240, 180, 0.7)";
        roundRect(ctx, px + inset * 1.5, py + inset * 1.3, (cell - inset * 2) * 0.35, cell * 0.14, r * 0.4);
        ctx.fill();
      } else {
        // neon sólido + borda brilhante (legível no NEXT)
        const r = Math.max(2, cell * 0.2);
        ctx.shadowColor = color;
        ctx.shadowBlur = cell * 0.45;
        ctx.fillStyle = color;
        roundRect(ctx, px + inset, py + inset, cell - inset * 2, cell - inset * 2, r);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        roundRect(ctx, px + inset * 1.4, py + inset * 1.4, cell - inset * 2.8, cell - inset * 2.8, r * 0.7);
        ctx.fill();
        ctx.strokeStyle = shade(color, 0.35);
        ctx.lineWidth = Math.max(1.5, cell * 0.12);
        roundRect(ctx, px + inset, py + inset, cell - inset * 2, cell - inset * 2, r);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

}

function sizeCanvas(canvas, ctx, cssW, cssH, lockCss) {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const w = Math.max(1, Math.round(cssW * dpr));
  const h = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  if (lockCss) {
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function dprOf(canvas) {
  const css = canvas.getBoundingClientRect();
  return css.width ? canvas.width / css.width : 1;
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}


function drawGhostCell(ctx, x, y, cw, ch, color, style) {
  const px = x * cw;
  const py = y * ch;
  const inset = Math.max(1.2, cw * 0.12);
  ctx.save();
  ctx.globalAlpha = style === "pixel" ? 0.45 : 0.38;
  if (style === "pixel") {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, cw * 0.1);
    ctx.strokeRect(px + inset, py + inset, cw - inset * 2, ch - inset * 2);
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = color;
    ctx.fillRect(px + inset, py + inset, cw - inset * 2, ch - inset * 2);
  } else if (style === "crt") {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.2, cw * 0.08);
    ctx.setLineDash([Math.max(2, cw * 0.18), Math.max(2, cw * 0.12)]);
    ctx.strokeRect(px + inset, py + inset, cw - inset * 2, ch - inset * 2);
    ctx.setLineDash([]);
  } else {
    const r = Math.max(2, cw * 0.18);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.6, cw * 0.1);
    ctx.shadowColor = color;
    ctx.shadowBlur = cw * 0.2;
    roundRect(ctx, px + inset, py + inset, cw - inset * 2, ch - inset * 2, r);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = color;
    roundRect(ctx, px + inset, py + inset, cw - inset * 2, ch - inset * 2, r);
    ctx.fill();
  }
  ctx.restore();
}

function drawCell(ctx, x, y, cw, ch, color, deep, alpha = 1, pulse = 1, glow = false, raw = false, style = "neon", hatch = false) {
  const px = x * cw;
  const py = y * ch;
  ctx.save();
  ctx.globalAlpha = alpha;

  if (style === "magma") {
    const inset = Math.max(1.0, cw * 0.08);
    const r = Math.max(3, cw * 0.2);
    // crosta / sombra
    ctx.fillStyle = deep || shade(color, -0.35);
    roundRect(ctx, px + inset * 0.2, py + inset * 0.25, cw - inset * 0.4, ch - inset * 0.35, r);
    ctx.fill();
    // glow de brasa
    ctx.shadowColor = color;
    ctx.shadowBlur = glow ? cw * 0.55 : cw * 0.28;
    const g = ctx.createLinearGradient(px, py, px + cw, py + ch);
    g.addColorStop(0, shade(color, 0.4 * pulse));
    g.addColorStop(0.4, color);
    g.addColorStop(1, deep || shade(color, -0.25));
    ctx.fillStyle = g;
    roundRect(ctx, px + inset, py + inset, cw - inset * 2, ch - inset * 2, r);
    ctx.fill();
    ctx.shadowBlur = 0;
    // rachadura / highlight quente
    ctx.fillStyle = "rgba(255, 236, 179, 0.55)";
    roundRect(ctx, px + inset * 1.5, py + inset * 1.3, (cw - inset * 3) * 0.42, Math.max(1.5, ch * 0.12), r * 0.4);
    ctx.fill();
    ctx.strokeStyle = shade(color, -0.2);
    ctx.lineWidth = Math.max(1, cw * 0.06);
    roundRect(ctx, px + inset, py + inset, cw - inset * 2, ch - inset * 2, r);
    ctx.stroke();
  } else if (style === "crt") {
    const inset = Math.max(1, cw * 0.08);
    ctx.shadowColor = color;
    ctx.shadowBlur = glow ? cw * 0.35 : cw * 0.12;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, cw * 0.1);
    ctx.strokeRect(px + inset, py + inset, cw - inset * 2, ch - inset * 2);
    if (hatch) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,176,0,0.35)";
      ctx.lineWidth = Math.max(1, cw * 0.04);
      for (let i = -ch; i < cw + ch; i += Math.max(3, cw * 0.18)) {
        ctx.beginPath();
        ctx.moveTo(px + inset + i, py + inset);
        ctx.lineTo(px + inset + i - ch + inset * 2, py + ch - inset);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = "rgba(255, 176, 0, 0.18)";
      ctx.fillRect(px + inset, py + inset, cw - inset * 2, ch - inset * 2);
    }
    ctx.shadowBlur = 0;
  } else if (style === "pixel") {
    const inset = Math.max(1, cw * 0.06);
    // flat fill
    ctx.fillStyle = color;
    ctx.fillRect(px + inset, py + inset, cw - inset * 2, ch - inset * 2);
    // bevel highlight
    ctx.fillStyle = shade(color, 0.35);
    ctx.fillRect(px + inset, py + inset, cw - inset * 2, Math.max(1, ch * 0.12));
    ctx.fillRect(px + inset, py + inset, Math.max(1, cw * 0.12), ch - inset * 2);
    // shadow edge
    ctx.fillStyle = deep || shade(color, -0.35);
    ctx.fillRect(px + inset, py + ch - inset - Math.max(1, ch * 0.12), cw - inset * 2, Math.max(1, ch * 0.12));
    ctx.fillRect(px + cw - inset - Math.max(1, cw * 0.12), py + inset, Math.max(1, cw * 0.12), ch - inset * 2);
    // hard border
    ctx.strokeStyle = "#000";
    ctx.lineWidth = Math.max(1, cw * 0.06);
    ctx.strokeRect(px + inset * 0.5, py + inset * 0.5, cw - inset, ch - inset);
  } else {
    // neon — contorno brilhante + miolo translúcido (igual ao print)
    const inset = Math.max(1.0, cw * 0.08);
    const r = Math.max(3, cw * 0.22);
    // bloom externo (todas as peças, não só a ativa)
    ctx.shadowColor = color;
    ctx.shadowBlur = glow ? cw * 0.62 : cw * 0.28;
    // miolo colorido semi-transparente
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha * (glow ? 0.58 : 0.48);
    roundRect(ctx, px + inset, py + inset, cw - inset * 2, ch - inset * 2, r);
    ctx.fill();
    ctx.globalAlpha = alpha;
    // borda neon grossa
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2.4, cw * 0.14);
    roundRect(ctx, px + inset, py + inset, cw - inset * 2, ch - inset * 2, r);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // centro mais escuro / vidro
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    roundRect(ctx, px + inset * 1.35, py + inset * 1.35, cw - inset * 2.7, ch - inset * 2.7, r * 0.65);
    ctx.fill();
    // highlight interno
    ctx.fillStyle = shade(color, 0.45 * pulse);
    ctx.globalAlpha = alpha * 0.55;
    roundRect(
      ctx,
      px + inset * 1.6,
      py + inset * 1.5,
      (cw - inset * 3.2) * 0.45,
      (ch - inset * 3.2) * 0.28,
      r * 0.35,
    );
    ctx.fill();
    ctx.globalAlpha = alpha;
    // anel interno claro
    ctx.strokeStyle = shade(color, 0.55);
    ctx.lineWidth = Math.max(1, cw * 0.045);
    roundRect(ctx, px + inset * 0.85, py + inset * 0.85, cw - inset * 1.7, ch - inset * 1.7, r * 0.9);
    ctx.stroke();
  }
  ctx.restore();
}


function shade(hex, amt) {
  const n = hex.replace("#", "");
  const num = parseInt(n.length === 3 ? n.split("").map((c) => c + c).join("") : n, 16);
  const r = clampByte(((num >> 16) & 255) + Math.round(255 * amt));
  const g = clampByte(((num >> 8) & 255) + Math.round(255 * amt));
  const b = clampByte((num & 255) + Math.round(255 * amt));
  return `rgb(${r},${g},${b})`;
}

function clampByte(v) {
  return Math.max(0, Math.min(255, v));
}
