import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FAIL_PT, webglAvailable } from "../js/renderer.js";

describe("renderer dual-path", () => {
  it("avisa em português quando o 3D não sobe", () => {
    assert.match(FAIL_PT, /gráfico 3D/);
    assert.match(FAIL_PT, /clássico/);
    assert.match(FAIL_PT, /TETROK/);
  });

  it("sem WebGL (Node) informa que não há GPU 3D", () => {
    assert.equal(webglAvailable(), false);
  });
});
