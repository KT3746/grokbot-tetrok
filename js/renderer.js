/**
 * Dual-path: tenta Three.js/WebGL; se falhar, usa o Canvas 2D clássico.
 * O jogo nunca fica travado sem renderer.
 */
import { CanvasRenderer } from "./render.js?v=202609241920";

export const FAIL_PT =
  "Não foi possível iniciar o gráfico 3D. O TETROK continua no visual clássico (2D).";

export function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(
      c.getContext("webgl2") ||
      c.getContext("webgl") ||
      c.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

function showFail(el, msg) {
  if (!el) return;
  el.hidden = false;
  el.removeAttribute("hidden");
  el.textContent = msg;
  window.setTimeout(() => {
    if (el && el.textContent === msg) {
      el.hidden = true;
      el.setAttribute("hidden", "");
    }
  }, 8000);
}

/** Se o canvas já pegou contexto WebGL, troca por um irmão limpo para o 2D. */
export function recoverCanvas(old) {
  if (!old || !old.parentNode) return old;
  const neu = old.cloneNode(false);
  old.replaceWith(neu);
  return neu;
}

export async function createRenderer(boardCanvas, minis, { failEl } = {}) {
  const useCanvas = (canvas, msg) => {
    if (msg) showFail(failEl, msg);
    document.body.classList.add("renderer-canvas");
    document.body.classList.remove("renderer-webgl");
    return { renderer: new CanvasRenderer(canvas, minis), canvas, mode: "canvas2d" };
  };

  if (!webglAvailable()) {
    return useCanvas(boardCanvas, FAIL_PT);
  }

  try {
    const { ThreeRenderer } = await import("./render3d.js?v=202609241920");
    const renderer = new ThreeRenderer(boardCanvas, minis);
    if (!renderer.ok) throw new Error("three-init-failed");
    document.body.classList.add("renderer-webgl");
    document.body.classList.remove("renderer-canvas");
    return { renderer, canvas: boardCanvas, mode: "webgl" };
  } catch (err) {
    console.warn("TETROK 3D:", err);
    const canvas = recoverCanvas(boardCanvas);
    return useCanvas(canvas, FAIL_PT);
  }
}
