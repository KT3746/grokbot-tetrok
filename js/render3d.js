/**
 * Camada visual Three.js (baixo-poli) do TETROK.
 * Regras ficam no engine.js — aqui só desenho 3D + FX.
 * Preview NEXT/HOLD continua no Canvas 2D (legível em miniatura).
 */
import * as THREE from "three";
import { COLS, ROWS, HIDDEN, cellsOf, LOCK_DELAY_MS } from "./pieces.js?v=202609241920";
import { ghostY } from "./engine.js?v=202609241920";
import { skinColors } from "./skins.js?v=202609241920";
import { CanvasRenderer } from "./render.js?v=202609241920";

const CELL = 1;
const BOX = 0.86;
const BOX_Z = 0.92;
const LOCKED_CAP = COLS * ROWS;
const SPARK_CAP = 64;
const TRAIL_CAP = 16;

const WELL = {
  neon: {
    fog: 0x07101c, bg: 0x0a1220, wall: 0x1a2744, floor: 0x121a2c,
    grid: 0x67e8f9, rim: 0x22d3ee, hemi: 0xd1faff, hemiG: 0x312e81,
  },
  magma: {
    fog: 0x140805, bg: 0x160804, wall: 0x3a140c, floor: 0x220a06,
    grid: 0xfb923c, rim: 0xf97316, hemi: 0xffe0c2, hemiG: 0x4c0519,
  },
  crt: {
    fog: 0x120c00, bg: 0x0c0800, wall: 0x2a1c00, floor: 0x1a1200,
    grid: 0xffb000, rim: 0xffc933, hemi: 0xfff0b8, hemiG: 0x3a2200,
  },
  pixel: {
    fog: 0x0f172a, bg: 0x0f172a, wall: 0x334155, floor: 0x1e293b,
    grid: 0x60a5fa, rim: 0x3b82f6, hemi: 0xdbeafe, hemiG: 0x1e3a8a,
  },
};

function detectLowEnd() {
  const ua = (navigator.userAgent || "").toLowerCase();
  const mobileUA = /android|iphone|ipad|ipod|mobile|opera mini|iemobile/.test(ua);
  const narrow = window.innerWidth <= 500;
  const dpr = window.devicePixelRatio || 1;
  const touch = "ontouchstart" in window;
  const cores = navigator.hardwareConcurrency || 4;
  return mobileUA || narrow || cores <= 4 || (touch && dpr >= 2 && window.innerWidth <= 900);
}

function colX(col) {
  return (col - (COLS - 1) / 2) * CELL;
}

function visYToWorld(visY) {
  return ((ROWS - 1) / 2 - visY) * CELL;
}

export class ThreeRenderer {
  constructor(boardCanvas, minis) {
    this.board = boardCanvas;
    this.hud = new CanvasRenderer(null, minis);
    this.minis = this.hud.minis;
    this.mode = "webgl";
    this.ok = false;
    this.theme = "neon";
    this.particles = [];
    this.beams = [];
    this.rings = [];
    this.scorePops = [];
    this.dropTrails = [];
    this.flash = 0;
    this.flashColor = new THREE.Color(0x78dcff);
    this.shake = 0;
    this.toast = "";
    this.toastMs = 0;
    this.levelFlash = 0;
    this.spawnFlash = 0;
    this.cssW = 300;
    this.cssH = 600;
    this.dummy = new THREE.Object3D();
    this.color = new THREE.Color();
    this.camBase = new THREE.Vector3();
    this.lookAt = new THREE.Vector3(0, -0.6, 0);
    this.idleT = 0;
    this.sparkPool = [];
    this.sparkGeo = null;
    this.trailPool = [];

    this.reducedMotion = false;
    try {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      this.reducedMotion = !!mq.matches;
      if (mq.addEventListener) {
        mq.addEventListener("change", (e) => {
          this.reducedMotion = !!e.matches;
          this.lowFx = this.isLowEnd || this.reducedMotion;
        });
      }
    } catch (_) {}
    this.isLowEnd = detectLowEnd();
    this.lowFx = this.isLowEnd || this.reducedMotion;
    this.boot();
  }

  boot() {
    try {
      if (!THREE || !THREE.WebGLRenderer) throw new Error("no-three");
      this.setup();
      this.renderer.render(this.scene, this.camera);
      this.ok = true;
    } catch (err) {
      this.ok = false;
      throw err;
    }
  }

  setup() {
    const canvas = this.board;
    this.scene = new THREE.Scene();
    const look = WELL[this.theme] || WELL.neon;
    this.scene.background = new THREE.Color(look.bg);
    this.scene.fog = new THREE.FogExp2(look.fog, this.isLowEnd ? 0.016 : 0.009);

    this.camera = new THREE.PerspectiveCamera(36, 0.5, 0.1, 120);
    this.camBase.set(0, 10, 28);
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(this.lookAt);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: this.isLowEnd ? "low-power" : "high-performance",
    });
    const dprCap = this.lowFx ? 1 : 1.5;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = false;

    this.hemi = new THREE.HemisphereLight(look.hemi, look.hemiG, 1.05);
    this.scene.add(this.hemi);
    this.amb = new THREE.AmbientLight(0xffffff, 0.38);
    this.scene.add(this.amb);
    this.sun = new THREE.DirectionalLight(0xfff8ee, 1.15);
    this.sun.position.set(-8, 18, 12);
    this.sun.castShadow = false;
    this.scene.add(this.sun);
    this.fill = new THREE.DirectionalLight(0xb8d4ff, 0.4);
    this.fill.position.set(10, 6, 14);
    this.scene.add(this.fill);
    this.rimLight = new THREE.PointLight(look.rim, 0.7, 42, 2);
    this.rimLight.position.set(0, -7, 7);
    this.scene.add(this.rimLight);

    this.wellGroup = new THREE.Group();
    this.scene.add(this.wellGroup);
    this.buildWell(look);

    const boxGeo = new THREE.BoxGeometry(BOX, BOX, BOX_Z);
    this.lockedMat = this.makeCellMat();
    this.activeMat = this.makeCellMat(true);
    this.ghostMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      wireframe: false,
    });
    this.lockedMesh = new THREE.InstancedMesh(boxGeo, this.lockedMat, LOCKED_CAP);
    this.lockedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.lockedMesh.frustumCulled = false;
    this.lockedMesh.count = 0;
    this.lockedMesh.setColorAt(0, new THREE.Color(0xffffff));
    this.scene.add(this.lockedMesh);

    this.activeMesh = new THREE.InstancedMesh(boxGeo, this.activeMat, 8);
    this.activeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.activeMesh.frustumCulled = false;
    this.activeMesh.count = 0;
    this.activeMesh.setColorAt(0, new THREE.Color(0xffffff));
    this.scene.add(this.activeMesh);

    const ghostGeo = new THREE.BoxGeometry(BOX * 0.9, BOX * 0.9, BOX_Z * 0.85);
    this.ghostMesh = new THREE.InstancedMesh(ghostGeo, this.ghostMat, 8);
    this.ghostMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.ghostMesh.frustumCulled = false;
    this.ghostMesh.count = 0;
    this.scene.add(this.ghostMesh);

    const barGeo = new THREE.BoxGeometry(BOX * 0.78, 0.08, BOX * 0.78);
    this.barMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.barMesh = new THREE.InstancedMesh(barGeo, this.barMat, 8);
    this.barMesh.frustumCulled = false;
    this.barMesh.count = 0;
    this.scene.add(this.barMesh);

    this.flashPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(COLS + 0.4, ROWS + 0.4),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    this.flashPlane.position.z = 0.7;
    this.scene.add(this.flashPlane);

    this.dangerPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(COLS + 0.2, 6),
      new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    this.dangerPlane.position.set(0, visYToWorld(2), 0.55);
    this.scene.add(this.dangerPlane);

    this.fxGroup = new THREE.Group();
    this.scene.add(this.fxGroup);
    this.sparkGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
    for (let i = 0; i < SPARK_CAP; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.sparkGeo, mat);
      mesh.visible = false;
      this.fxGroup.add(mesh);
      this.sparkPool.push({
        mesh,
        vx: 0, vy: 0, vz: 0,
        life: 0, max: 1,
        kind: "spark",
        live: false,
      });
    }

    const trailGeo = new THREE.BoxGeometry(0.18, 1, 0.18);
    for (let i = 0; i < TRAIL_CAP; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(trailGeo, mat);
      mesh.visible = false;
      this.fxGroup.add(mesh);
      this.trailPool.push({ mesh, life: 0, max: 1, live: false });
    }

    this.beamGroup = new THREE.Group();
    this.scene.add(this.beamGroup);

    this.mountFxHud();
    this.fitCamera();
  }

  makeCellMat(glow = false) {
    if (this.theme === "pixel") {
      return new THREE.MeshLambertMaterial({ flatShading: true });
    }
    if (this.lowFx) {
      return new THREE.MeshLambertMaterial({
        emissive: 0x101010,
        emissiveIntensity: 0.18,
        flatShading: true,
      });
    }
    return new THREE.MeshPhongMaterial({
      shininess: glow ? 28 : 14,
      specular: 0x3a3a3a,
      emissive: 0x141414,
      emissiveIntensity: glow ? 0.42 : 0.22,
      flatShading: true,
    });
  }

  buildWell(look) {
    while (this.wellGroup.children.length) {
      const ch = this.wellGroup.children[0];
      this.wellGroup.remove(ch);
      ch.geometry?.dispose?.();
      if (ch.material && !Array.isArray(ch.material)) ch.material.dispose?.();
    }
    const wallMat = new THREE.MeshLambertMaterial({ color: look.wall });
    const floorMat = new THREE.MeshLambertMaterial({ color: look.floor });
    const rimMat = new THREE.MeshBasicMaterial({ color: look.rim });

    const depth = 1.7;
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.42, ROWS + 0.8, depth), wallMat);
    left.position.set(-(COLS / 2) - 0.32, 0, -0.22);
    this.wellGroup.add(left);
    const right = left.clone();
    right.position.x = COLS / 2 + 0.32;
    this.wellGroup.add(right);

    const back = new THREE.Mesh(new THREE.BoxGeometry(COLS + 1.05, ROWS + 0.8, 0.28), wallMat);
    back.position.set(0, 0, -depth * 0.5 - 0.08);
    this.wellGroup.add(back);

    const floor = new THREE.Mesh(new THREE.BoxGeometry(COLS + 1.05, 0.36, depth + 0.15), floorMat);
    floor.position.set(0, -ROWS / 2 - 0.28, -0.12);
    this.wellGroup.add(floor);

    const rim = new THREE.Mesh(new THREE.BoxGeometry(COLS + 1.05, 0.1, 0.12), rimMat);
    rim.position.set(0, ROWS / 2 + 0.28, 0.45);
    this.wellGroup.add(rim);
    const rimB = rim.clone();
    rimB.position.y = -ROWS / 2 - 0.38;
    this.wellGroup.add(rimB);

    // grade no fundo (linhas, barato)
    const pts = [];
    const z = -depth * 0.5 + 0.12;
    const x0 = -COLS / 2;
    const y0 = -ROWS / 2;
    for (let x = 0; x <= COLS; x++) {
      pts.push(new THREE.Vector3(x0 + x, y0, z), new THREE.Vector3(x0 + x, y0 + ROWS, z));
    }
    for (let y = 0; y <= ROWS; y++) {
      pts.push(new THREE.Vector3(x0, y0 + y, z), new THREE.Vector3(x0 + COLS, y0 + y, z));
    }
    const grid = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({
        color: look.grid,
        transparent: true,
        opacity: this.theme === "pixel" ? 0.35 : 0.18,
      }),
    );
    this.wellGroup.add(grid);

    if (this.theme === "crt" && !this.lowFx) {
      const scan = new THREE.Mesh(
        new THREE.PlaneGeometry(COLS + 0.2, ROWS + 0.2),
        new THREE.MeshBasicMaterial({
          color: 0xffb000,
          transparent: true,
          opacity: 0.045,
          depthWrite: false,
        }),
      );
      scan.position.z = 0.62;
      this.wellGroup.add(scan);
    }
  }

  mountFxHud() {
    const wrap = this.board && this.board.parentElement;
    if (!wrap) return;
    this.fxLayer = document.createElement("div");
    this.fxLayer.className = "well-fx";
    this.fxLayer.setAttribute("aria-hidden", "true");
    this.toastEl = document.createElement("p");
    this.toastEl.className = "well-toast";
    this.toastEl.hidden = true;
    this.popsEl = document.createElement("div");
    this.popsEl.className = "well-pops";
    this.fxLayer.append(this.toastEl, this.popsEl);
    wrap.appendChild(this.fxLayer);
  }

  fitCamera() {
    if (!this.camera) return;
    const aspect = Math.max(0.2, this.cssW / Math.max(1, this.cssH));
    this.camera.aspect = aspect;
    const wellH = ROWS + 2.8;
    const wellW = COLS + 2.6;
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const distV = (wellH / 2) / Math.tan(vFov / 2);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const distH = (wellW / 2) / Math.tan(hFov / 2);
    const dist = Math.max(distV, distH) * 1.18;
    // ângulo de cima (poço 3D) sem distorcer o arcade
    this.camBase.set(0, dist * 0.36, dist * 0.9);
    this.lookAt.set(0, -1.15, 0);
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(this.lookAt);
    this.camera.updateProjectionMatrix();
  }

  resize(cssWidth, cssHeight) {
    this.cssW = cssWidth;
    this.cssH = cssHeight;
    if (this.renderer) {
      const dprCap = this.lowFx ? 1 : 1.5;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
      this.renderer.setSize(cssWidth, cssHeight, true);
      this.fitCamera();
    }
    this.hud.syncMinis();
  }

  syncMinis() {
    this.hud.syncMinis();
  }

  setTheme(id) {
    const ok = id === "neon" || id === "magma" || id === "crt" || id === "pixel";
    this.theme = ok ? id : "neon";
    this.hud.setTheme(this.theme);
    if (!this.scene) return;
    const look = WELL[this.theme] || WELL.neon;
    this.scene.background.setHex(look.bg);
    this.scene.fog = new THREE.FogExp2(look.fog, this.isLowEnd ? 0.016 : 0.009);
    if (this.hemi) {
      this.hemi.color.setHex(look.hemi);
      this.hemi.groundColor.setHex(look.hemiG);
    }
    if (this.rimLight) this.rimLight.color.setHex(look.rim);
    this.buildWell(look);
    this.lockedMat = this.makeCellMat(false);
    this.activeMat = this.makeCellMat(true);
    if (this.lockedMesh) this.lockedMesh.material = this.lockedMat;
    if (this.activeMesh) this.activeMesh.material = this.activeMat;
  }

  spawnClear(rows, board, count) {
    let hues, flashHex;
    if (this.theme === "magma") {
      hues = count >= 4
        ? ["#ff6b2c", "#ffd166", "#ff3d5a", "#ff9f1c"]
        : ["#f97316", "#fdba74"];
      flashHex = count >= 4 ? 0xff7828 : 0xf97316;
    } else if (this.theme === "crt") {
      hues = ["#ffb000", "#ffc933", "#ffe08a"];
      flashHex = 0xffb000;
    } else if (this.theme === "pixel") {
      hues = count >= 4 ? ["#ff4d5e", "#2ee6ff", "#ffe14a"] : ["#4d7dff", "#2ee6ff"];
      flashHex = count >= 4 ? 0xff4d5e : 0x2ee6ff;
    } else {
      hues = count >= 4
        ? ["#ff4fd8", "#7cf0ff", "#ffe566", "#a78bfa"]
        : ["#38bdf8", "#a5b4fc"];
      flashHex = count >= 4 ? 0xff5ad2 : 0x5ad2ff;
    }
    this.flashColor.setHex(flashHex);
    const rm = this.reducedMotion;
    this.flash = rm ? (count >= 4 ? 0.28 : 0.12) : (count >= 4 ? 0.62 : 0.28 + count * 0.07);
    this.shake = rm ? 0 : (count >= 4 ? 0.55 : 0.18 + count * 0.06);

    const sparkN = rm || this.lowFx ? 0 : (count >= 4 ? 3 : 2);
    for (const y of rows) {
      const visY = y - HIDDEN;
      if (visY < 0) continue;
      const wy = visYToWorld(visY);
      if (!rm && !this.lowFx) {
        this.beams.push({
          y: wy,
          life: 420 + count * 40,
          max: 480 + count * 40,
          color: hues[visY % hues.length],
          mesh: this.makeBeam(wy, hues[visY % hues.length], count),
        });
      }
      if (sparkN <= 0) continue;
      for (let x = 0; x < COLS; x++) {
        const cellData = board[y][x];
        const color = cellData?.color || hues[x % hues.length];
        const px = colX(x);
        for (let i = 0; i < sparkN; i++) {
          const dir = i % 2 === 0 ? -1 : 1;
          this.spawnSpark(
            px, wy, 0.4,
            dir * (3 + Math.random() * 4),
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.3) * 3,
            380 + Math.random() * 220,
            color,
            "spark",
          );
        }
      }
    }
  }

  makeBeam(y, color, count) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(COLS * 0.96, 0.22 + count * 0.04, 0.12),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    mesh.position.set(0, y, 0.5);
    this.beamGroup.add(mesh);
    return mesh;
  }

  spawnLock(hard, piece, dropCells = 0, fromY = null) {
    const pal = piece ? skinColors(this.theme, piece.id) : null;
    const color = hard
      ? (pal?.color || "#ffe9a8")
      : (this.theme === "magma" ? "#fdba74" : this.theme === "crt" ? "#ffb000" : "#9ae6ff");

    if (hard && piece && dropCells > 1 && fromY != null && !this.reducedMotion && !this.lowFx) {
      for (const { x, y } of cellsOf(piece)) {
        const visY = y - HIDDEN;
        if (visY < 0) continue;
        const topVis = Math.max(0, fromY + (y - piece.y) - HIDDEN);
        this.spawnTrail(colX(x), visYToWorld(topVis), visYToWorld(visY), color, 260 + dropCells * 10);
      }
    }

    const cells = piece ? cellsOf(piece) : [];
    const n = this.reducedMotion || this.lowFx ? 0 : (hard ? 3 : 2);
    for (const { x, y } of cells) {
      const visY = y - HIDDEN;
      if (visY < 0 || visY >= ROWS) continue;
      for (let i = 0; i < n; i++) {
        this.spawnSpark(
          colX(x), visYToWorld(visY), 0.35,
          (Math.random() - 0.5) * (hard ? 5 : 2.4),
          (1.2 + Math.random() * (hard ? 4 : 2.2)),
          (Math.random() - 0.5) * 2,
          260 + Math.random() * 180,
          color,
          "burst",
        );
      }
    }
    if (hard) {
      if (this.reducedMotion) this.flash = Math.max(this.flash, 0.16);
      else {
        this.flash = Math.max(this.flash, 0.32);
        this.shake = Math.max(this.shake, 0.22 + Math.min(0.25, dropCells * 0.012));
      }
    }
  }

  spawnSpark(x, y, z, vx, vy, vz, life, color, kind) {
    const slot = this.sparkPool.find((s) => !s.live);
    if (!slot) return;
    slot.live = true;
    slot.life = life;
    slot.max = life;
    slot.vx = vx;
    slot.vy = vy;
    slot.vz = vz;
    slot.kind = kind;
    slot.mesh.visible = true;
    slot.mesh.position.set(x, y, z);
    slot.mesh.material.color.set(color);
    slot.mesh.material.opacity = 1;
    this.particles.push(slot);
  }

  spawnTrail(x, y0, y1, color, life) {
    const slot = this.trailPool.find((t) => !t.live);
    if (!slot) return;
    slot.live = true;
    slot.life = life;
    slot.max = life;
    const h = Math.max(0.4, Math.abs(y0 - y1));
    slot.mesh.visible = true;
    slot.mesh.position.set(x, (y0 + y1) / 2, 0.2);
    slot.mesh.scale.set(1, h, 1);
    slot.mesh.material.color.set(color);
    slot.mesh.material.opacity = 0.7;
    this.dropTrails.push(slot);
  }

  showToast(text) {
    this.toast = text;
    const big = /TETROK|LIMPEZA|B2B/i.test(text || "");
    this.toastMs = big ? 1600 : 1150;
  }

  spawnScorePop(points, label) {
    if (!points) return;
    this.scorePops.push({
      text: `+${points}`,
      sub: label || "",
      life: 1100,
      max: 1100,
    });
  }

  onSpawnFlash() {
    this.spawnFlash = this.reducedMotion ? 0.1 : 0.28;
  }

  gameOverFx() {
    this.flashColor.setHex(0xff465a);
    if (this.reducedMotion) {
      this.flash = Math.max(this.flash, 0.2);
      return;
    }
    this.flash = Math.max(this.flash, 0.42);
    this.shake = Math.max(this.shake, 0.35);
  }

  pulseLevel() {
    this.levelFlash = this.reducedMotion ? 0.4 : 1;
  }

  stepFx(dt) {
    this.idleT += dt / 1000;
    this.flash = Math.max(0, this.flash - dt / 380);
    this.shake = Math.max(0, this.shake - dt / 280);
    this.toastMs = Math.max(0, this.toastMs - dt);
    this.levelFlash = Math.max(0, this.levelFlash - dt / 700);
    this.spawnFlash = Math.max(0, this.spawnFlash - dt / 420);

    if (this.particles.length) {
      const next = [];
      for (const p of this.particles) {
        p.life -= dt;
        p.mesh.position.x += (p.vx * dt) / 1000;
        p.mesh.position.y += (p.vy * dt) / 1000;
        p.mesh.position.z += (p.vz * dt) / 1000;
        if (p.kind !== "spark") p.vy -= (8 * dt) / 1000;
        else p.vx *= 1 - dt / 900;
        const a = Math.max(0, p.life / p.max);
        p.mesh.material.opacity = a;
        if (p.life > 0) next.push(p);
        else {
          p.live = false;
          p.mesh.visible = false;
        }
      }
      this.particles = next;
    }

    if (this.beams.length) {
      const nextB = [];
      for (const b of this.beams) {
        b.life -= dt;
        const a = Math.max(0, b.life / b.max);
        if (b.mesh) {
          b.mesh.material.opacity = a * 0.9;
          b.mesh.scale.x = 0.7 + 0.3 * a;
        }
        if (b.life > 0) nextB.push(b);
        else if (b.mesh) {
          this.beamGroup.remove(b.mesh);
          b.mesh.geometry.dispose();
          b.mesh.material.dispose();
        }
      }
      this.beams = nextB;
    }

    if (this.dropTrails.length) {
      const nextT = [];
      for (const tr of this.dropTrails) {
        tr.life -= dt;
        tr.mesh.material.opacity = Math.max(0, tr.life / tr.max) * 0.7;
        if (tr.life > 0) nextT.push(tr);
        else {
          tr.live = false;
          tr.mesh.visible = false;
        }
      }
      this.dropTrails = nextT;
    }

    if (this.scorePops.length) {
      const nextP = [];
      for (const s of this.scorePops) {
        s.life -= dt;
        if (s.life > 0) nextP.push(s);
      }
      this.scorePops = nextP;
    }

    this.syncFxHud();
  }

  syncFxHud() {
    if (this.toastEl) {
      if (this.toastMs > 0 && this.toast) {
        this.toastEl.hidden = false;
        this.toastEl.textContent = this.toast;
        this.toastEl.style.opacity = String(Math.min(1, this.toastMs / 280));
        this.toastEl.classList.toggle("is-magma", this.theme === "magma");
        this.toastEl.classList.toggle("is-crt", this.theme === "crt");
        this.toastEl.classList.toggle("is-pixel", this.theme === "pixel");
      } else {
        this.toastEl.hidden = true;
      }
    }
    if (this.popsEl) {
      if (!this.scorePops.length) {
        this.popsEl.textContent = "";
      } else {
        const s = this.scorePops[this.scorePops.length - 1];
        const a = Math.min(1, s.life / 280) * Math.min(1, (s.max - s.life) / 120 + 0.2);
        this.popsEl.style.opacity = String(a);
        this.popsEl.innerHTML = `${s.text}${s.sub ? `<small>${s.sub}</small>` : ""}`;
      }
    }
  }

  setInstance(mesh, i, x, y, z, sx, sy, sz, hex) {
    const d = this.dummy;
    d.position.set(x, y, z);
    d.scale.set(sx, sy, sz);
    d.rotation.set(0, 0, 0);
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
    if (hex != null) {
      this.color.set(hex);
      mesh.setColorAt(i, this.color);
    }
  }

  draw(game) {
    if (!this.ok || !this.renderer) return;
    const clearing = new Set(game.clearingRows);
    const pulse = game.state === "clearing"
      ? 0.55 + 0.45 * Math.sin((game.clearAnimMs / 280) * Math.PI * 6)
      : 1;

    let n = 0;
    for (let y = HIDDEN; y < HIDDEN + ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const cell = game.board[y][x];
        if (!cell) continue;
        const visY = y - HIDDEN;
        const pal = skinColors(this.theme, cell.id || "viga");
        let hex = pal.color;
        let s = 1;
        if (clearing.has(y)) {
          hex = this.theme === "crt" ? "#ffe08a" : this.theme === "magma" ? "#fff1f2" : "#fff7d6";
          s = pulse;
        }
        this.setInstance(
          this.lockedMesh, n,
          colX(x), visYToWorld(visY), 0,
          s, s, s, hex,
        );
        n += 1;
        if (n >= LOCKED_CAP) break;
      }
      if (n >= LOCKED_CAP) break;
    }
    this.lockedMesh.count = n;
    this.lockedMesh.instanceMatrix.needsUpdate = true;
    if (this.lockedMesh.instanceColor) this.lockedMesh.instanceColor.needsUpdate = true;

    let an = 0;
    let gn = 0;
    let bn = 0;
    if (game.active && game.state !== "over" && game.state !== "clearing") {
      const pal = skinColors(this.theme, game.active.id);
      const gy = ghostY(game.board, game.active);
      if (gy !== game.active.y) {
        this.ghostMat.color.set(pal.color);
        this.ghostMat.opacity = this.theme === "pixel" ? 0.5 : 0.4;
        const ghost = { ...game.active, y: gy };
        for (const { x, y } of cellsOf(ghost)) {
          const visY = y - HIDDEN;
          if (visY < 0 || visY >= ROWS) continue;
          this.setInstance(this.ghostMesh, gn, colX(x), visYToWorld(visY), -0.12, 1, 1, 1, pal.color);
          gn += 1;
        }
      }
      const lockPulse = game.grounded
        ? 0.92 + 0.08 * Math.sin((performance.now() / 120) * Math.PI)
        : 1;
      for (const { x, y } of cellsOf(game.active)) {
        const visY = y - HIDDEN;
        if (visY < 0 || visY >= ROWS) continue;
        this.setInstance(
          this.activeMesh, an,
          colX(x), visYToWorld(visY), 0.04,
          lockPulse, lockPulse, lockPulse, pal.color,
        );
        an += 1;
      }
      if (game.grounded && game.lockMs > 0) {
        const ratio = Math.min(1, game.lockMs / LOCK_DELAY_MS);
        this.barMat.color.set(pal.color);
        for (const { x, y } of cellsOf(game.active)) {
          const visY = y - HIDDEN;
          if (visY < 0 || visY >= ROWS) continue;
          this.setInstance(
            this.barMesh, bn,
            colX(x), visYToWorld(visY) - 0.48, 0.5,
            ratio, 1, 1, pal.color,
          );
          bn += 1;
        }
      }
    }
    this.activeMesh.count = an;
    this.activeMesh.instanceMatrix.needsUpdate = true;
    if (this.activeMesh.instanceColor) this.activeMesh.instanceColor.needsUpdate = true;
    this.ghostMesh.count = gn;
    this.ghostMesh.instanceMatrix.needsUpdate = true;
    this.barMesh.count = bn;
    this.barMesh.instanceMatrix.needsUpdate = true;

    let danger = 0;
    for (let y = HIDDEN; y < HIDDEN + 6; y++) {
      for (let x = 0; x < COLS; x++) {
        if (game.board[y][x]) danger = Math.max(danger, (HIDDEN + 6 - y) / 6);
      }
    }
    if (this.dangerPlane) {
      const pulseD = game.state === "playing" && danger > 0.15
        ? danger * (0.08 + 0.1 * Math.sin(performance.now() / 180))
        : 0;
      this.dangerPlane.material.opacity = pulseD;
    }

    const flashA = Math.min(0.7, this.flash + this.spawnFlash * 0.18 + this.levelFlash * 0.12);
    this.flashPlane.material.opacity = flashA;
    this.flashPlane.material.color.copy(this.flashColor);
    if (this.levelFlash > 0) {
      this.flashPlane.material.color.lerp(new THREE.Color(0x7dd3fc), this.levelFlash * 0.4);
    }

    const bob = this.reducedMotion ? 0 : Math.sin(this.idleT * 0.55) * 0.12;
    this.camera.position.set(
      this.camBase.x + bob,
      this.camBase.y,
      this.camBase.z,
    );
    if (this.shake > 0 && !this.reducedMotion) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.9;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.55;
    }
    this.camera.lookAt(this.lookAt);

    this.renderer.render(this.scene, this.camera);
    this.hud.draw(game);
  }
}
