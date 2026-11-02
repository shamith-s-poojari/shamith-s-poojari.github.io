// The tools I use as a pile of glossy balls, drawn together by a soft pull and
// pushed around by the cursor. The physics is small enough to write by hand:
// a spring to the centre, sphere against sphere, and a little drag.

import * as THREE from '../vendor/three.module.min.js';
import { studioEnv } from './avatar.js';

const TOOLS = [
  ['JavaScript', '#f0db4f', '#1c1a12'], ['Solidity', '#2b2738', '#e9e4f5'], ['React', '#14111c', '#7fdbff'],
  ['Node.js', '#ece8f6', '#3c873a'], ['Java', '#ece8f6', '#c9542a'], ['Python', '#ece8f6', '#2f6ea5'],
  ['Express', '#14111c', '#f5f3fa'], ['SQL', '#a78bfa', '#14111c'], ['MySQL', '#ece8f6', '#00758f'],
  ['Postgres', '#ece8f6', '#336791'], ['C', '#c4b5fd', '#14111c'], ['Ethereum', '#ece8f6', '#5c56b8'],
  ['IPFS', '#14111c', '#65c2cb'], ['Web3.js', '#ece8f6', '#c98a20'], ['Git', '#ece8f6', '#e2492e'],
  ['HTML', '#ece8f6', '#d9502a'], ['CSS', '#ece8f6', '#2d6fc0'], ['Postman', '#ece8f6', '#e8662f'],
];

function label(name, bg, ink) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = bg;
  x.fillRect(0, 0, 1024, 512);
  x.fillStyle = ink;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  // Only the middle of each face reads flat, so fit the name inside that.
  const font = (px) => `700 ${px}px Geist, ui-sans-serif, system-ui, sans-serif`;
  x.font = font(100);
  x.font = font(Math.min(92, (100 * 250) / x.measureText(name).width));
  // Texture u = .25 lands on +z, the side facing the camera; .75 is the far side.
  x.fillText(name, 256, 256);
  x.fillText(name, 768, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function createStack(canvas, section, { reduced = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.environment = studioEnv(renderer);
  scene.environmentIntensity = 0.7;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  camera.position.z = 15;
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-4, 8, 10);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0xa78bfa, 3);
  rim.position.set(6, -3, -6);
  scene.add(rim);

  const geo = new THREE.SphereGeometry(1, 48, 32);
  const bodies = TOOLS.map(([name, bg, ink], i) => {
    const mat = new THREE.MeshPhysicalMaterial({ map: label(name, bg, ink), roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.18 });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    const a = (i / TOOLS.length) * Math.PI * 2;
    return { mesh, r: 0.62 + ((i * 7) % 5) * 0.07, p: new THREE.Vector3(Math.cos(a) * 7, 9 + i * 0.9, Math.sin(a) * 2), v: new THREE.Vector3() };
  });

  let W = 1, H = 1, scale = 1, halfW = 8;
  const resize = () => {
    W = section.clientWidth;
    H = section.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    const halfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
    halfW = halfH * camera.aspect;
    scale = clamp(halfW / 6.2, 0.5, 1);
    bodies.forEach((b) => b.mesh.scale.setScalar(b.r * scale));
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  resize();
  window.addEventListener('resize', resize);

  const cursor = new THREE.Vector3(99, 99, 0);
  let cursorOn = false;
  window.addEventListener('pointermove', (e) => {
    const box = canvas.getBoundingClientRect();
    const nx = ((e.clientX - box.left) / box.width) * 2 - 1;
    const ny = -(((e.clientY - box.top) / box.height) * 2 - 1);
    cursorOn = Math.abs(nx) < 1 && Math.abs(ny) < 1;
    const halfH = halfW / camera.aspect;
    cursor.set(nx * halfW, ny * halfH, 0);
  }, { passive: true });

  const step = (dt) => {
    for (const b of bodies) {
      // Pull toward the middle, flatter in depth so labels stay readable.
      b.v.x += -b.p.x * 3.2 * dt;
      b.v.y += -(b.p.y + 0.7) * 3.2 * dt;
      b.v.z += -b.p.z * 5 * dt;
      if (cursorOn) {
        const dx = b.p.x - cursor.x, dy = b.p.y - cursor.y;
        const d2 = dx * dx + dy * dy, R = 2.6;
        if (d2 < R * R && d2 > 1e-4) {
          const d = Math.sqrt(d2), f = (1 - d / R) * 42 * dt;
          b.v.x += (dx / d) * f;
          b.v.y += (dy / d) * f;
        }
      }
    }
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], b = bodies[j];
        const dx = b.p.x - a.p.x, dy = b.p.y - a.p.y, dz = b.p.z - a.p.z;
        const min = (a.r + b.r) * scale, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= min * min || d2 < 1e-5) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, nz = dz / d, push = (min - d) / 2;
        a.p.x -= nx * push; a.p.y -= ny * push; a.p.z -= nz * push;
        b.p.x += nx * push; b.p.y += ny * push; b.p.z += nz * push;
        const rel = (b.v.x - a.v.x) * nx + (b.v.y - a.v.y) * ny + (b.v.z - a.v.z) * nz;
        if (rel < 0) {
          const imp = rel * -0.6;
          a.v.x -= nx * imp; a.v.y -= ny * imp; a.v.z -= nz * imp;
          b.v.x += nx * imp; b.v.y += ny * imp; b.v.z += nz * imp;
        }
      }
    }
    const drag = Math.exp(-dt * 2.2);
    for (const b of bodies) {
      b.v.multiplyScalar(drag);
      b.p.addScaledVector(b.v, dt);
      b.mesh.position.copy(b.p);
      // Roll a little with the motion but always drift back to face the viewer.
      const tx = clamp(b.v.y * -0.09, -0.6, 0.6), ty = clamp(b.v.x * 0.09, -0.6, 0.6);
      b.mesh.rotation.x += (tx - b.mesh.rotation.x) * Math.min(1, dt * 5);
      b.mesh.rotation.y += (ty - b.mesh.rotation.y) * Math.min(1, dt * 5);
    }
  };

  let visible = false, last = 0, settled = false;
  const frame = (now) => {
    if (!visible) return;
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.033);
    last = now;
    step(dt / 2);
    step(dt / 2);
    renderer.render(scene, camera);
  };
  if (reduced) {
    // No falling: settle the pile out of sight, then draw it once.
    for (let i = 0; i < 900; i++) step(1 / 60);
    settled = true;
  }
  new IntersectionObserver(([e]) => {
    if (reduced) { if (e.isIntersecting && settled) renderer.render(scene, camera); return; }
    if (e.isIntersecting && !visible) {
      visible = true;
      last = performance.now();
      requestAnimationFrame(frame);
    } else if (!e.isIntersecting) visible = false;
  }, { threshold: 0.05 }).observe(section);
}
