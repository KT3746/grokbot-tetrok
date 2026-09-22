/**
 * Peças originais do Queda Certa — poliominós de 4 blocos
 * com nomes em português. As formas são geometria genérica.
 */

export const COLS = 10;
export const ROWS = 20;
export const HIDDEN = 2;
export const TOTAL_ROWS = ROWS + HIDDEN;

export const LINE_POINTS = [0, 100, 300, 500, 800];
export const LINES_PER_LEVEL = 10;
export const LOCK_DELAY_MS = 480;
export const MAX_LOCK_RESETS = 16;
export const CLEAR_ANIM_MS = 480;
export const DAS_MS = 105;
export const ARR_MS = 16;
export const SOFT_DROP_MS = 14;

export const PIECE_KEYS = [
  "viga",
  "quadro",
  "ancora",
  "onda",
  "raio",
  "gancho",
  "cotovelo",
];

/**
 * Cada rotação é uma lista de [x, y] dentro de uma caixa 4×4.
 * O pivot fica perto do centro, o que deixa o giro previsível.
 */
export const PIECES = {
  viga: {
    id: "viga",
    nome: "Viga",
    color: "#2dd4bf",
    deep: "#0f766e",
    glow: "rgba(45, 212, 191, 0.55)",
    shapes: [
      [[0, 1], [1, 1], [2, 1], [3, 1]],
      [[2, 0], [2, 1], [2, 2], [2, 3]],
      [[0, 2], [1, 2], [2, 2], [3, 2]],
      [[1, 0], [1, 1], [1, 2], [1, 3]],
    ],
  },
  quadro: {
    id: "quadro",
    nome: "Quadro",
    color: "#fbbf24",
    deep: "#b45309",
    glow: "rgba(251, 191, 36, 0.5)",
    shapes: [
      [[1, 1], [2, 1], [1, 2], [2, 2]],
      [[1, 1], [2, 1], [1, 2], [2, 2]],
      [[1, 1], [2, 1], [1, 2], [2, 2]],
      [[1, 1], [2, 1], [1, 2], [2, 2]],
    ],
  },
  ancora: {
    id: "ancora",
    nome: "Âncora",
    color: "#c084fc",
    deep: "#7e22ce",
    glow: "rgba(192, 132, 252, 0.55)",
    shapes: [
      [[1, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [1, 1], [2, 1], [1, 2]],
      [[0, 1], [1, 1], [2, 1], [1, 2]],
      [[1, 0], [0, 1], [1, 1], [1, 2]],
    ],
  },
  onda: {
    id: "onda",
    nome: "Onda",
    color: "#a3e635",
    deep: "#4d7c0f",
    glow: "rgba(163, 230, 53, 0.5)",
    shapes: [
      [[1, 0], [2, 0], [0, 1], [1, 1]],
      [[1, 0], [1, 1], [2, 1], [2, 2]],
      [[1, 1], [2, 1], [0, 2], [1, 2]],
      [[0, 0], [0, 1], [1, 1], [1, 2]],
    ],
  },
  raio: {
    id: "raio",
    nome: "Raio",
    color: "#fb7185",
    deep: "#be123c",
    glow: "rgba(251, 113, 133, 0.5)",
    shapes: [
      [[0, 0], [1, 0], [1, 1], [2, 1]],
      [[2, 0], [1, 1], [2, 1], [1, 2]],
      [[0, 1], [1, 1], [1, 2], [2, 2]],
      [[1, 0], [0, 1], [1, 1], [0, 2]],
    ],
  },
  gancho: {
    id: "gancho",
    nome: "Gancho",
    color: "#38bdf8",
    deep: "#0369a1",
    glow: "rgba(56, 189, 248, 0.5)",
    shapes: [
      [[0, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [1, 2]],
      [[0, 1], [1, 1], [2, 1], [2, 2]],
      [[1, 0], [1, 1], [0, 2], [1, 2]],
    ],
  },
  cotovelo: {
    id: "cotovelo",
    nome: "Cotovelo",
    color: "#fb923c",
    deep: "#c2410c",
    glow: "rgba(251, 146, 60, 0.5)",
    shapes: [
      [[2, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [1, 1], [1, 2], [2, 2]],
      [[0, 1], [1, 1], [2, 1], [0, 2]],
      [[0, 0], [1, 0], [1, 1], [1, 2]],
    ],
  },
};

/** Tentativas de encaixe ao girar (sistema próprio, simples e justo). */
export const KICKS = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [0, -1],
  [-1, -1],
  [1, -1],
  [-2, 0],
  [2, 0],
  [0, 1],
  [-1, 1],
  [1, 1],
];

export const I_KICKS = [
  [0, 0],
  [-2, 0],
  [2, 0],
  [-1, 0],
  [1, 0],
  [0, -1],
  [-2, -1],
  [2, -1],
  [0, 1],
];

export function gravityMs(level) {
  const lv = Math.max(1, level);
  // Níveis 1–3 bem calmos; depois a rampa fica mais nítida.
  const early = [0, 1250, 1050, 880];
  if (lv <= 3) return early[lv];
  return Math.max(48, Math.round(680 * Math.pow(0.76, lv - 4)));
}

export function cellsOf(piece) {
  const def = PIECES[piece.id];
  const shape = def.shapes[piece.rot];
  return shape.map(([x, y]) => ({ x: piece.x + x, y: piece.y + y }));
}

export function spawnX() {
  return 3;
}

export function spawnY() {
  return HIDDEN;
}

export function shuffle(list, rng = Math.random) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function emptyBoard() {
  return Array.from({ length: TOTAL_ROWS }, () => Array(COLS).fill(null));
}

export function cloneBoard(board) {
  return board.map((row) => row.slice());
}
