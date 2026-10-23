// Layout of the bench model and the parts that change every frame. It runs in Node (for the build and
// for checks) and in the page, so it only uses the kit functions it is handed in K.

import * as M from "./model.mjs";

export const Z0 = 24; // top of the case floor
const RAMP = 33; // ramp plate surface at the hub
const TRAVEL = M.GAP1[0] - M.GAP1[1]; // drive face travel, mm
const DRIVE_BACK = RAMP + 2 * M.ROLLER.r; // back of the movable drive face at rest
const DRIVE_CONE = (M.DRIVE.R - M.DRIVE.hub) * M.FLANK;
const DRIVE_FIXED = DRIVE_BACK + 3 + DRIVE_CONE + M.GAP1[0]; // hub face of the fixed drive face
const BELT_Z_REST = (DRIVE_BACK + 3 + DRIVE_CONE + DRIVE_FIXED) / 2; // belt centre at rest
const DRIVEN_CONE = (M.DRIVEN.R - M.DRIVEN.hub) * M.FLANK;
// the driven fixed face sits on a boss so that the belt runs level at rest
const DRIVEN_BASE = BELT_Z_REST - M.GAP2[0] / 2 - 3 - DRIVEN_CONE; // back of the fixed driven face
const fixedHub2 = DRIVEN_BASE + 3 + DRIVEN_CONE;
const COLLAR_H = 12;
const SPRING_FREE = 30;
const movableHub2 = (gap2) => fixedHub2 + gap2;
const collarTop = (gap2) => movableHub2(gap2) + DRIVEN_CONE + 3 + COLLAR_H;
const CARRIER = collarTop(M.GAP2[1]) + 12; // carrier plate bottom: the spring is 12 long when the face is fully open
const SHOE = { in: 36, out: 50, h: 16, z: CARRIER + 4, arc: 0.78 };
const BELL = { in: M.SHOE_GAP + SHOE.out, out: M.SHOE_GAP + SHOE.out + 4, z0: CARRIER + 1, top: CARRIER + 4 + SHOE.h + 2, t: 3 };

export const L = {
  Z0, RAMP, TRAVEL, DRIVE_BACK, DRIVE_CONE, DRIVE_FIXED, DRIVEN_CONE, DRIVEN_BASE, COLLAR_H, CARRIER, SHOE, BELL,
  A: [0, 0], B: [M.C, 0],
  SLIDER: { y: 136, from: 34, to: 236 },
  TACHO: { at: [-40, -136], r: 30, z: 112 },
  SPEEDO: { at: [70, -136], r: 30, z: 112 },
};

export function poseOf(st) {
  const lift = TRAVEL * st.shift;
  const g2 = st.gap2;
  const back = DRIVE_BACK + lift;
  const beltZ = ((back + 3 + DRIVE_CONE) + DRIVE_FIXED) / 2;
  const beltZ2 = (fixedHub2 + movableHub2(g2)) / 2;
  return {
    lift,
    driveBack: back,
    rollerZ: RAMP + M.ROLLER.r + lift,
    drivenLift: g2 - M.GAP2[0],
    beltZ: (beltZ + beltZ2) / 2,
    springFrom: collarTop(g2),
    springTo: CARRIER,
  };
}

const TAU = Math.PI * 2;
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const scale = (a, s) => [a[0] * s, a[1] * s];
const polar = (c, r, t) => [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)];

// The belt's pitch line as one loop, from the top of the drive pulley around its back, along the lower run,
// around the driven pulley and back along the upper run. Each point carries its outward normal and its
// distance along the belt.
export function beltLoop(r1, r2, step = 3) {
  const A = L.A, B = L.B, c = M.C;
  const phi = Math.asin((r2 - r1) / c);
  const tu = Math.PI / 2 + phi;
  const pts = [];
  let s = 0;
  const push = (p, n) => { if (pts.length) { const q = pts[pts.length - 1].p; s += Math.hypot(p[0] - q[0], p[1] - q[1]); } pts.push({ p, n, s }); };
  const arc = (centre, r, a0, a1) => {
    const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * r) / step));
    for (let i = 0; i <= n; i++) { const t = a0 + ((a1 - a0) * i) / n; push(polar(centre, r, t), [Math.cos(t), Math.sin(t)]); }
  };
  const line = (p, q, n) => {
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const k = Math.ceil(len / (step * 3));
    for (let i = 1; i < k; i++) push(add(p, scale([q[0] - p[0], q[1] - p[1]], i / k)), n);
  };
  arc(A, r1, tu, TAU - tu);
  const lowN = [Math.cos(-tu), Math.sin(-tu)];
  line(polar(A, r1, -tu), polar(B, r2, -tu), lowN);
  arc(B, r2, -tu, tu);
  const upN = [Math.cos(tu), Math.sin(tu)];
  line(polar(B, r2, tu), polar(A, r1, tu), upN);
  const total = s + Math.hypot(pts[0].p[0] - pts[pts.length - 1].p[0], pts[0].p[1] - pts[pts.length - 1].p[1]);
  return { pts, total, tu };
}

// Cuts the loop where the pitch line leaves each sheave: the parts inside run between that pulley's faces.
export function beltPieces(r1, r2, view = Math.PI / 4) {
  const { pts, total } = beltLoop(r1, r2);
  const inside = (p, centre, R) => Math.hypot(p[0] - centre[0], p[1] - centre[1]) < R;
  const V = [Math.cos(view), Math.sin(view)];
  const near = (p, c) => (p[0] - c[0]) * V[0] + (p[1] - c[1]) * V[1] > 0;
  const tag = pts.map(({ p }) => (inside(p, L.A, M.DRIVE.R - 1) ? (near(p, L.A) ? "drive-f" : "drive-b") : inside(p, L.B, M.DRIVEN.R - 1) ? (near(p, L.B) ? "driven-f" : "driven-b") : p[1] < 0 ? "back" : "front"));
  const pieces = { "drive-b": [], "drive-f": [], "driven-b": [], "driven-f": [], back: [], front: [] };
  const n = pts.length;
  let start = tag.findIndex((t, i) => t !== tag[(i + n - 1) % n]);
  for (let k = 0; k < n; ) {
    const i0 = (start + k) % n;
    const kind = tag[i0];
    const run = [pts[(i0 + n - 1) % n]];
    while (k < n && tag[(start + k) % n] === kind) { run.push(pts[(start + k) % n]); k++; }
    run.push(pts[(start + k) % n]);
    pieces[kind].push(run);
  }
  return { pieces, total };
}

function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (const q of p.reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// A band of material between two floor polylines (outer and inner, same length), from z up h:
// a belt run, a curved shoe, a wall. Paints its far inner faces, its end caps, its near outer faces and its top.
export function bandSvg(K, P, outer, inner, z, h, { tone = "hi", lit = false, caps = true, closed = false, inner: extra = "" } = {}) {
  const { sinA, cosA } = K.cameraOf(P);
  const V = [cosA, sinA];
  const Lgt = [-sinA, cosA];
  const n = outer.length;
  const faces = [[], [], [], []];
  const edges = [];
  const silhouette = [];
  const face = (a, b, normal) => {
    const f = normal[0] * V[0] + normal[1] * V[1];
    if (f <= 1e-9) return false;
    const lit = (normal[0] * Lgt[0] + normal[1] * Lgt[1] + 1) / 2;
    const shade = Math.min(3, Math.max(0, Math.floor(lit * 4)));
    faces[shade].push(K.pathOf([K.iso([a[0], a[1], z + h], P), K.iso([b[0], b[1], z + h], P), K.iso([b[0], b[1], z], P), K.iso([a[0], a[1], z], P)], true));
    edges.push(K.pathOf([K.iso([a[0], a[1], z], P), K.iso([b[0], b[1], z], P)]));
    return true;
  };
  // inner faces look toward the band's middle line; outer faces look away from it
  const innerFaces = () => {
    const seg = closed ? n : n - 1;
    let prev = null;
    for (let i = 0; i < seg; i++) {
      const a = inner[i], b = inner[(i + 1) % n];
      const o = [(outer[i][0] + outer[(i + 1) % n][0]) / 2 - (a[0] + b[0]) / 2, (outer[i][1] + outer[(i + 1) % n][1]) / 2 - (a[1] + b[1]) / 2];
      const len = Math.hypot(o[0], o[1]) || 1;
      const vis = face(a, b, [-o[0] / len, -o[1] / len]);
      if (prev !== null && vis !== prev) silhouette.push(K.pathOf([K.iso([a[0], a[1], z + h], P), K.iso([a[0], a[1], z], P)]));
      prev = vis;
    }
  };
  const outerFaces = () => {
    const seg = closed ? n : n - 1;
    let prev = null;
    for (let i = 0; i < seg; i++) {
      const a = outer[i], b = outer[(i + 1) % n];
      const o = [(a[0] + b[0]) / 2 - (inner[i][0] + inner[(i + 1) % n][0]) / 2, (a[1] + b[1]) / 2 - (inner[i][1] + inner[(i + 1) % n][1]) / 2];
      const len = Math.hypot(o[0], o[1]) || 1;
      const vis = face(a, b, [o[0] / len, o[1] / len]);
      if (prev !== null && vis !== prev) silhouette.push(K.pathOf([K.iso([a[0], a[1], z + h], P), K.iso([a[0], a[1], z], P)]));
      prev = vis;
    }
  };
  innerFaces();
  if (caps && !closed) {
    for (const [o, i, other] of [[outer[0], inner[0], outer[1]], [outer[n - 1], inner[n - 1], outer[n - 2]]]) {
      const t = [o[0] - i[0], o[1] - i[1]];
      const len = Math.hypot(t[0], t[1]) || 1;
      let nrm = [t[1] / len, -t[0] / len];
      if (nrm[0] * (other[0] - o[0]) + nrm[1] * (other[1] - o[1]) > 0) nrm = [-nrm[0], -nrm[1]];
      if (face(i, o, nrm)) silhouette.push(K.pathOf([K.iso([o[0], o[1], z + h], P), K.iso([o[0], o[1], z], P)]), K.pathOf([K.iso([i[0], i[1], z + h], P), K.iso([i[0], i[1], z], P)]));
    }
  }
  outerFaces();
  const ring = closed ? null : [...outer, ...[...inner].reverse()];
  const topD = closed
    ? K.pathOf(outer.map(([x, y]) => K.iso([x, y, z + h], P)), true) + K.pathOf([...inner].reverse().map(([x, y]) => K.iso([x, y, z + h], P)), true)
    : K.pathOf(ring.map(([x, y]) => K.iso([x, y, z + h], P)), true);
  const parts = [];
  parts.push(`<path class="iso-fill" d="${faces.flat().join("")}${topD}"/>`);
  faces.forEach((list, shade) => { if (list.length) parts.push(`<path class="iso-shade" data-shade="${shade}" d="${list.join("")}"/>`); });
  parts.push(`<path class="iso-top" fill-rule="evenodd" d="${topD}"/>`);
  if (extra) parts.push(extra);
  parts.push(`<path class="iso-line iso-edge" data-tone="${lit ? "lit" : tone}" d="${topD}${edges.join("")}${silhouette.join("")}"/>`);
  return `<g class="iso-solid"${lit ? " data-lit" : ""}>${parts.join("")}</g>`;
}

// A roller: a short cylinder whose axis runs round the crank, at radius rho and angle a.
function rollerSvg(K, P, centre, rho, a, z, lit) {
  const { sinA, cosA, sinE, cosE } = K.cameraOf(P);
  const view = [cosA * cosE, sinA * cosE, sinE];
  const r = M.ROLLER.r, w = M.ROLLER.w;
  const c = [centre[0] + rho * Math.cos(a), centre[1] + rho * Math.sin(a), z];
  const ax = [-Math.sin(a), Math.cos(a), 0];
  const u = [Math.cos(a), Math.sin(a), 0];
  const ring = (sign) => Array.from({ length: 28 }, (_, i) => {
    const t = (i / 28) * TAU;
    return [c[0] + ax[0] * sign * w / 2 + (u[0] * Math.cos(t)) * r, c[1] + ax[1] * sign * w / 2 + (u[1] * Math.cos(t)) * r, c[2] + Math.sin(t) * r];
  });
  const ends = [ring(1), ring(-1)];
  const facing = ax[0] * view[0] + ax[1] * view[1];
  const near = facing > 0 ? ends[0] : ends[1];
  const flat = [...ends[0], ...ends[1]].map((p) => K.iso(p, P));
  const outline = K.pathOf(hull(flat), true);
  const face = K.pathOf(near.map((p) => K.iso(p, P)), true);
  const nearC = facing > 0 ? 1 : -1;
  const boreAt = near.map((p) => [p[0] + (c[0] + ax[0] * nearC * w / 2 - p[0]) * 0.62, p[1] + (c[1] + ax[1] * nearC * w / 2 - p[1]) * 0.62, p[2] + (c[2] - p[2]) * 0.62]);
  return `<g class="iso-solid"${lit ? " data-lit" : ""}><path class="iso-fill" d="${outline}"/><path class="iso-shade" data-shade="1" d="${outline}"/><path class="iso-top" d="${face}"/><path class="iso-line" data-tone="lo" d="${K.pathOf(boreAt.map((p) => K.iso(p, P)), true)}"/><path class="iso-line iso-edge" data-tone="${lit ? "lit" : "hi"}" d="${outline}${face}"/></g>`;
}

// A torque spring round the driven shaft, split into the half behind the shaft and the half in front.
function springHalves(K, P, centre, r, z0, z1, turns) {
  const { sinA, cosA } = K.cameraOf(P);
  const back = [], front = [];
  let run = [], side = null;
  const steps = Math.ceil(turns * 48);
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * turns * TAU;
    const p = [centre[0] + r * Math.cos(t), centre[1] + r * Math.sin(t), z0 + ((z1 - z0) * i) / steps];
    const s = Math.cos(t) * cosA + Math.sin(t) * sinA > 0 ? "front" : "back";
    if (side !== null && s !== side) { run.push(K.iso(p, P)); (side === "front" ? front : back).push(K.pathOf(run)); run = []; }
    side = s;
    run.push(K.iso(p, P));
  }
  if (run.length > 1) (side === "front" ? front : back).push(K.pathOf(run));
  return { back: back.join(""), front: front.join("") };
}

const arcPts = (centre, r, a0, a1, n = 18) => Array.from({ length: n + 1 }, (_, i) => polar(centre, r, a0 + ((a1 - a0) * i) / n));

// Everything that changes from frame to frame, as SVG strings keyed by slot.
// rot: { drive, driven, bell, belt } angles in radians and belt travel in mm; lit: the part to light.
export function frameSlots(K, P, st, rot, lit = "") {
  const pose = poseOf(st);
  const out = {};
  const A = L.A, B = L.B;

  // belt
  const { pieces } = beltPieces(st.r1, st.r2, Math.atan2(K.cameraOf(P).sinA, K.cameraOf(P).cosA));
  const zb = pose.beltZ - M.BELT_W / 2;
  const half = M.BELT_T / 2;
  const bandOf = (run, opts) => bandSvg(K, P, run.map(({ p, n }) => add(p, scale(n, half))), run.map(({ p, n }) => add(p, scale(n, -half))), zb, M.BELT_W, { tone: "hi", lit: lit === "belt", caps: false, ...opts });
  const cogs = (run) => {
    const lines = [];
    const pitch = 9;
    for (let i = 1; i < run.length; i++) {
      const a = run[i - 1], b = run[i];
      const k0 = Math.ceil((a.s - rot.belt) / pitch), k1 = Math.floor((b.s - rot.belt) / pitch);
      for (let k = k0; k <= k1; k++) {
        const s = k * pitch + rot.belt;
        const f = (s - a.s) / ((b.s - a.s) || 1);
        if (f < 0 || f > 1) continue;
        const p = [a.p[0] + (b.p[0] - a.p[0]) * f, a.p[1] + (b.p[1] - a.p[1]) * f];
        lines.push(K.pathOf([K.iso([...add(p, scale(a.n, half)), zb + M.BELT_W], P), K.iso([...add(p, scale(a.n, -half)), zb + M.BELT_W], P)]));
      }
    }
    return lines.length ? `<path class="iso-line" data-tone="lo" d="${lines.join("")}"/>` : "";
  };
  for (const kind of Object.keys(pieces)) out["belt-" + kind] = pieces[kind].map((run) => bandOf(run, { inner: kind === "back" || kind === "front" ? cogs(run) : "" })).join("");

  // rollers ride out on the ramp plate as the crank spins faster
  const rollers = [];
  for (let i = 0; i < M.ROLLER.count; i++) {
    const a = rot.drive + (i / M.ROLLER.count) * TAU;
    rollers.push({ a, depth: Math.cos(a) * K.cameraOf(P).cosA + Math.sin(a) * K.cameraOf(P).sinA });
  }
  rollers.sort((p, q) => p.depth - q.depth);
  out.rollers = rollers.map(({ a }) => rollerSvg(K, P, A, st.roller, a, pose.rollerZ, lit === "rollers")).join("");
  // guide slots on the ramp plate turn with the crank
  const slotLines = [];
  for (let i = 0; i < M.ROLLER.count; i++) {
    const a = rot.drive + (i / M.ROLLER.count) * TAU;
    const v = Math.atan2(K.cameraOf(P).sinA, K.cameraOf(P).cosA);
    if (!(((((a - (v - 0.7 - 0.25)) % TAU) + TAU) % TAU) > 2.3 + 0.5)) continue;
    for (const off of [-0.2, 0.2]) slotLines.push(K.pathOf([K.iso([...polar(A, 19, a + off * 1.05), RAMP + 0.3], P), K.iso([...polar(A, 41, a + off * 0.5), RAMP + 0.3 + 11 * 0.95], P)]));
  }
  out.ramp = `<path class="iso-line" data-tone="lo" d="${slotLines.join("")}"/>`;

  // fan fins on the fixed drive face
  const fins = [];
  const finTop = DRIVE_FIXED + DRIVE_CONE + 3;
  for (let i = 0; i < 18; i++) {
    const a = rot.drive + (i / 18) * TAU;
    fins.push(K.lineOnTop(polar(A, 22, a), polar(A, M.DRIVE.R - 4, a + 0.32), finTop, P));
  }
  out.fins = `<path class="iso-line" data-tone="mid" d="${fins.join("")}"/>`;

  // driven: guide pins on the movable face's collar, spring, carrier, shoes, bell
  const collarTopZ = pose.springFrom;
  const pins = [];
  for (let i = 0; i < 3; i++) { const a = rot.driven + (i / 3) * TAU; pins.push(K.iso([...polar(B, 25, a), collarTopZ], P)); }
  out.pins = K.dotsSvg(pins, { size: 1.1, tone: "mid" });
  const sp = springHalves(K, P, B, 21, collarTopZ, pose.springTo, 4.5);
  out.dshaft = K.solidSvg(K.cylinder(B[0], B[1], 10, collarTopZ, pose.springTo - collarTopZ, P, 28), { tone: "hi", crease: "none" });
  out["spring-back"] = `<path class="iso-line" data-tone="${lit === "spring" ? "lit" : "mid"}" style="stroke-width:1.6" d="${sp.back}"/>`;
  out["spring-front"] = `<path class="iso-line" data-tone="${lit === "spring" ? "lit" : "hi"}" style="stroke-width:1.9" d="${sp.front}"/>`;

  const shoes = [];
  const shoeList = [];
  for (let i = 0; i < 3; i++) {
    const a0 = rot.driven + (i / 3) * TAU + 0.12;
    const mid = a0 + SHOE.arc;
    shoeList.push({ a0, depth: Math.cos(mid) * K.cameraOf(P).cosA + Math.sin(mid) * K.cameraOf(P).sinA });
  }
  shoeList.sort((p, q) => p.depth - q.depth);
  for (const { a0 } of shoeList) {
    const mid = a0 + SHOE.arc;
    const off = scale([Math.cos(mid), Math.sin(mid)], st.shoe);
    const c = add(B, off);
    const outer = arcPts(c, SHOE.out, a0, a0 + SHOE.arc * 2);
    const inner = arcPts(c, SHOE.in, a0 + 0.18, a0 + SHOE.arc * 2);
    const lining = arcPts(c, SHOE.out - 3.5, a0 + 0.05, a0 + SHOE.arc * 2 - 0.02);
    const pin = K.iso([...polar(B, 43, a0 + 0.2), SHOE.z + SHOE.h], P);
    shoes.push(bandSvg(K, P, outer, inner, SHOE.z, SHOE.h, { tone: "hi", lit: lit === "shoes", inner: `<path class="iso-line" data-tone="lo" d="${K.pathOf(lining.map((p) => K.iso([...p, SHOE.z + SHOE.h], P)))}"/>` }));
    shoes.push(K.dotsSvg([pin], { size: 1.3, tone: "hi" }));
  }
  out.shoes = shoes.join("");

  const bellMarks = [];
  const view = Math.atan2(K.cameraOf(P).sinA, K.cameraOf(P).cosA);
  const outside = (a, from, to) => { const d = (((a - from) % TAU) + TAU) % TAU; return d > to - from; };
  for (let i = 0; i < 12; i++) {
    const a = rot.bell + (i / 12) * TAU;
    if (!outside(a, view - 1.25 - 0.3, view + 1.25)) continue;
    bellMarks.push(K.lineOnTop(polar(B, 18, a), polar(B, BELL.out - 6, a - 0.25), BELL.top + BELL.t, P));
  }
  out.bell = `<path class="iso-line" data-tone="${lit === "bell" ? "lit" : "mid"}" d="${bellMarks.join("")}"/>`;
  const carrier = [];
  for (let i = 0; i < 3; i++) { const a = rot.driven + (i / 3) * TAU + 0.32; carrier.push(K.iso([...polar(B, 43, a), CARRIER + 4], P)); }
  out.carrier = K.dotsSvg(carrier, { size: 1.0, tone: "mid" });
  return out;
}
