// Me, as a small 3D character, modelled entirely in code: a big round head, an
// oversized sweater and a mug of something hot. It all lives on one fixed canvas
// behind the page. Scroll position picks a stage
// (hero, about, at the desk, contact) and the scene eases toward it, so the page
// can be scrolled, jumped or resized at any time without timelines fighting.

import * as THREE from '../vendor/three.module.min.js';

const { Vector3 } = THREE;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// A soft studio to reflect, so glossy surfaces have something to pick up.
export function studioEnv(renderer) {
  const scene = new THREE.Scene();
  const panel = (color, power, w, h, pos) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide }),
    );
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    scene.add(m);
  };
  scene.background = new THREE.Color(0x07060c);
  panel('#ffffff', 5, 8, 6, [0, 9, 6]);
  panel('#a78bfa', 9, 5, 12, [-10, 2, -3]);
  panel('#c4b5fd', 7, 5, 12, [10, 2, -3]);
  panel('#ffe2c8', 1.6, 10, 8, [-3, 1, 10]);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(scene, 0.04).texture;
  pm.dispose();
  return tex;
}

// Tapered curved tubes in one geometry.
class Strands {
  constructor() { this.pos = []; this.idx = []; }
  add(points, radius, { radial = 8, segs = 12, flat = 1, profile } = {}) {
    const curve = new THREE.CatmullRomCurve3(points);
    const frames = curve.computeFrenetFrames(segs, false);
    const base = this.pos.length / 3;
    const shape = profile || ((t) => Math.pow(Math.min(1, t * 5 + 0.25), 0.6) * Math.pow(1 - t, 0.75));
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const c = curve.getPointAt(t);
      const r = Math.max(radius * shape(t), 0.002);
      for (let j = 0; j < radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        const n = frames.normals[i], b = frames.binormals[i];
        const ca = Math.cos(a) * r, sa = Math.sin(a) * r * flat;
        this.pos.push(c.x + n.x * ca + b.x * sa, c.y + n.y * ca + b.y * sa, c.z + n.z * ca + b.z * sa);
      }
    }
    for (let i = 0; i < segs; i++) {
      for (let j = 0; j < radial; j++) {
        const a = base + i * radial + j, b = base + i * radial + (j + 1) % radial;
        const c = a + radial, d = b + radial;
        this.idx.push(a, b, c, b, d, c);
      }
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

function capsule(mat, r, len, parent) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 10, 24), mat);
  m.position.y = -len / 2;
  m.castShadow = true;
  parent.add(m);
  return m;
}

function ball(mat, r, scale, pos, parent) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 24), mat);
  m.scale.set(...scale);
  m.position.set(...pos);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function box(mat, size, pos, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  m.position.set(...pos);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// A soft pink spot, for the cheeks.
function blushTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const r = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(240,120,110,.6)');
  r.addColorStop(1, 'rgba(240,120,110,0)');
  x.fillStyle = r;
  x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function buildHead(skin) {
  const head = new THREE.Group();
  const RX = 0.97, RY = 0.9, RZ = 0.86;
  // The face narrows below the middle, down to a soft chin.
  const taper = (y) => (y < 0 ? 1 - 0.2 * (y / RY) ** 2 : 1);
  const geo = new THREE.SphereGeometry(1, 64, 48);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) * RY;
    p.setXYZ(i, p.getX(i) * RX * taper(y), y, p.getZ(i) * RZ);
  }
  geo.computeVertexNormals();
  const skull = new THREE.Mesh(geo, skin);
  skull.castShadow = true;
  head.add(skull);

  // A point on the surface of the face, lifted slightly off it.
  const on = (x, y, lift = 0) => {
    const u = x / (RX * taper(y)), v = y / RY;
    return new Vector3(x, y, RZ * Math.sqrt(Math.max(0, 1 - u * u - v * v)) + lift);
  };
  const ink = new THREE.MeshStandardMaterial({ color: 0x241a17, roughness: 0.5 });
  const lines = new Strands();
  const line = (pts, r) => lines.add(pts.map(([x, y]) => on(x, y, 0.012)), r, { radial: 6, segs: 16 });

  // Sleepy eyes: a heavy lid over a sliver of dark eye, which is what blinks.
  const eyes = [];
  for (const s of [-1, 1]) {
    line([[s * 0.3, -0.33], [s * 0.44, -0.29], [s * 0.6, -0.33]], 0.022);
    line([[s * 0.34, -0.14], [s * 0.45, -0.11], [s * 0.57, -0.15]], 0.011);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), ink);
    eye.position.copy(on(s * 0.44, -0.34, 0));
    eye.scale.set(0.105, 0.042, 0.02);
    head.add(eye);
    eyes.push(eye);
    const blush = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.36),
      new THREE.MeshBasicMaterial({ map: blushTexture(), transparent: true, depthWrite: false }),
    );
    const at = on(s * 0.56, -0.5, 0.03);
    blush.position.copy(at);
    blush.lookAt(at.clone().multiplyScalar(2));
    head.add(blush);
    const ear = ball(skin, 0.2, [0.72, 1, 0.72], [s * 0.96, -0.2, -0.02], head);
    ball(new THREE.MeshStandardMaterial({ color: 0xe8ad91, roughness: 0.7 }), 0.1, [0.55, 1, 0.5], [s * 1.06, -0.2, 0.05], head);
    ear.castShadow = true;
  }
  // The mouth, a very small frown.
  line([[-0.055, -0.61], [0, -0.585], [0.055, -0.61]], 0.012);
  head.add(new THREE.Mesh(lines.geometry(), ink));

  // Hair: a cap tipped back so it opens over the face, then chunky locks over the
  // forehead, tufts at the temples and a few spikes sticking up from the crown.
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x241b18, roughness: 0.95, envMapIntensity: 0.25 });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32, 0, Math.PI * 2, 0, Math.PI * 0.62), hairMat);
  cap.scale.set(1.1, 0.98, 1.0);
  cap.position.set(0, 0.04, -0.03);
  cap.rotation.x = -0.6;
  cap.castShadow = true;
  head.add(cap);
  const locks = new Strands();
  const lock = (pts, r) => locks.add(pts.map((q) => new Vector3(...q)), r, { radial: 12, segs: 18 });
  // The fringe sweeps across, with one long lock falling over the brow.
  lock([[-0.5, 0.74, 0.5], [-0.76, 0.42, 0.62], [-0.86, 0.1, 0.5], [-0.88, -0.2, 0.34]], 0.3);
  lock([[-0.1, 0.8, 0.56], [-0.42, 0.52, 0.74], [-0.58, 0.26, 0.76], [-0.66, 0.02, 0.62]], 0.32);
  lock([[0.22, 0.82, 0.56], [-0.04, 0.56, 0.8], [-0.22, 0.32, 0.86], [-0.38, 0.1, 0.8]], 0.3);
  lock([[0.2, 0.8, 0.58], [0.3, 0.56, 0.8], [0.44, 0.32, 0.82], [0.6, 0.03, 0.68]], 0.32);
  lock([[0.5, 0.74, 0.5], [0.7, 0.44, 0.64], [0.84, 0.14, 0.52], [0.92, -0.18, 0.34]], 0.3);
  // Over the ears.
  lock([[-0.84, 0.5, 0.1], [-1.06, 0.16, 0.08], [-1.06, -0.1, 0.1]], 0.22);
  lock([[0.84, 0.5, 0.1], [1.06, 0.16, 0.08], [1.08, -0.08, 0.1]], 0.22);
  // Spikes on the crown, and the point at the back of the side.
  lock([[-0.12, 0.96, 0.05], [-0.34, 1.13, 0.08], [-0.58, 1.14, 0.1]], 0.1);
  lock([[0.2, 0.98, 0.0], [0.28, 1.14, 0.03], [0.26, 1.34, 0.05]], 0.07);
  lock([[0.3, 0.98, 0.0], [0.46, 1.1, 0.03], [0.62, 1.15, 0.05]], 0.06);
  lock([[0.85, 0.5, -0.1], [1.05, 0.32, -0.1], [1.22, 0.16, -0.12]], 0.13);
  lock([[-0.85, 0.42, -0.1], [-1.02, 0.2, -0.12], [-1.12, 0.02, -0.14]], 0.1);
  const fringe = new THREE.Mesh(locks.geometry(), hairMat);
  fringe.castShadow = true;
  head.add(fringe);
  return { head, eyes };
}

function buildMug() {
  const mug = new THREE.Group();
  const glaze = new THREE.MeshPhysicalMaterial({ color: 0xf5cf82, roughness: 0.45, clearcoat: 0.4 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.42, 32), glaze);
  body.castShadow = true;
  mug.add(body);
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.18, 32), new THREE.MeshStandardMaterial({ color: 0x4a2c17, roughness: 0.3 }));
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = 0.212;
  mug.add(coffee);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.032, 12, 24), glaze);
  handle.position.x = 0.22;
  mug.add(handle);
  // The steam is one soft S, which wavers in pose().
  const curl = new Strands();
  curl.add([[0.02, 0.3, 0], [0.09, 0.42, 0], [-0.05, 0.56, 0], [0.05, 0.7, 0], [-0.03, 0.84, 0]].map((q) => new Vector3(...q)), 0.045, { radial: 8, segs: 28 });
  const steam = new THREE.Mesh(curl.geometry(), new THREE.MeshBasicMaterial({ color: 0xfff8ee, transparent: true, opacity: 0.92 }));
  mug.add(steam);
  return { mug, steam };
}

// Upper arm and forearm lengths, shared by the arm and the code that aims it.
const UPPER = 0.72, FORE = 0.68;

function buildCharacter() {
  const skin = new THREE.MeshPhysicalMaterial({ color: 0xffd9c2, roughness: 0.6, sheen: 0.5, sheenColor: new THREE.Color(0xf29c80), sheenRoughness: 0.6, emissive: 0x70463a, emissiveIntensity: 0.55 });
  const knit = new THREE.MeshPhysicalMaterial({ color: 0x1c1b20, roughness: 0.92, sheen: 0.7, sheenColor: new THREE.Color(0x615c70), sheenRoughness: 0.75, side: THREE.DoubleSide });
  const rib = new THREE.MeshStandardMaterial({ color: 0x141317, roughness: 0.95 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0xd9a03c, roughness: 0.88 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf6f1e8, roughness: 0.6 });

  const root = new THREE.Group();
  const spine = new THREE.Group();
  root.add(spine);

  // The sweater: a wide, soft lathe, flattened front to back.
  const profile = [[0, -0.08], [0.72, -0.08], [0.86, 0.04], [0.93, 0.5], [0.9, 1.05], [0.76, 1.55], [0.46, 1.92], [0.2, 2.03], [0, 2.04]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const torsoCurve = new THREE.SplineCurve(profile);
  const torso = new THREE.Mesh(new THREE.LatheGeometry(torsoCurve.getPoints(48), 48), knit);
  torso.scale.z = 0.78;
  torso.castShadow = true;
  spine.add(torso);
  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.075, 12, 48), rib);
  hem.rotation.x = Math.PI / 2;
  hem.scale.y = 0.78;
  spine.add(hem);

  const hips = ball(cloth, 0.72, [1, 0.5, 0.72], [0, -0.04, 0], root);
  hips.castShadow = true;

  // Neck and collar, with the head above them on its own pivot.
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.2, 20), skin);
  neck.position.y = 2.1;
  spine.add(neck);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.05, 10, 32), white);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 2.03;
  spine.add(collar);
  const { head, eyes } = buildHead(skin);
  const headPivot = new THREE.Group();
  headPivot.position.y = 2.12;
  head.position.y = 0.78;
  headPivot.add(head);
  spine.add(headPivot);

  // Baggy sleeves, posed by reach(). The hand pokes out of the far end.
  const makeArm = (s) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.68, 1.52, 0);
    spine.add(shoulder);
    ball(knit, 0.3, [1, 1, 1], [0, 0, 0], shoulder);
    capsule(knit, 0.29, UPPER, shoulder);
    const elbow = new THREE.Group();
    elbow.position.y = -UPPER;
    shoulder.add(elbow);
    capsule(knit, 0.27, FORE - 0.1, elbow);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.1, 24), rib);
    cuff.position.y = -FORE + 0.02;
    elbow.add(cuff);
    const hand = ball(skin, 0.14, [0.95, 1.05, 0.9], [0, -FORE - 0.07, 0], elbow);
    return { shoulder, elbow, hand, s };
  };
  const arms = [makeArm(-1), makeArm(1)];

  const { mug, steam } = buildMug();
  mug.position.set(-0.05, 1.12, 1.0);
  spine.add(mug);

  // Wide straight trousers, then bare ankles and small white slip-ons.
  const makeLeg = (s) => {
    const hip = new THREE.Group();
    hip.position.set(s * 0.36, -0.06, 0);
    root.add(hip);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.86, 28), cloth);
    thigh.position.y = -0.4;
    thigh.castShadow = true;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.8;
    hip.add(knee);
    ball(cloth, 0.38, [1, 0.5, 1], [0, 0, 0], knee);
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.76, 28), cloth);
    shin.position.y = -0.38;
    shin.castShadow = true;
    knee.add(shin);
    const ankle = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.26, 16), skin);
    ankle.position.y = -0.84;
    knee.add(ankle);
    const foot = ball(white, 0.2, [0.75, 0.42, 1.35], [0, -0.93, 0.08], knee);
    return { hip, knee, foot, s };
  };
  const legs = [makeLeg(-1), makeLeg(1)];

  return { root, spine, headPivot, eyes, arms, legs, mug, steam };
}

// Aims an arm so the hand lands on a point in the spine's space, with the elbow
// bending toward `pole`.
const DOWN = new Vector3(0, -1, 0);
const tmpD = new Vector3(), tmpE = new Vector3(), tmpP = new Vector3(), tmpQ = new THREE.Quaternion();
function reach(arm, target, pole) {
  const S = arm.shoulder.position;
  tmpD.copy(target).sub(S);
  const d = clamp(tmpD.length(), 0.2, UPPER + FORE - 0.001);
  tmpD.normalize();
  const along = (UPPER * UPPER - FORE * FORE + d * d) / (2 * d);
  const out = Math.sqrt(Math.max(0, UPPER * UPPER - along * along));
  tmpP.copy(pole).addScaledVector(tmpD, -pole.dot(tmpD)).normalize();
  tmpE.copy(tmpD).multiplyScalar(along).addScaledVector(tmpP, out);
  const upper = tmpE.clone().normalize();
  arm.shoulder.quaternion.setFromUnitVectors(DOWN, upper);
  const fore = tmpD.multiplyScalar(d).sub(tmpE).normalize();
  tmpQ.copy(arm.shoulder.quaternion).invert();
  arm.elbow.quaternion.setFromUnitVectors(DOWN, fore.applyQuaternion(tmpQ));
}

function buildFurniture() {
  const g = new THREE.Group();
  const top = new THREE.MeshPhysicalMaterial({ color: 0xece8f6, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.3 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x1a1722, roughness: 0.4, metalness: 0.7 });
  const accent = new THREE.MeshPhysicalMaterial({ color: 0xa78bfa, roughness: 0.3, clearcoat: 1 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xd9ccff });

  const parts = [];
  const add = (m) => { parts.push(m); return m; };
  const desk = add(new THREE.Group());
  desk.position.set(0, 0, 2.05);
  box(top, [4.2, 0.09, 2.3], [0, 1.82, 0], desk);
  for (const x of [-1.95, 1.95]) for (const z of [-1, 1]) box(steel, [0.07, 1.8, 0.07], [x, 0.9, z], desk);
  box(steel, [3.9, 0.05, 0.05], [0, 1.2, 0.98], desk);

  const monitor = add(new THREE.Group());
  monitor.position.set(0, 1.86, 2.75);
  box(accent, [2.8, 1.62, 0.1], [0, 1.1, 0], monitor);
  box(new THREE.MeshBasicMaterial({ color: 0x0b0a10 }), [2.68, 1.5, 0.02], [0, 1.1, -0.06], monitor).castShadow = false;
  box(steel, [0.16, 0.5, 0.1], [0, 0.22, 0.03], monitor);
  box(steel, [0.9, 0.04, 0.55], [0, 0.02, 0], monitor);
  // A lit bar on the back of the screen, facing the camera.
  box(glow, [0.9, 0.04, 0.01], [0, 1.55, 0.056], monitor).castShadow = false;

  const kb = add(new THREE.Group());
  kb.position.set(0, 1.87, 1.28);
  box(new THREE.MeshPhysicalMaterial({ color: 0x2b2738, roughness: 0.5 }), [1.5, 0.05, 0.5], [0, 0, 0], kb);
  const keyMat = new THREE.MeshStandardMaterial({ color: 0xc4b5fd, roughness: 0.5 });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 11; c++) {
    const k = box(keyMat, [0.1, 0.022, 0.1], [-0.65 + c * 0.13, 0.034, -0.14 + r * 0.14], kb);
    k.castShadow = false;
  }

  const mug = add(new THREE.Group());
  mug.position.set(1.45, 1.87, 1.5);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.3, 24), accent);
  cup.position.y = 0.15;
  cup.castShadow = true;
  mug.add(cup);

  const chair = add(new THREE.Group());
  const pad = new THREE.MeshPhysicalMaterial({ color: 0x8a6ef0, roughness: 0.55, clearcoat: 0.2 });
  const seat = ball(pad, 0.78, [1, 0.14, 0.92], [0, 0.66, 0.08], chair);
  seat.castShadow = true;
  const backrest = ball(pad, 0.76, [1, 1.05, 0.13], [0, 1.82, -0.74], chair);
  backrest.rotation.x = -0.1;
  box(steel, [0.09, 0.8, 0.09], [0, 1, -0.7], chair);
  box(steel, [0.1, 0.5, 0.1], [0, 0.32, 0], chair);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spoke = box(steel, [0.07, 0.05, 0.62], [Math.sin(a) * 0.3, 0.09, Math.cos(a) * 0.3], chair);
    spoke.rotation.y = a;
  }
  parts.forEach((p) => g.add(p));
  return { group: g, parts };
}

// A puddle of light under whatever stands on it.
function floorGlow() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const r = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  r.addColorStop(0, 'rgba(167,139,250,.55)');
  r.addColorStop(0.5, 'rgba(120,90,220,.16)');
  r.addColorStop(1, 'rgba(120,90,220,0)');
  x.fillStyle = r;
  x.fillRect(0, 0, 256, 256);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(13, 13),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.002;
  return m;
}

export function createAvatar(canvas, { reduced = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.environment = studioEnv(renderer);
  scene.environmentIntensity = 0.5;

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 80);

  const key = new THREE.DirectionalLight(0xfff0e4, 1.5);
  key.position.set(-3.5, 9, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(1536, 1536);
  Object.assign(key.shadow.camera, { left: -7, right: 7, top: 9, bottom: -3, near: 1, far: 30 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  scene.add(key);
  const rimL = new THREE.DirectionalLight(0xa78bfa, 3);
  rimL.position.set(-8, 5, -7);
  scene.add(rimL);
  const rimR = new THREE.DirectionalLight(0xc4b5fd, 2.5);
  rimR.position.set(8, 6, -6);
  scene.add(rimR);
  // Follows the cursor, so moving the mouse moves the light across the face.
  const cursorLight = new THREE.PointLight(0xc4b5fd, 10, 12, 1.6);
  scene.add(cursorLight);

  const stage = new THREE.Group();
  scene.add(stage);
  const c = buildCharacter();
  stage.add(c.root);
  const furn = buildFurniture();
  stage.add(furn.group);
  const screenGlow = new THREE.PointLight(0xc4b5fd, 0, 7, 1.5);
  screenGlow.position.set(0, 3, 2.3);
  stage.add(screenGlow);
  const floor = floorGlow();
  stage.add(floor);

  // Stages. Anchors are scroll positions, refreshed by measure().
  let W = 1, H = 1, anchors = [], stages = [];
  const buildStages = () => {
    const aspect = W / H, narrow = W < 820;
    const wide = clamp(aspect / 1.6, 0.6, 1.5);
    const hero = narrow
      ? { x: 0, y: 4.8, dist: 20, rot: 0, seat: 0, furn: 0, alpha: 1 }
      : { x: 0, y: 3.05, dist: 14.5, rot: 0, seat: 0, furn: 0, alpha: 1 };
    const about = narrow
      ? { x: 0, y: 3.2, dist: 13, rot: 0.15, seat: 0, furn: 0, alpha: 0.3 }
      : { x: 2.4 * wide, y: 3.1, dist: 15, rot: 0.2, seat: 0, furn: 0, alpha: 1 };
    const desk = narrow
      ? { x: 1.1, y: 0.4, dist: 21, rot: 1, seat: 1, furn: 1, alpha: 0 }
      : { x: 1.7 * aspect, y: 2.7, dist: 18, rot: 1.02, seat: 1, furn: 1, alpha: 1 };
    const gone = { ...desk, y: desk.y - 2.4, alpha: 0 };
    const contact = narrow
      ? { x: 0, y: 5.2, dist: 20, rot: 0, seat: 0, furn: 0, alpha: 0.9 }
      : { x: 2.4 * wide, y: 3.1, dist: 15, rot: 0.2, seat: 0, furn: 0, alpha: 1 };
    const back = { ...contact, y: contact.y + 2.2, alpha: 0 };
    stages = [hero, hero, about, about, desk, desk, gone, back, contact];
  };

  const top = (el) => el.getBoundingClientRect().top + window.scrollY;
  const measure = () => {
    const a = document.getElementById('about');
    const d = document.getElementById('whatido');
    const k = document.getElementById('career');
    const t = document.getElementById('contact');
    const end = document.documentElement.scrollHeight - H;
    const dBottom = top(d) + d.offsetHeight - H;
    anchors = [
      0,
      H * 0.08,
      top(a) - H * 0.12,
      top(a) + a.offsetHeight - H * 0.82,
      top(d) - H * 0.02,
      Math.max(dBottom, top(d)),
      top(k) - H * 0.25,
      Math.max(top(t) - H * 0.8, top(k)),
      Math.min(end, top(t)),
    ];
    for (let i = 1; i < anchors.length; i++) anchors[i] = Math.max(anchors[i], anchors[i - 1] + 1);
  };

  const resize = () => {
    W = window.innerWidth;
    H = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, W < 820 ? 1.5 : 1.75));
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    buildStages();
    measure();
  };
  resize();
  window.addEventListener('resize', resize);

  const target = () => {
    const y = window.scrollY;
    let i = 0;
    while (i < anchors.length - 2 && y > anchors[i + 1]) i++;
    const t = smooth(anchors[i], anchors[i + 1], y);
    const a = stages[i], b = stages[i + 1];
    const out = {};
    for (const k in a) out[k] = lerp(a[k], b[k], t);
    return out;
  };

  const s = target();
  const tmpA = new Vector3(), tmpB = new Vector3(), tmpC = new Vector3(), tmpPole = new Vector3();
  const mouse = { x: 0, y: 0 }, look = { x: 0, y: 0 };
  if (!reduced) {
    window.addEventListener('pointermove', (e) => {
      mouse.x = (e.clientX / W) * 2 - 1;
      mouse.y = -((e.clientY / H) * 2 - 1);
    }, { passive: true });
  }

  let intro = reduced ? 1 : 0, introTarget = reduced ? 1 : 0;
  let blink = 0, nextBlink = 2, time = 0, last = performance.now();
  // Eases a stage change in the scene; the cursor glance on top of it is livelier.
  const pose = (dt) => {
    const seat = smooth(0, 1, s.seat);
    const tp = Math.sin(time * 15), tq = Math.sin(time * 19 + 1.4);
    const breath = reduced ? 0 : Math.sin(time * 1.5);

    c.root.position.y = lerp(1.86, 1.08, seat) - (1 - intro) * 4.2;
    c.spine.rotation.x = seat * 0.07 + breath * 0.006;
    c.spine.scale.setScalar(1 + breath * 0.004);

    const yaw = look.x * 0.28;
    const pitch = -look.y * 0.1 + 0.03 + seat * 0.08 + (1 - intro) * 0.4;
    c.headPivot.rotation.set(pitch, yaw, -yaw * 0.12);
    c.spine.rotation.y = yaw * 0.16;
    const open = 1 - Math.max(1 - clamp(intro * 1.6 - 0.6), blink);
    for (const e of c.eyes) e.scale.y = 0.042 * Math.max(open, 0.06);

    // One hand holds the mug to the chest and the other is sunk in the sweater,
    // until the desk, where both go to the keyboard.
    for (const a of c.arms) {
      const typing = (a.s < 0 ? tp : tq) * 0.03 * (reduced ? 0 : 1);
      const idle = a.s < 0
        ? tmpA.set(-0.33, 1.1 + breath * 0.01, 0.98)
        : tmpA.set(0.92, 0.42 + breath * 0.008, 0.42);
      tmpB.set(a.s * 0.36, 0.86 + typing, 1.18);
      reach(a, tmpC.lerpVectors(idle, tmpB, seat), tmpPole.set(a.s, -0.7, -0.25));
      a.hand.visible = a.s < 0 || seat > 0.3;
    }
    const held = clamp(1 - seat * 2.5);
    c.mug.visible = held > 0.01;
    c.mug.scale.setScalar(Math.max(held, 0.001));
    c.steam.rotation.y = time * 0.6;
    c.steam.scale.x = 1 + Math.sin(time * 1.7) * 0.18;
    c.steam.material.opacity = 0.72 + Math.sin(time * 1.1) * 0.2;
    for (const l of c.legs) {
      l.hip.rotation.x = -1.54 * seat;
      l.hip.rotation.z = lerp(l.s * 0.015, l.s * 0.06, seat);
      l.knee.rotation.x = lerp(0, 1.5, seat);
    }

    furn.parts.forEach((p, i) => {
      const f = smooth(i * 0.1, 0.6 + i * 0.08, s.furn);
      p.scale.setScalar(Math.max(f, 0.0001));
      p.visible = f > 0.002;
    });
    screenGlow.intensity = s.furn * 16;
    floor.material.opacity = smooth(0.3, 1, s.seat);
    if (blink > 0) blink = Math.max(0, blink - dt * 7);
  };

  const render = (now) => {
    requestAnimationFrame(render);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (!reduced) time += dt;
    const k = reduced ? 1 : 1 - Math.exp(-dt * 5.5);
    const t = target();
    for (const n in t) s[n] = lerp(s[n], t[n], k);
    canvas.style.opacity = s.alpha.toFixed(3);
    if (s.alpha < 0.01) return;

    intro = lerp(intro, introTarget, reduced ? 1 : 1 - Math.exp(-dt * 2.4));
    const glance = reduced ? 0 : 1 - Math.exp(-dt * 7);
    const drift = reduced ? 0 : Math.sin(time * 0.5) * 0.05;
    look.x = lerp(look.x, mouse.x + drift, glance);
    look.y = lerp(look.y, mouse.y + Math.cos(time * 0.37) * (reduced ? 0 : 0.04), glance);
    if (!reduced && time > nextBlink) { blink = 1; nextBlink = time + 1.8 + Math.random() * 3.6; }

    pose(dt);
    stage.rotation.y = s.rot;
    camera.position.set(s.x + look.x * 0.12, s.y + 0.22 + look.y * 0.08, s.dist);
    camera.lookAt(s.x, s.y, 0);
    cursorLight.position.set(s.x + look.x * 5, s.y + look.y * 3, 5.5);
    renderer.render(scene, camera);
  };
  requestAnimationFrame(render);

  return { measure, play() { introTarget = 1; } };
}
