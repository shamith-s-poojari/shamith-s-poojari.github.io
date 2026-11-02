// Bakes the two images the 3D head is made from, out of my portrait:
//   img/shamith.webp  the photo, cut out of its background
//   img/depth.png     how far each pixel stands forward, sculpted by hand from
//                     landmarks on the face (coordinates are in a 1932px frame)
// Colour comes from the clean orange original; the mask from the purple version,
// because purple is far easier to key away from skin and hair.
// Needs sharp:  npm i sharp, then
//   node tools/bake-portrait.mjs <orange.jpg> <purple.jpg> img
import sharp from 'sharp';

const [orangeP, purpleP, outDir] = process.argv.slice(2);
const N = 1024, DEPTH = 512, K = N / 1932;
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const gauss = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));

// Line the two versions up by luminance over the face; they are almost the same frame.
async function align() {
  const G = 256, big = 512;
  const a = await sharp(orangeP).resize(G, G, { fit: 'fill' }).greyscale().raw().toBuffer();
  const b = await sharp(purpleP).resize(big, big, { fit: 'fill' }).greyscale().raw().toBuffer();
  let best = { err: 1e18 };
  for (let s = 0.94; s <= 1.0601; s += 0.004) {
    for (let dx = -14; dx <= 14; dx++) for (let dy = -22; dy <= 22; dy++) {
      let err = 0, n = 0;
      for (let y = 60; y < 200; y += 3) for (let x = 70; x < 190; x += 3) {
        const u = ((x * s + dx) * 2) | 0, v = ((y * s + dy) * 2) | 0;
        if (u < 0 || v < 0 || u >= big || v >= big) continue;
        err += Math.abs(a[y * G + x] - b[v * big + u]); n++;
      }
      err /= n;
      if (err < best.err) best = { err, s, dx: dx / G, dy: dy / G };
    }
  }
  return best;
}

const blurMask = (arr, w, sigma) => sharp(Buffer.from(arr), { raw: { width: w, height: w, channels: 1 } }).blur(sigma).extractChannel(0).raw().toBuffer();

const inPoly = (x, y, p) => {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if ((p[i][1] > y) !== (p[j][1] > y) && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
  }
  return c;
};

const al = await align();
console.log('alignment', al);
// A point (u,v) in orange sits at (u*s+dx, v*s+dy) in purple; sample the inverse.
const O = N * 2;
const orangeBig = await sharp(orangeP).resize(O, O, { fit: 'fill', kernel: 'lanczos3' }).removeAlpha().raw().toBuffer();
const sampleOrange = (u, v) => {
  const X = Math.min(O - 1, Math.max(0, (((u - al.dx) / al.s) * O) | 0));
  const Y = Math.min(O - 1, Math.max(0, (((v - al.dy) / al.s) * O) | 0));
  const i = (Y * O + X) * 3;
  return [orangeBig[i], orangeBig[i + 1], orangeBig[i + 2]];
};
const purple = await sharp(purpleP).resize(N, N, { fit: 'fill' }).removeAlpha().raw().toBuffer();

// Background: bluish pixels connected to the border.
const isBg = new Uint8Array(N * N);
for (let i = 0; i < N * N; i++) {
  const r = purple[i * 3], g = purple[i * 3 + 1], b = purple[i * 3 + 2];
  isBg[i] = b > r * 1.12 && b > g * 1.35 ? 1 : 0;
}
const seen = new Uint8Array(N * N);
const stack = [];
for (let i = 0; i < N; i++) stack.push(i, (N - 1) * N + i, i * N, i * N + N - 1);
while (stack.length) {
  const p = stack.pop();
  if (seen[p] || !isBg[p]) continue;
  seen[p] = 1;
  const x = p % N, y = (p / N) | 0;
  if (x > 0) stack.push(p - 1);
  if (x < N - 1) stack.push(p + 1);
  if (y > 0) stack.push(p - N);
  if (y < N - 1) stack.push(p + N);
}
// Head and neck are always foreground: the recolour keyed away lit skin at the jaw.
const SOLID = [[445, 880], [640, 620], [1380, 640], [1398, 1000], [1345, 1250], [1262, 1440], [1290, 1640], [600, 1660], [652, 1420], [640, 1240], [490, 1130]];
const fg = new Uint8Array(N * N);
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const i = y * N + x;
  fg[i] = !seen[i] || inPoly(x / K, y / K, SOLID) ? 255 : 0;
}
// Close specks, then pull the edge in a little to lose the coloured fringe.
// Keep only the figure itself, not stray flecks that survived the key.
{
  const label = new Uint8Array(N * N), from = N * Math.floor(N * 0.45) + Math.floor(N * 0.5), todo = [from];
  while (todo.length) {
    const p = todo.pop();
    if (label[p] || !fg[p]) continue;
    label[p] = 1;
    const x = p % N, y = (p / N) | 0;
    if (x > 0) todo.push(p - 1);
    if (x < N - 1) todo.push(p + 1);
    if (y > 0) todo.push(p - N);
    if (y < N - 1) todo.push(p + N);
  }
  for (let i = 0; i < N * N; i++) if (!label[i]) fg[i] = 0;
}
const closed = await blurMask(fg, N, 2.2);
const m1 = new Uint8Array(N * N);
for (let i = 0; i < N * N; i++) m1[i] = closed[i] > 150 ? 255 : 0;
const soft = await blurMask(m1, N, 1.1);

// Colour: the clean photo, edges darkened so no orange glow rims the cut-out.
const edge = await blurMask(m1, N, 7);
const rgba = Buffer.alloc(N * N * 4);
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const i = y * N + x;
  let [r, g, b] = sampleOrange((x + 0.5) / N, (y + 0.5) / N);
  const inner = smooth(0.55, 0.98, edge[i] / 255);
  const px = x / K, py = y / K;
  // Hair and jacket can go dark at the rim; lit skin keeps its warmth.
  const keep = inPoly(px, py, SOLID) && py > 620 ? 0.72 : 0.22;
  const f = keep + (1 - keep) * inner;
  // Orange spill from the old backdrop, turned down.
  const spill = Math.max(0, r - Math.max(g, b) * 1.75) / 255;
  rgba[i * 4] = r * f * (1 - spill * 0.42);
  rgba[i * 4 + 1] = g * f;
  rgba[i * 4 + 2] = (b + spill * 40) * f;
  rgba[i * 4 + 3] = soft[i];
}
await sharp(rgba, { raw: { width: N, height: N, channels: 4 } }).sharpen({ sigma: 0.8 }).webp({ quality: 90, alphaQuality: 95 }).toFile(`${outDir}/shamith.webp`);

// Depth, in world units where the portrait is 3.15 wide.
const D = DEPTH, DK = D / 1932;
const mDepth = await sharp(Buffer.from(m1), { raw: { width: N, height: N, channels: 1 } }).resize(D, D).extractChannel(0).raw().toBuffer();
const puff = await blurMask(mDepth, D, 11);
const grey = await sharp(rgba, { raw: { width: N, height: N, channels: 4 } }).removeAlpha().resize(D, D).greyscale().blur(1.5).raw().toBuffer();
const smax = (a, b, k) => { const h = Math.min(1, Math.max(0, 0.5 + (0.5 * (a - b)) / k)); return b + (a - b) * h + k * h * (1 - h); };
const line = (x, y, ax, ay, bx, by) => {
  const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
  return [ax + (bx - ax) * t, ay + (by - ay) * t, t];
};
const zs = new Float32Array(D * D);
for (let j = 0; j < D; j++) for (let i = 0; i < D; i++) {
  const x = i / DK, y = j / DK;
  // Skull and face as one ellipsoid, narrowing to the jaw.
  const hx = (x - 930) / (y > 1000 ? 545 - (y - 1000) * 0.12 : 545), hy = (y - 800) / (y > 800 ? 700 : 735);
  const hr = hx * hx + hy * hy;
  let head = hr < 1 ? 0.92 * Math.sqrt(1 - hr) : 0;
  // Three-quarter view: the face plane comes forward on the right of the frame.
  head += 0.1 * gauss(x, y, 1140, 1000, 300, 420);
  // Nose, bridge to tip.
  const [nx, ny, nt] = line(x, y, 1105, 800, 1190, 1040);
  head += (0.04 + 0.13 * nt * nt) * gauss(x, y, nx, ny, 62 + nt * 26, 62 + nt * 18);
  head += 0.03 * gauss(x, y, 1100, 1060, 42, 32) + 0.03 * gauss(x, y, 1275, 1050, 28, 30);
  // Brows, sockets, cheek, lips, chin.
  head += 0.055 * gauss(x, y, 930, 700, 165, 42) + 0.05 * gauss(x, y, 1310, 695, 95, 38);
  head -= 0.085 * gauss(x, y, 960, 835, 125, 62) + 0.075 * gauss(x, y, 1295, 835, 85, 60);
  head += 0.03 * gauss(x, y, 960, 1050, 180, 130);
  head += 0.05 * gauss(x, y, 1165, 1225, 150, 62) - 0.025 * gauss(x, y, 1160, 1290, 120, 18);
  head += 0.05 * gauss(x, y, 1140, 1410, 130, 62);
  // Ear sits back from the side of the head.
  head -= 0.16 * gauss(x, y, 480, 1000, 70, 170);
  // Hair has its own volume, with lumps following the light in the photo.
  const hair = smooth(720, 400, y);
  head += hair * (0.12 + (grey[j * D + i] / 255) * 0.16);
  // Neck, then jacket shoulders with the collar standing off them.
  const nX = (x - 890) / 390;
  const neck = y > 1150 && Math.abs(nX) < 1 ? 0.55 * Math.sqrt(1 - nX * nX) : 0;
  const tX = (x - 950) / 1500, tY = (y - 2500) / 1050;
  const tr = tX * tX + tY * tY;
  let torso = tr < 1 ? 0.75 * Math.sqrt(1 - tr) : 0;
  torso += 0.1 * smooth(1430, 1560, y) * smooth(1800, 1700, y) * gauss(x, y, 930, 1650, 480, 260);
  let z = smax(smax(head, neck, 0.08), torso, 0.1);
  // Everything rounds away at the silhouette, so the edge has no paper-thin lip.
  z *= Math.pow(Math.min(1, Math.max(0, (puff[j * D + i] / 255 - 0.42) / 0.58)), 0.55);
  zs[j * D + i] = z;
}
const enc = Buffer.alloc(D * D);
for (let i = 0; i < D * D; i++) enc[i] = Math.min(255, Math.max(0, (zs[i] / 1.4) * 255));
await sharp(enc, { raw: { width: D, height: D, channels: 1 } }).blur(1.6).png().toFile(`${outDir}/depth.png`);
console.log('baked');
