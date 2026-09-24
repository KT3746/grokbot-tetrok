import {
  COLS,
  TOTAL_ROWS,
  HIDDEN,
  PIECES,
  PIECE_KEYS,
  KICKS,
  I_KICKS,
  LINE_POINTS,
  LINES_PER_LEVEL,
  LOCK_DELAY_MS,
  MAX_LOCK_RESETS,
  CLEAR_ANIM_MS,
  cellsOf,
  spawnX,
  spawnY,
  shuffle,
  emptyBoard,
  gravityMs,
} from "./pieces.js?v=202609241920";

export const STATE = {
  READY: "ready",
  PLAYING: "playing",
  PAUSED: "paused",
  CLEARING: "clearing",
  OVER: "over",
};

export function createPiece(id, x = spawnX(), y = spawnY(), rot = 0) {
  return { id, x, y, rot };
}

export function collides(board, piece) {
  const cells = cellsOf(piece);
  for (const { x, y } of cells) {
    if (x < 0 || x >= COLS || y >= TOTAL_ROWS) return true;
    if (y >= 0 && board[y][x]) return true;
  }
  return false;
}

export function ghostY(board, piece) {
  const ghost = { ...piece };
  while (!collides(board, { ...ghost, y: ghost.y + 1 })) {
    ghost.y += 1;
  }
  return ghost.y;
}

export function mergePiece(board, piece) {
  const next = board.map((row) => row.slice());
  const def = PIECES[piece.id];
  for (const { x, y } of cellsOf(piece)) {
    if (y >= 0 && y < TOTAL_ROWS && x >= 0 && x < COLS) {
      next[y][x] = { id: piece.id, color: def.color, deep: def.deep };
    }
  }
  return next;
}

export function fullRows(board) {
  const rows = [];
  for (let y = 0; y < TOTAL_ROWS; y++) {
    if (board[y].every((cell) => cell)) rows.push(y);
  }
  return rows;
}

export function clearRows(board, rows) {
  if (!rows.length) return board.map((r) => r.slice());
  const drop = new Set(rows);
  const kept = board.filter((_, y) => !drop.has(y));
  const pad = Array.from({ length: rows.length }, () => Array(COLS).fill(null));
  return pad.concat(kept);
}

export function tryRotate(board, piece, dir) {
  const next = { ...piece, rot: (piece.rot + dir + 4) % 4 };
  const table = piece.id === "viga" ? I_KICKS : KICKS;
  for (const [dx, dy] of table) {
    const kicked = { ...next, x: next.x + dx, y: next.y + dy };
    if (!collides(board, kicked)) return kicked;
  }
  return null;
}

export function lineLabel(count) {
  if (count === 1) return "Boa!";
  if (count === 2) return "Dupla top!";
  if (count === 3) return "Tripla louca!";
  if (count >= 4) return "TETROK!!!";
  return "";
}

export class Game {
  constructor(hooks = {}, rng = Math.random) {
    this.hooks = hooks;
    this.rng = rng;
    this.reset();
  }

  reset() {
    this.board = emptyBoard();
    this.bag = [];
    this.queue = [];
    this.hold = null;
    this.canHold = true;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.combo = 0;
    this.lastDifficult = false;
    this.b2b = 0;
    this.state = STATE.READY;
    this.active = null;
    this.lockMs = 0;
    this.lockResets = 0;
    this.grounded = false;
    this.gravityAcc = 0;
    this.clearingRows = [];
    this.clearAnimMs = 0;
    this.lastClearLabel = "";
    this.fillQueue();
    this.active = this.takeNext();
  }

  fillQueue() {
    while (this.queue.length < 5) {
      if (this.bag.length === 0) {
        this.bag = shuffle(PIECE_KEYS, this.rng);
      }
      this.queue.push(this.bag.pop());
    }
  }

  takeNext() {
    this.fillQueue();
    const id = this.queue.shift();
    this.fillQueue();
    return createPiece(id);
  }

  start() {
    if (this.state === STATE.OVER) {
      this.reset();
      this.state = STATE.PLAYING;
    } else if (this.state === STATE.READY) {
      this.state = STATE.PLAYING;
    } else if (this.state === STATE.PAUSED) {
      this.state = STATE.PLAYING;
      this.hooks.onResume?.(this.snapshot());
      return;
    } else {
      return;
    }
    if (collides(this.board, this.active)) {
      this.state = STATE.OVER;
      this.hooks.onGameOver?.(this.snapshot());
      return;
    }
    this.hooks.onStart?.(this.snapshot());
  }

  togglePause() {
    if (this.state === STATE.PLAYING) {
      this.state = STATE.PAUSED;
      this.hooks.onPause?.(this.snapshot());
      return true;
    }
    if (this.state === STATE.PAUSED) {
      this.state = STATE.PLAYING;
      this.hooks.onResume?.(this.snapshot());
      return false;
    }
    return this.state === STATE.PAUSED;
  }

  isLive() {
    return this.state === STATE.PLAYING;
  }

  snapshot() {
    return {
      score: this.score,
      lines: this.lines,
      level: this.level,
      state: this.state,
      hold: this.hold,
      queue: this.queue.slice(),
      combo: this.combo,
      b2b: this.b2b,
      lastClearLabel: this.lastClearLabel,
      canHold: this.canHold,
      grounded: this.grounded,
      lockRatio: this.grounded && this.active
        ? Math.min(1, this.lockMs / LOCK_DELAY_MS)
        : 0,
    };
  }

  applyMove(dx, dy) {
    if (!this.isLive() || !this.active) return false;
    const next = { ...this.active, x: this.active.x + dx, y: this.active.y + dy };
    if (collides(this.board, next)) return false;
    this.active = next;
    this.noteShift(dy === 0);
    return true;
  }

  move(dx) {
    return this.applyMove(dx, 0);
  }

  softDrop() {
    if (!this.isLive()) return false;
    const moved = this.applyMove(0, 1);
    if (moved) {
      this.score += 1;
      this.gravityAcc = 0;
      this.hooks.onScore?.(this.snapshot());
      this.hooks.onSoftDrop?.();
    }
    return moved;
  }

  hardDrop() {
    if (!this.isLive() || !this.active) return 0;
    const fromY = this.active.y;
    let cells = 0;
    while (this.applyMove(0, 1)) cells += 1;
    if (cells > 0) {
      this.score += cells * 2;
      this.hooks.onScore?.(this.snapshot());
    }
    this.lockPiece(true, { dropCells: cells, fromY });
    return cells;
  }

  rotate(dir = 1) {
    if (!this.isLive() || !this.active) return false;
    const next = tryRotate(this.board, this.active, dir);
    if (!next) return false;
    this.active = next;
    this.noteShift(true);
    this.hooks.onRotate?.();
    return true;
  }

  holdPiece() {
    if (!this.isLive() || !this.canHold || !this.active) return false;
    const current = this.active.id;
    if (this.hold) {
      this.active = createPiece(this.hold);
    } else {
      this.active = this.takeNext();
    }
    this.hold = current;
    this.canHold = false;
    this.lockMs = 0;
    this.lockResets = 0;
    this.grounded = false;
    this.gravityAcc = 0;
    if (collides(this.board, this.active)) {
      this.finishGame();
      return false;
    }
    this.hooks.onHold?.(this.snapshot());
    return true;
  }

  noteShift(resetLock) {
    const nowGrounded = collides(this.board, { ...this.active, y: this.active.y + 1 });
    if (nowGrounded && resetLock && this.lockResets < MAX_LOCK_RESETS) {
      this.lockMs = 0;
      this.lockResets += 1;
    }
    this.grounded = nowGrounded;
    if (!nowGrounded) {
      this.lockMs = 0;
    }
  }

  tick(dt) {
    if (this.state === STATE.CLEARING) {
      this.clearAnimMs += dt;
      if (this.clearAnimMs >= CLEAR_ANIM_MS) {
        this.board = clearRows(this.board, this.clearingRows);
        this.clearingRows = [];
        this.clearAnimMs = 0;
        this.spawnNext();
      }
      return;
    }

    if (!this.isLive() || !this.active) return;

    this.gravityAcc += dt;
    const interval = gravityMs(this.level);
    while (this.gravityAcc >= interval) {
      this.gravityAcc -= interval;
      if (!this.applyMove(0, 1)) break;
    }

    this.grounded = collides(this.board, { ...this.active, y: this.active.y + 1 });
    if (this.grounded) {
      this.lockMs += dt;
      if (this.lockMs >= LOCK_DELAY_MS) this.lockPiece(false);
    } else {
      this.lockMs = 0;
    }
  }

  lockPiece(fromHardDrop, extra = {}) {
    if (!this.active || this.state !== STATE.PLAYING) return;
    const piece = { ...this.active };
    this.board = mergePiece(this.board, this.active);
    this.hooks.onLock?.({
      hard: fromHardDrop,
      piece,
      dropCells: extra.dropCells || 0,
      fromY: extra.fromY ?? piece.y,
    });
    this.active = null;
    this.lockMs = 0;
    this.lockResets = 0;
    this.grounded = false;

    const rows = fullRows(this.board);
    if (rows.length) {
      this.beginClear(rows);
    } else {
      this.combo = 0;
      this.spawnNext();
    }
  }

  beginClear(rows) {
    this.clearingRows = rows;
    this.clearAnimMs = 0;
    this.state = STATE.CLEARING;
    const n = rows.length;
    this.combo += 1;
    const base = LINE_POINTS[Math.min(n, 4)] * this.level;
    const comboBonus = this.combo > 1 ? 50 * (this.combo - 1) * this.level : 0;
    const difficult = n >= 4;
    let b2bBonus = 0;
    let b2b = false;
    if (difficult && this.lastDifficult) {
      b2b = true;
      this.b2b += 1;
      b2bBonus = Math.floor(base * 0.5);
    } else if (difficult) {
      this.b2b = 0;
    } else {
      this.b2b = 0;
    }
    this.lastDifficult = difficult;

    // Limpeza total: só restam as linhas que vão sumir
    let perfect = true;
    const clearing = new Set(rows);
    for (let y = 0; y < this.board.length; y++) {
      if (clearing.has(y)) continue;
      for (let x = 0; x < this.board[y].length; x++) {
        if (this.board[y][x]) { perfect = false; break; }
      }
      if (!perfect) break;
    }
    const perfectBonus = perfect ? 1200 * this.level : 0;

    const gained = base + comboBonus + b2bBonus + perfectBonus;
    this.score += gained;
    this.lines += n;
    const prevLevel = this.level;
    this.level = 1 + Math.floor(this.lines / LINES_PER_LEVEL);

    let label = lineLabel(n);
    if (b2b) label = `B2B ${label}`;
    if (perfect) label = perfect && n >= 4 ? `LIMPEZA · ${label}` : `LIMPEZA TOTAL!`;
    this.lastClearLabel = label;

    this.hooks.onLineClear?.({
      rows,
      count: n,
      label,
      combo: this.combo,
      b2b,
      perfect,
      gained,
      snapshot: this.snapshot(),
    });
    this.hooks.onScore?.(this.snapshot());
    if (this.level > prevLevel) {
      this.hooks.onLevelUp?.(this.snapshot());
    }
  }

  spawnNext() {
    this.state = STATE.PLAYING;
    this.active = this.takeNext();
    this.canHold = true;
    this.gravityAcc = 0;
    this.lockMs = 0;
    this.lockResets = 0;
    if (collides(this.board, this.active)) {
      this.finishGame();
    } else {
      this.hooks.onSpawn?.(this.snapshot());
    }
  }

  finishGame() {
    this.state = STATE.OVER;
    this.hooks.onGameOver?.(this.snapshot());
  }
}

export { COLS, TOTAL_ROWS, HIDDEN, gravityMs };
