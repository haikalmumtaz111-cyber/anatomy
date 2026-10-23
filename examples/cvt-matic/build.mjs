import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import * as G from "../../kit/lathe.mjs";
import { kitScript } from "../../scripts/inline-kit.mjs";
import * as M from "./model.mjs";
import { L, bandSvg, beltLoop, frameSlots, poseOf } from "./scene.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

const WIDTH = 600;
const HEIGHT = 470;
const AZ = 132;
const EL = 32;

const PLATE = { x: -118, y: -176, w: 510, d: 334, r: 10 };
const PLATE_H = 12;
const FOOT_H = 6;
const { Z0, A, B, SHOE, BELL, CARRIER } = L;
const CASE = { r1: 84, r2: 100, floor: 8, wall: 6, wallH: 9 };
const NUT_TOP = L.DRIVE_FIXED + L.DRIVE_CONE + 3 + 8;
const BELL_TOP = BELL.top + BELL.t;
const VIEW_A = (AZ * Math.PI) / 180;
const CUT = [VIEW_A - 0.7, VIEW_A + 1.6]; // the sector cut out of the drive faces, centred on the viewer

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [A[0], A[1], NUT_TOP], [B[0], B[1], BELL_TOP + 8], [L.TACHO.at[0], L.TACHO.at[1] - L.TACHO.r, L.TACHO.z + 4], [L.SPEEDO.at[0], L.SPEEDO.at[1] - L.SPEEDO.r, L.SPEEDO.z + 4]],
  WIDTH,
  HEIGHT,
  { pad: 26, azimuth: AZ, elevation: EL },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const up = (x, y, z) => G.frameOf([x, y, z], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
const V = k.towardViewer(P);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));


// A turned part with a sector cut out of it, so you can see what it covers: each facet is painted back to
// front with its own edges, so nearer facets hide the lines of farther ones.
function cutLathe(centre, z0, meridian, a0, a1, { steps = 72, tone = "hi", lit = false } = {}) {
  const view = G.viewOf(P);
  const pt = (s, r, a) => [centre[0] + r * Math.cos(a), centre[1] + r * Math.sin(a), z0 + s];
  const n = meridian.length;
  const cs = meridian.reduce((t, [s]) => t + s, 0) / n, cr = meridian.reduce((t, [, r]) => t + r, 0) / n;
  const faces = [];
  const count = Math.max(4, Math.ceil(((a1 - a0) / (Math.PI * 2)) * steps));
  for (let i = 0; i < n; i++) {
    const [s0, r0] = meridian[i], [s1, r1] = meridian[(i + 1) % n];
    if (r0 < 1e-6 && r1 < 1e-6) continue;
    let nr = s1 - s0, ns = -(r1 - r0);
    const mr = (r0 + r1) / 2 - cr, ms = (s0 + s1) / 2 - cs;
    if (nr * mr + ns * ms < 0) { nr = -nr; ns = -ns; }
    for (let j = 0; j < count; j++) {
      const aa = a0 + ((a1 - a0) * j) / count, ab = a0 + ((a1 - a0) * (j + 1)) / count, am = (aa + ab) / 2;
      const normal = [nr * Math.cos(am), nr * Math.sin(am), ns];
      if (G.dot3(normal, view) <= 1e-6) continue;
      faces.push({ pts: [pt(s0, r0, aa), pt(s0, r0, ab), pt(s1, r1, ab), pt(s1, r1, aa)], normal, ring: [j === 0, j === count - 1], edge: i });
    }
  }
  for (const [a, sign] of [[a0, -1], [a1, 1]]) {
    const normal = [-Math.sin(a) * sign, Math.cos(a) * sign, 0];
    if (G.dot3(normal, view) <= 1e-6) continue;
    faces.push({ pts: meridian.map(([s, r]) => pt(s, r, a)), normal, cap: true });
  }
  const depth = (f) => f.pts.reduce((t, p) => t + G.dot3(p, view), 0) / f.pts.length;
  faces.sort((p, q) => depth(p) - depth(q));
  const key = (p) => p.map((v) => v.toFixed(2)).join(",");
  const uses = new Map();
  for (const f of faces) f.pts.forEach((p, i) => { const q = f.pts[(i + 1) % f.pts.length]; const k2 = [key(p), key(q)].sort().join("|"); uses.set(k2, [...(uses.get(k2) || []), f]); });
  const parts = [];
  for (const f of faces) {
    const tone = G.toneOf(f.normal, P);
    const d = k.pathOf(f.pts.map((p) => at(p)), true);
    parts.push(tone === 4 ? `<path class="iso-top" d="${d}"/>` : `<path class="iso-shade" data-shade="${tone}" d="${d}"/>`);
    const lines = [], creases = [];
    f.pts.forEach((p, i) => {
      const q = f.pts[(i + 1) % f.pts.length];
      if (Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1e-6) return;
      const k2 = [key(p), key(q)].sort().join("|");
      const list = uses.get(k2) || [];
      const seg = k.pathOf([at(p), at(q)]);
      if (list.length < 2) lines.push(seg);
      else {
        const [fa, fb] = list;
        const c = G.dot3(G.unit3(fa.normal), G.unit3(fb.normal));
        if (c < 0.9 && fa === f) creases.push(seg);
      }
    });
    if (creases.length) parts.push(`<path class="iso-line" data-tone="faint" d="${creases.join("")}"/>`);
    if (lines.length) parts.push(`<path class="iso-line iso-edge" data-tone="__TONE__" d="${lines.join("")}"/>`);
  }
  return `<g class="iso-solid" data-seamless${lit ? " data-lit" : ""}>${parts.join("").replaceAll("__TONE__", tone)}</g>`;
}

function bench() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 26))) {
    out.push(S(k.cylinder(x, y, 9, -PLATE_H - FOOT_H, 2, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H + 2, FOOT_H - 2, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 10, 1.6), { tone: "mid" }));
  out.push(Ln(k.planOutline(k.insetPlan(PLATE, 6), 0, P, 8), { tone: "lo" }));
  const screws = k.corners(PLATE, 12);
  out.push(Ln(screws.map(([x, y]) => k.ring(x, y, 2.6, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.55 }));
  // label plate at the back right
  const label = { x: 290, y: -160, w: 80, d: 24, r: 2 };
  out.push(S(k.slabOf(label, 0, 1, P, 3, 0.4), { tone: "mid" }));
  out.push(Ln([6, 12, 18].map((dy) => k.lineOnTop([label.x + 8, label.y + dy + 1], [label.x + (dy === 18 ? 46 : 74), label.y + dy + 1], 1, P)).join(""), { tone: "lo", free: true }));
  out.push(D(k.corners(label, 3.5).map(([x, y]) => at([x, y, 1])), { size: 0.45 }));
  return out.join("");
}

function dial({ at: [x, y], r, z }, labelText, majors, sub) {
  const out = [];
  const foot = { x: x - 12, y: y - 12, w: 24, d: 24, r: 3 };
  out.push(`<path class="iso-halo" d="${k.haloOf(foot, 0, 0.1, P)}" style="filter:blur(3px)"/>`);
  out.push(S(k.slabOf(foot, 0, 6, P, 3, 0.5), { tone: "mid" }));
  out.push(D(k.corners(foot, 3.5).map(([px, py]) => at([px, py, 6])), { size: 0.45 }));
  out.push(S(k.cylinder(x, y, 4, 6, z - 14 - 6, P, 20), { tone: "mid", crease: "none" }));
  out.push(Ln(k.sideArc(x, y, 4, 40, P, 12), { tone: "faint" }));
  out.push(S(k.cylinder(x, y, 7, z - 14, 4, P, 24), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, r, z - 10, 10, P, 72, 0.8), { tone: "hi", crease: "lo" }));
  out.push(Ln(k.sideArc(x, y, r, z - 3.4, P, 48), { tone: "faint" }));
  out.push(Ln(k.ring(x, y, r - 2.6, z, P, 72), { tone: "lo" }));
  const span = Math.PI * 1.5;
  const from = -span / 2;
  const ticks = k.radialTicks(x, y, r - 3.4, majors * 5, 5, z, [1.6, 3.6], P, from, span);
  out.push(Ln(ticks.minor, { tone: "lo" }), Ln(ticks.major, { tone: "mid" }));
  // the red zone of the tacho starts at 8 500 rpm
  if (sub) out.push(Ln(sub, { tone: "red" }));
  out.push(k.faceTextSvg(k.topMatrix([x, y + r * 0.42], z, P, "x"), labelText, { size: 4.2, tone: "lo", anchor: "middle" }));
  out.push(D([at([x, y, z])], { size: 1.4, tone: "hi" }));
  return out.join("");
}

function caseShape() {
  // the CVT case with its cover off: a floor shaped round both pulleys, and its gasket wall
  const loop = (r1, r2) => beltLoop(r1, r2, 6).pts;
  const outerLoop = loop(CASE.r1, CASE.r2);
  const ring = outerLoop.map(({ p }) => p);
  const out = [];
  out.push(`<path class="iso-halo" d="${k.extrude(ring, 0, 0.1, P).fill}" style="filter:blur(5px)"/>`);
  for (const [x, y] of byDepth([[-40, -50], [-40, 50], [300, -70], [300, 70]])) out.push(S(k.cylinder(x, y, 11, 0, CASE.floor, P, 24), { tone: "lo" }));
  out.push(S(k.extrude(ring, CASE.floor, Z0 - CASE.floor, P, { bevel: 0.8 }), { tone: "mid" }));
  const wallOuter = outerLoop.map(({ p }) => p);
  const wallInner = outerLoop.map(({ p, n }) => [p[0] - n[0] * CASE.wall, p[1] - n[1] * CASE.wall]);
  const facing = outerLoop.map(({ n }) => n[0] * V[0] + n[1] * V[1] > 0);
  const runs = { back: [], front: [] };
  let cur = [], side = facing[0];
  for (let i = 0; i <= ring.length; i++) {
    const j = i % ring.length;
    if (facing[j] !== side) { cur.push(j); runs[side ? "front" : "back"].push(cur); cur = [j]; side = facing[j]; } else cur.push(j);
  }
  runs[side ? "front" : "back"].push(cur);
  const wall = (list) => list.filter((idx) => idx.length > 1).map((idx) => bandSvg(k, P, idx.map((i) => wallOuter[i]), idx.map((i) => wallInner[i]), Z0, CASE.wallH, { tone: "mid", caps: false })).join("");
  const boltsAt = (want) => outerLoop.filter((_, i) => i % 9 === 4 && facing[i] === want).map(({ p, n }) => [p[0] - n[0] * CASE.wall / 2, p[1] - n[1] * CASE.wall / 2]);
  const bolts = (want) => Ln(boltsAt(want).map(([x, y]) => k.ring(x, y, 1.6, Z0 + CASE.wallH, P, 14)).join(""), { tone: "lo" }) + D(boltsAt(want).map(([x, y]) => at([x, y, Z0 + CASE.wallH])), { size: 0.5 });
  // floor details: the drive boss ring, the oil-check bolt of the gear case under the driven pulley, a breather
  const floor = [];
  floor.push(Ln(k.ring(A[0], A[1], 64, Z0, P, 72), { tone: "faint" }));
  floor.push(Ln(k.ring(B[0], B[1], 80, Z0, P, 72), { tone: "faint" }));
  const oil = [B[0] + 58, B[1] + 66];
  floor.push(S(k.cylinder(oil[0], oil[1], 7, Z0, 3, P, 6), { tone: "mid" }));
  floor.push(S(k.cylinder(oil[0], oil[1], 5, Z0 + 3, 2, P, 20), { tone: "mid" }));
  floor.push(D([at([oil[0], oil[1], Z0 + 5])], { size: 0.6 }));
  const tabs = [[132, -38], [132, 38]];
  for (const [x, y] of tabs) {
    floor.push(S(k.cylinder(x, y, 6, Z0, 4, P, 20), { tone: "mid" }));
    floor.push(Ln(k.ring(x, y, 2.4, Z0 + 4, P, 14), { tone: "lo" }));
  }
  return { back: out.join("") + wall(runs.back) + bolts(false) + floor.join(""), front: wall(runs.front) + bolts(true) };
}

function driveStatic() {
  const C0 = A;
  const parts = {};
  parts.base = S(k.cylinder(C0[0], C0[1], 24, Z0, L.RAMP - 3 - Z0, P, 48, 0.6), { tone: "mid" }) + S(k.cylinder(C0[0], C0[1], 9, L.RAMP - 3, 40, P, 24), { tone: "hi", crease: "none" });
  // the ramp plate is a dish: rollers run up its slope as they fly out
  const slope = L.TRAVEL / (M.ROLLER.to - M.ROLLER.from);
  const rimS = 3 + (43 - 21) * slope;
  parts.ramp = cutLathe(C0, L.RAMP - 3, [[0, 9], [0, 46], [rimS, 46], [rimS, 43], [3, 21], [3, 9]], CUT[1], CUT[0] + Math.PI * 2, { tone: "mid" });
  parts.movable = cutLathe(C0, L.DRIVE_BACK, [[0, 9], [0, M.DRIVE.R], [3, M.DRIVE.R], [3 + L.DRIVE_CONE, M.DRIVE.hub], [3 + L.DRIVE_CONE, 9]], CUT[1], CUT[0] + Math.PI * 2, { tone: "hi" });
  parts.gap = S(k.cylinder(C0[0], C0[1], 9, L.DRIVE_BACK + 3 + L.DRIVE_CONE, L.DRIVE_FIXED - (L.DRIVE_BACK + 3 + L.DRIVE_CONE) + 2, P, 24), { tone: "hi", crease: "none" });
  const F = up(C0[0], C0[1], L.DRIVE_FIXED);
  const top = L.DRIVE_FIXED + L.DRIVE_CONE + 3;
  parts.fixed = S(G.solidOf([[0, M.DRIVE.hub], [L.DRIVE_CONE, M.DRIVE.R], [L.DRIVE_CONE + 3, M.DRIVE.R]], F, P), { tone: "hi", crease: "lo" }) + Ln(k.ring(C0[0], C0[1], M.DRIVE.R - 3, top, P, 72), { tone: "faint" }) + Ln(k.ring(C0[0], C0[1], 20, top, P, 40), { tone: "faint" });
  parts.nut = S(k.cylinder(C0[0], C0[1], 15, top, 1.6, P, 40), { tone: "mid" }) + S(k.cylinder(C0[0], C0[1], 11, top + 1.6, 6.4, P, 6), { tone: "hi" }) + D([at([C0[0], C0[1], top + 8])], { size: 0.8 });
  return parts;
}

function drivenStatic() {
  const C0 = B;
  const parts = {};
  parts.base = S(k.cylinder(C0[0], C0[1], 34, Z0, 5, P, 56, 0.6), { tone: "mid" }) + S(k.cylinder(C0[0], C0[1], 28, Z0 + 5, L.DRIVEN_BASE - Z0 - 5, P, 48, 0.5), { tone: "mid" });
  parts.fixed = S(G.solidOf([[0, M.DRIVEN.R], [3, M.DRIVEN.R], [3 + L.DRIVEN_CONE, M.DRIVEN.hub]], up(C0[0], C0[1], L.DRIVEN_BASE), P), { tone: "hi", crease: "lo" }) + Ln(G.arcOf(up(C0[0], C0[1], L.DRIVEN_BASE), 1.5, M.DRIVEN.R, P), { tone: "faint" });
  const hub = L.DRIVEN_BASE + 3 + L.DRIVEN_CONE;
  parts.gap = S(k.cylinder(C0[0], C0[1], 12, hub, M.GAP2[1] + 1, P, 28), { tone: "hi", crease: "none" });
  const F = up(C0[0], C0[1], hub + M.GAP2[0]);
  const rim = L.DRIVEN_CONE + 3;
  parts.movable = S(G.solidOf([[0, M.DRIVEN.hub], [L.DRIVEN_CONE, M.DRIVEN.R], [rim, M.DRIVEN.R]], F, P), { tone: "hi", crease: "lo" }) + Ln(k.ring(C0[0], C0[1], M.DRIVEN.R - 3, hub + M.GAP2[0] + rim, P, 72), { tone: "faint" }) + S(k.cylinder(C0[0], C0[1], 30, hub + M.GAP2[0] + rim, L.COLLAR_H, P, 56, 0.5), { tone: "hi", crease: "lo" }) + Ln(k.sideArc(C0[0], C0[1], 30, hub + M.GAP2[0] + rim + 4, P, 40), { tone: "faint" });
  // the clutch bell, cut away on the side facing you so the shoes show
  const view = Math.atan2(V[1], V[0]);
  const cut = 1.25;
  const wallArc = (r) => Array.from({ length: 49 }, (_, i) => { const a = view + cut + ((Math.PI * 2 - 2 * cut) * i) / 48; return [C0[0] + r * Math.cos(a), C0[1] + r * Math.sin(a)]; });
  parts.bellBack = bandSvg(k, P, wallArc(BELL.out), wallArc(BELL.in), BELL.z0, BELL.top - BELL.z0, { tone: "hi", caps: true });
  parts.carrier = S(k.cylinder(C0[0], C0[1], 46, CARRIER, 4, P, 64, 0.5), { tone: "mid" }) + S(k.cylinder(C0[0], C0[1], 16, CARRIER + 4, 4, P, 6), { tone: "mid" });
  const top = BELL.top + BELL.t;
  parts.bellTop = cutLathe(C0, BELL.top, [[0, 12], [0, BELL.out], [BELL.t, BELL.out], [BELL.t, 12]], view + cut, view - cut + Math.PI * 2, { tone: "hi" });
  parts.nut = S(k.cylinder(C0[0], C0[1], 13, top, 2, P, 40), { tone: "mid" }) + S(k.cylinder(C0[0], C0[1], 9, top + 2, 6, P, 6), { tone: "hi" }) + D([at([C0[0], C0[1], top + 8])], { size: 0.8 });
  // front edge of the cut: the wall's end faces are in bellBack (caps)
  return parts;
}

function slider() {
  const { y, from, to } = L.SLIDER;
  const rail = { x: from - 22, y: y - 9, w: to - from + 44, d: 18, r: 3 };
  const out = [];
  out.push(S(k.slabOf(rail, 0, 4, P, 4, 0.6), { tone: "mid" }));
  const slot = { x: from - 6, y: y - 2.2, w: to - from + 12, d: 4.4, r: 2.2 };
  out.push(S(k.slabOf(slot, 3.6, 0.4, P, 4), { tone: "lo", crease: "none", flat: true }));
  const ticks = k.topTicks(from, to, (to - from) / 25, 5, rail.y + 1.4, 4, [2, 3.6], P);
  out.push(Ln(ticks.minor, { tone: "lo" }), Ln(ticks.major, { tone: "mid" }));
  out.push(D([at([rail.x + 5, y, 4]), at([rail.x + rail.w - 5, y, 4])], { size: 0.5 }));
  return out.join("");
}

function sliderBlock(lit) {
  const { y } = L.SLIDER;
  const plan = { x: -9, y: y - 8, w: 18, d: 16, r: 2.5 };
  return S(k.slabOf(plan, 4, 6, P, 4, 0.5), { tone: "hi", lit }) + S(k.cylinder(0, y, 4.4, 10, 9, P, 24), { tone: "hi", lit }) + Ln(k.knurl(0, y, 4.4, 10, 19, 22, P), { tone: "lo" }) + D([at([0, y, 19])], { size: 0.7, tone: "hi" });
}

// --- assemble -----------------------------------------------------------------------------------------
const drive = driveStatic();
const driven = drivenStatic();
const box = caseShape();
const rpmTo = (rpm) => ((rpm - 0) / 10000);
const tachoRed = (() => {
  const { at: [x, y], r, z } = L.TACHO;
  const span = Math.PI * 1.5, from = -span / 2;
  const pts = [];
  for (let i = 0; i <= 12; i++) { const a = from + span * (0.85 + (0.15 * i) / 12); pts.push([x + Math.sin(a) * (r - 4.4), y - Math.cos(a) * (r - 4.4)]); }
  return k.onTop(pts, z, P);
})();
void rpmTo;

const slot = (name, inner = "") => `<g data-slot="${name}">${inner}</g>`;
const moving = (name, inner) => `<g data-move="${name}">${inner}</g>`;
const rest = M.stateAt(M.IDLE);
const first = frameSlots(k, P, rest, { drive: 0, driven: 0, bell: 0, belt: 0 });

const layers = [
  bench(),
  dial(L.TACHO, "x1000 rpm", 10, tachoRed),
  slot("tacho"),
  dial(L.SPEEDO, "km/j", 12, ""),
  slot("speedo"),
  box.back,
  slot("belt-back", first["belt-back"]),
  // driven pulley and clutch, bottom to top
  driven.base,
  driven.fixed,
  slot("belt-driven-b", first["belt-driven-b"]),
  driven.gap,
  slot("belt-driven-f", first["belt-driven-f"]),
  moving("driven-movable", driven.movable),
  slot("pins", first.pins),
  slot("spring-back", first["spring-back"]),
  slot("dshaft", first.dshaft),
  slot("spring-front", first["spring-front"]),
  driven.bellBack,
  driven.carrier,
  slot("carrier", first.carrier),
  slot("shoes", first.shoes),
  driven.bellTop,
  slot("bell", first.bell),
  driven.nut,
  // drive pulley, bottom to top
  drive.base,
  drive.ramp,
  slot("ramp", first.ramp),
  slot("rollers", first.rollers),
  moving("drive-movable", drive.movable),
  slot("belt-drive-b", first["belt-drive-b"]),
  drive.gap,
  slot("belt-drive-f", first["belt-drive-f"]),
  drive.fixed,
  slot("fins", first.fins),
  drive.nut,
  slot("belt-front", first["belt-front"]),
  box.front,
  slider(),
  `<g data-move="slider" data-lit-name="slider">${sliderBlock(false)}</g>`,
];

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "The CVT of a 150 cc scooter on a bench, its cover off. A gas slider sets engine speed. On the crank, six rollers ride out on a dish as it spins faster and push the movable drive face toward the fixed one, so the V-belt climbs to a larger radius there and sinks into the rear pulley against its spring. Past about 3,000 rpm the three clutch shoes swing out and grip the bell, which drives the final gears to the rear wheel. Two dials read engine rpm and road speed.",
  body: layers,
});

const strip = (file, names) => {
  const src = readFileSync(join(HERE, file), "utf8").replace(/^import .*$/gm, "").replace(/^export /gm, "");
  return src + `\n`;
};
const SCENE_SRC = strip("scene.mjs").replace(/\bM\./g, "MODEL.");
const MODEL_SRC = strip("model.mjs");
const sharedScript = `
const MODEL = (() => { ${MODEL_SRC}; return { C, BELT_W, BELT_T, FLANK, DRIVE, DRIVEN, FINAL, TYRE, RATIO_LOW, RATIO_TOP, R1_LOW, R1_TOP, IDLE, REDLINE, CLUTCH, SHIFT, ROLLER, SHOE_GAP, GAP1, GAP2, L, stateAt }; })();
const SCENE = (() => { ${SCENE_SRC}; return { L, poseOf, frameSlots }; })();
const P = ${JSON.stringify(P)};
const K = { iso, pathOf, cameraOf, lineOnTop, dotsSvg, solidSvg, cylinder, onTop };
`;

const live = readFileSync(join(HERE, "live.js"), "utf8");

const keys = [
  { mark: "lit", label: "The part doing the work right now" },
  { mark: "raised", label: "Pulleys, belt, clutch: all drawn to scale in mm" },
];
const body = k.plateHtml({
  fig: "Fig 1",
  title: "CVT matic 150 cc",
  hint: "Hover left to right to open the gas",
  readout: `${M.IDLE} rpm · rasio ${rest.ratio.toFixed(2)} · 0 km/j`,
  keys,
  caption:
    "Engine speed sets everything. The rollers (18 g each) fly out on their dish and close the front pulley, so the belt climbs there and sinks into the rear pulley: the ratio slides from about 2.3 to 0.8 with no gears. The shoes grip the bell from about 3,000 rpm, and the gear case under the rear pulley cuts speed by 9.966 to the wheel.",
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="CVT: arrow keys open and close the gas" aria-valuemin="${M.IDLE}" aria-valuemax="${M.REDLINE}" aria-valuenow="${M.IDLE}">${svg}</div>`,
});

const CSS = `<style>.iso-svg [data-slot],.iso-svg [data-move]{will-change:transform}</style>`;
const file = theme === "light" ? "cvt-matic-light.html" : "cvt-matic.html";
writeFileSync(join(HERE, file), k.pageHtml({ title: "CVT matic", theme, body: CSS + body, script: kitScript() + sharedScript + `const MODE = "card";\n` + live, width: 760 }));
console.log("wrote", file);

// --- the vertical video page ----------------------------------------------------------------------------
if (process.argv.includes("--video")) {
  const ASPECT = 1060 / 960;
  const boxOf = (points, pad) => {
    const flat = points.map((p) => at(p));
    let [x0, y0, x1, y1] = [Math.min(...flat.map((p) => p[0])), Math.min(...flat.map((p) => p[1])), Math.max(...flat.map((p) => p[0])), Math.max(...flat.map((p) => p[1]))];
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    let w = x1 - x0, h = y1 - y0;
    if (w / h < ASPECT) { const nw = h * ASPECT; x0 -= (nw - w) / 2; w = nw; } else { const nh = w / ASPECT; y0 -= (nh - h) / 2; h = nh; }
    return [x0, y0, w, h].map((v) => Math.round(v * 10) / 10);
  };
  const around = (c, r, z0, z1) => [0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => [[c[0] + r * Math.cos((i * Math.PI) / 4), c[1] + r * Math.sin((i * Math.PI) / 4), z0], [c[0] + r * Math.cos((i * Math.PI) / 4), c[1] + r * Math.sin((i * Math.PI) / 4), z1]]);
  const FOCUS = {
    all: boxOf(k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0).concat([[L.TACHO.at[0], L.TACHO.at[1], L.TACHO.z]]), 8),
    case: boxOf([...around(A, 70, Z0, NUT_TOP), ...around(B, 80, Z0, BELL_TOP + 8)], 6),
    drive: boxOf(around(A, 95, Z0, NUT_TOP), 6),
    clutch: boxOf(around(B, 92, Z0, BELL_TOP + 8), 6),
  };
  const vbody = readFileSync(join(HERE, "video.html"), "utf8").replace("__SVG__", svg).replace("__FOCUS__", JSON.stringify(FOCUS));
  const html = k.pageHtml({ title: "CVT matic video", theme: "light", body: vbody, script: kitScript() + sharedScript + `const MODE = "video";\n` + live, width: 1080 });
  writeFileSync(join(HERE, "cvt-matic-video.html"), html);
  console.log("wrote cvt-matic-video.html");
}

export { poseOf };
