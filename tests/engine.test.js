import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  Game,
  STATE,
  collides,
  mergePiece,
  fullRows,
  clearRows,
  tryRotate,
  createPiece,
  ghostY,
  lineLabel,
} from "../js/engine.js";
import {
  emptyBoard,
  COLS,
  TOTAL_ROWS,
  HIDDEN,
  LINE_POINTS,
  PIECE_KEYS,
  cellsOf,
  gravityMs,
  spawnY,
} from "../js/pieces.js";

function fillRow(board, y, skip = []) {
  for (let x = 0; x < COLS; x++) {
    if (skip.includes(x)) continue;
    board[y][x] = { id: "quadro", color: "#fff", deep: "#999" };
  }
}

describe("colisões e fantasma", () => {
  it("bloqueia parede e fundo", () => {
    const board = emptyBoard();
    const piece = createPiece("quadro", 8, 0);
    assert.equal(collides(board, piece), true);
    const floor = createPiece("quadro", 3, TOTAL_ROWS - 1);
    assert.equal(collides(board, floor), true);
  });

  it("calcula a sombra no chão vazio", () => {
    const board = emptyBoard();
    const piece = createPiece("quadro", 3, 0);
    const gy = ghostY(board, piece);
    assert.equal(gy, TOTAL_ROWS - 3);
  });
});

describe("linhas", () => {
  it("detecta e remove linhas cheias, empilhando o resto", () => {
    const board = emptyBoard();
    fillRow(board, TOTAL_ROWS - 1);
    fillRow(board, TOTAL_ROWS - 2, [0]);
    board[TOTAL_ROWS - 2][0] = null;
    assert.deepEqual(fullRows(board), [TOTAL_ROWS - 1]);
    const next = clearRows(board, [TOTAL_ROWS - 1]);
    assert.equal(next[0].every((c) => c === null), true);
    assert.equal(next[TOTAL_ROWS - 1][1].id, "quadro");
    assert.equal(next[TOTAL_ROWS - 1][0], null);
  });

  it("nomeia as limpezas em português", () => {
    assert.equal(lineLabel(1), "Boa!");
    assert.equal(lineLabel(2), "Dupla top!");
    assert.equal(lineLabel(3), "Tripla louca!");
    assert.equal(lineLabel(4), "TETROK!!!");
  });
});

describe("rotação", () => {
  it("gira a âncora no centro e recua da parede", () => {
    const board = emptyBoard();
    const mid = createPiece("ancora", 3, 8, 0);
    const rotated = tryRotate(board, mid, 1);
    assert.ok(rotated);
    assert.equal(rotated.rot, 1);

    const wall = createPiece("viga", -1, 6, 0);
    const kicked = tryRotate(board, wall, 1);
    assert.ok(kicked);
    assert.ok(kicked.x >= -1);
    assert.equal(collides(board, kicked), false);
  });
});

describe("partida", () => {
  it("soma pontos de 1 a 4 linhas e sobe de nível a cada 10", () => {
    const game = new Game({}, () => 0);
    game.start();
    game.board = emptyBoard();
    fillRow(game.board, TOTAL_ROWS - 1);
    game.board[TOTAL_ROWS - 6][0] = { id: "viga" }; /* sobra bloco: não é limpeza total */
    game.beginClear([TOTAL_ROWS - 1]);
    assert.equal(game.score, LINE_POINTS[1]);
    assert.equal(game.lines, 1);
    assert.equal(game.lastClearLabel, "Boa!");

    game.lines = 10;
    game.level = 2;
    game.score = 0;
    game.combo = 0;
    game.board = emptyBoard();
    for (let i = 0; i < 4; i++) fillRow(game.board, TOTAL_ROWS - 1 - i);
    game.board[TOTAL_ROWS - 8][0] = { id: "viga" };
    game.lastDifficult = false;
    game.beginClear([
      TOTAL_ROWS - 1,
      TOTAL_ROWS - 2,
      TOTAL_ROWS - 3,
      TOTAL_ROWS - 4,
    ]);
    assert.equal(game.score, LINE_POINTS[4] * 2);
    assert.equal(game.lastClearLabel, "TETROK!!!");
    assert.equal(game.level, 2);

    game.lines = 9;
    game.level = 1;
    game.combo = 0;
    game.score = 0;
    game.beginClear([TOTAL_ROWS - 1]);
    assert.equal(game.level, 2);
    assert.equal(game.lines, 10);
    assert.equal(game.score, LINE_POINTS[1]);
  });

  it("combo soma bônus só em limpezas seguidas", () => {
    const game = new Game({}, () => 0);
    game.start();
    game.board[TOTAL_ROWS - 6][0] = { id: "viga" };
    game.beginClear([TOTAL_ROWS - 1]);
    const afterFirst = game.score;
    game.state = STATE.PLAYING;
    game.beginClear([TOTAL_ROWS - 1]);
    assert.equal(game.combo, 2);
    assert.equal(game.score, afterFirst + LINE_POINTS[1] + 50);

    game.state = STATE.PLAYING;
    game.combo = 2;
    game.board = emptyBoard();
    game.active = createPiece("quadro", 3, 0);
    game.lockPiece(false);
    assert.equal(game.combo, 0);
  });

  it("reserva só uma vez por peça e troca de volta", () => {
    const game = new Game({}, () => 0.3);
    game.start();
    const first = game.active.id;
    const queued = game.queue[0];
    assert.equal(game.holdPiece(), true);
    assert.equal(game.hold, first);
    assert.equal(game.active.id, queued);
    assert.equal(game.canHold, false);
    assert.equal(game.holdPiece(), false);
  });

  it("queda suave e rápida pontuam e a rápida trava a peça", () => {
    const game = new Game({}, () => 0);
    game.start();
    game.active = createPiece("quadro", 3, 0);
    assert.equal(game.softDrop(), true);
    assert.equal(game.score, 1);
    const cells = game.hardDrop();
    assert.ok(cells > 0);
    assert.equal(game.score, 1 + cells * 2);
    assert.equal(game.active === null || game.state === STATE.PLAYING || game.state === STATE.CLEARING, true);
  });

  it("termina quando a próxima peça não cabe", () => {
    const game = new Game({}, () => 0);
    game.start();
    const board = emptyBoard();
    for (let y = 0; y < TOTAL_ROWS; y++) fillRow(board, y);
    game.board = board;
    game.spawnNext();
    assert.equal(game.state, STATE.OVER);
  });

  it("não move nem marca ponto depois do fim", () => {
    const game = new Game({}, () => 0);
    game.start();
    game.finishGame();
    const score = game.score;
    assert.equal(game.move(1), false);
    assert.equal(game.softDrop(), false);
    assert.equal(game.hardDrop(), 0);
    assert.equal(game.rotate(1), false);
    assert.equal(game.score, score);
  });

  it("pausa e continua", () => {
    const game = new Game({}, () => 0);
    game.start();
    assert.equal(game.togglePause(), true);
    assert.equal(game.state, STATE.PAUSED);
    assert.equal(game.move(1), false);
    assert.equal(game.togglePause(), false);
    assert.equal(game.state, STATE.PLAYING);
  });

  it("mescla peça no tabuleiro", () => {
    const board = emptyBoard();
    const piece = createPiece("quadro", 3, HIDDEN);
    const next = mergePiece(board, piece);
    assert.ok(next[HIDDEN + 1][4]);
    assert.equal(next[HIDDEN + 1][4].id, "quadro");
  });
});

describe("spawn e gravidade", () => {
  it("nasce com todos os blocos na área visível", () => {
    assert.equal(spawnY(), HIDDEN);
    for (const id of PIECE_KEYS) {
      const piece = createPiece(id);
      for (const { y } of cellsOf(piece)) {
        assert.ok(y >= HIDDEN, `${id} cortada no topo (y=${y})`);
        assert.ok(y < TOTAL_ROWS, `${id} abaixo do poço (y=${y})`);
      }
    }
  });

  it("níveis 1–3 caem devagar e depois aceleram", () => {
    assert.ok(gravityMs(1) >= 1200);
    assert.ok(gravityMs(2) >= 1000);
    assert.ok(gravityMs(3) >= 850);
    assert.ok(gravityMs(1) > gravityMs(3));
    assert.ok(gravityMs(3) > gravityMs(6));
    assert.ok(gravityMs(10) < gravityMs(6));
    assert.equal(gravityMs(1) > 2 * gravityMs(8), true);
  });
});
