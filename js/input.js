import { DAS_MS, ARR_MS } from "./pieces.js?v=40-fix";

/**
 * Teclado + toque sem disparo duplo.
 * Usa Pointer Events (um único caminho para mouse, caneta e dedo).
 */
export class Input {
  constructor(game, audio, { onPause, boardEl, buttons, isBlocked }) {
    this.game = game;
    this.audio = audio;
    this.onPause = onPause;
    this.isBlocked = isBlocked || (() => false);
    this.boardEl = boardEl;
    this.held = new Map();
    this.hardDropArmed = true;
    this.swipe = null;
    this.consumedTap = false;

    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);

    window.addEventListener("keydown", this.onKeyDown, { passive: false });
    window.addEventListener("keyup", this.onKeyUp);

    boardEl.addEventListener("pointerdown", this.onPointerDown, { passive: false });
    window.addEventListener("pointermove", this.onPointerMove, { passive: false });
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);

    this.buttonCleanups = [];
    for (const [el, action] of buttons) {
      if (!el) continue;
      const down = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.audio.unlock();
        if (el.setPointerCapture) {
          try {
            el.setPointerCapture(ev.pointerId);
          } catch {
            /* ignore */
          }
        }
        this.startHold(action);
      };
      const up = (ev) => {
        ev.preventDefault();
        this.stopHold(action);
      };
      el.addEventListener("pointerdown", down, { passive: false });
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
      el.addEventListener("contextmenu", (e) => e.preventDefault());
      this.buttonCleanups.push(() => {
        el.removeEventListener("pointerdown", down);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
      });
    }
  }

  startHold(action) {
    if (this.isBlocked()) return;
    if (this.held.has(action)) return;
    this.fire(action, true);
    this.held.set(action, { acc: 0, started: false, das: true });
  }

  stopHold(action) {
    this.held.delete(action);
    if (action === "hard") this.hardDropArmed = true;
  }

  fire(action, first) {
    const g = this.game;
    if (action === "left") {
      if (g.move(-1)) this.audio.move();
    } else if (action === "right") {
      if (g.move(1)) this.audio.move();
    } else if (action === "soft") {
      g.softDrop();
    } else if (action === "hard") {
      if (first && this.hardDropArmed) {
        this.hardDropArmed = false;
        g.hardDrop();
        this.audio.hardDrop();
      }
    } else if (action === "rotR") {
      if (first) g.rotate(1);
    } else if (action === "rotL") {
      if (first) g.rotate(-1);
    } else if (action === "hold") {
      // HOLD desligado no modo essencial (sem UI)
    } else if (action === "pause") {
      if (first) this.onPause();
    }
  }

  step(dt) {
    for (const [action, st] of this.held) {
      if (action === "hard" || action === "rotR" || action === "rotL" || action === "hold" || action === "pause") {
        continue;
      }
      st.acc += dt;
      if (!st.started) {
        if (st.acc >= DAS_MS) {
          st.started = true;
          st.acc = 0;
          this.fire(action, false);
        }
      } else if (st.acc >= ARR_MS) {
        st.acc -= ARR_MS;
        this.fire(action, false);
      }
    }
  }

  onKeyDown(ev) {
    if (ev.repeat) return;
    const tag = (ev.target && ev.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (this.isBlocked()) return;

    const key = ev.key;
    const code = ev.code;
    this.audio.unlock();

    if (key === "p" || key === "P" || key === "Escape") {
      ev.preventDefault();
      this.onPause();
      return;
    }

    if ((this.game.state === "ready" || this.game.state === "over") && isPlayKey(key, code)) {
      ev.preventDefault();
      this.game.start();
      this.audio.start();
      return;
    }

    const action = keyAction(key, code);
    if (!action) return;
    ev.preventDefault();
    this.startHold(action);
  }

  onKeyUp(ev) {
    const action = keyAction(ev.key, ev.code);
    if (action) this.stopHold(action);
    if (ev.code === "Space") this.hardDropArmed = true;
  }

  onPointerDown(ev) {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    if (ev.target.closest && ev.target.closest("[data-action]")) return;
    if (this.isBlocked()) return;
    ev.preventDefault();
    this.audio.unlock();
    if (this.game.state === "ready") {
      this.game.start();
      this.audio.start();
      return;
    }
    if (this.game.state !== "playing") return;
    this.swipe = {
      id: ev.pointerId,
      x: ev.clientX,
      y: ev.clientY,
      lastX: ev.clientX,
      lastY: ev.clientY,
      moved: false,
      accX: 0,
      accY: 0,
    };
    try {
      this.boardEl.setPointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
  }

  onPointerMove(ev) {
    if (!this.swipe || this.swipe.id !== ev.pointerId) return;
    const dx = ev.clientX - this.swipe.lastX;
    const dy = ev.clientY - this.swipe.lastY;
    this.swipe.lastX = ev.clientX;
    this.swipe.lastY = ev.clientY;
    this.swipe.accX += dx;
    this.swipe.accY += dy;

    const cellPx = Math.max(28, this.boardEl.clientWidth / 10);
    const absX = Math.abs(this.swipe.accX);
    const absY = Math.abs(this.swipe.accY);

    if (absX > 10 || absY > 10) this.swipe.moved = true;

    if (absX >= cellPx * 0.42 && absX > absY * 0.85) {
      const dir = this.swipe.accX > 0 ? 1 : -1;
      const steps = Math.max(1, Math.round(absX / (cellPx * 0.92)));
      for (let i = 0; i < steps; i++) {
        if (this.game.move(dir)) this.audio.move();
      }
      this.swipe.accX = 0;
      this.swipe.accY *= 0.25;
    } else if (this.swipe.accY >= cellPx * 0.4 && absY > absX * 0.85) {
      const steps = Math.max(1, Math.round(this.swipe.accY / (cellPx * 0.55)));
      for (let i = 0; i < steps; i++) this.game.softDrop();
      this.swipe.accY = 0;
      this.swipe.accX *= 0.25;
    }
  }

  onPointerUp(ev) {
    if (!this.swipe || this.swipe.id !== ev.pointerId) return;
    const sx = this.swipe;
    const dx = ev.clientX - sx.x;
    const dy = ev.clientY - sx.y;
    const cellPx = Math.max(28, this.boardEl.clientWidth / 10);
    this.swipe = null;

    if (!sx.moved && Math.hypot(dx, dy) < 16) {
      if (this.game.rotate(1)) this.audio.rotate();
      return;
    }
    // swipe pra cima = queda rápida
    if (dy < -cellPx * 0.75 && Math.abs(dy) > Math.abs(dx) * 1.1) {
      this.game.hardDrop();
      this.audio.hardDrop();
    }
  }
}

function keyAction(key, code) {
  if (key === "ArrowLeft" || key === "a" || key === "A") return "left";
  if (key === "ArrowRight" || key === "d" || key === "D") return "right";
  if (key === "ArrowDown" || key === "s" || key === "S") return "soft";
  if (key === "ArrowUp" || key === "x" || key === "X") return "rotR";
  if (key === "z" || key === "Z") return "rotL";
  if (code === "Space") return "hard";
  // HOLD (C) desligado no modo essencial
  return null;
}

function isPlayKey(key, code) {
  return (
    key === "Enter" ||
    code === "Space" ||
    key === "ArrowLeft" ||
    key === "ArrowRight" ||
    key === "ArrowDown" ||
    key === "ArrowUp"
  );
}
