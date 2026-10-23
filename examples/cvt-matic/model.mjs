// The CVT of a 150 cc scooter, as one pure model: engine rpm in, every moving part and every number out.
// Sources: final reduction 9.966 (53/18 x 44/13) and 18 g rollers for the Vario 150 eSP; the CVT range
// (about 2.3 to 0.8) and the clutch and shift speeds are typical for Honda 150 cc scooters, not factory data.

export const C = 270; // pulley centres, mm
export const BELT_W = 20; // belt width at the pitch line
export const BELT_T = 8; // belt depth, pitch line in the middle
export const FLANK = Math.tan((14 * Math.PI) / 180); // each sheave face leans 14 degrees (a 28 degree V)
export const DRIVE = { R: 56, hub: 16 };
export const DRIVEN = { R: 68, hub: 24 };
export const FINAL = 9.966;
export const TYRE = 0.5156; // 100/80-14: 14 in rim + 2 x 80 mm wall, metres
export const RATIO_LOW = 2.3;
export const RATIO_TOP = 0.8;
export const R1_LOW = 26;
export const IDLE = 1500;
export const REDLINE = 9000;
export const CLUTCH = [2600, 3600]; // shoes start to touch the bell, then grip fully
export const SHIFT = [4200, 7600]; // rollers start to move, then reach the end of the ramp
export const ROLLER = { r: 10, w: 15, count: 6, from: 21, to: 37 }; // 20 x 15 mm rollers, radial travel
export const SHOE_GAP = 2.4; // mm the shoes travel before they touch the bell

export function beltLength(r1, r2, c = C) {
  const d = r2 - r1;
  const phi = Math.asin(d / c);
  return 2 * Math.sqrt(c * c - d * d) + Math.PI * (r1 + r2) + 2 * d * phi;
}

const R2_LOW = R1_LOW * RATIO_LOW;
export const L = beltLength(R1_LOW, R2_LOW);

export function drivenFor(r1) {
  let lo = 5, hi = 120;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (beltLength(r1, mid) > L) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

function solveTop() {
  let lo = R1_LOW, hi = 80;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (drivenFor(mid) / mid > RATIO_TOP) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
export const R1_TOP = solveTop();

const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const smooth = (v) => { const t = clamp01(v); return t * t * (3 - 2 * t); };

// gap between the sheave faces at the hub that puts the belt's pitch line at radius r
export const hubGap = (r, hub) => BELT_W - 2 * (r - hub) * FLANK;

export function stateAt(rpm) {
  const shift = smooth((rpm - SHIFT[0]) / (SHIFT[1] - SHIFT[0]));
  const grip = smooth((rpm - CLUTCH[0]) / (CLUTCH[1] - CLUTCH[0]));
  const r1 = R1_LOW + (R1_TOP - R1_LOW) * shift;
  const r2 = drivenFor(r1);
  const ratio = r2 / r1;
  const reach = smooth((rpm - (CLUTCH[0] - 600)) / (CLUTCH[1] - CLUTCH[0] + 600));
  const drivenRpm = rpm / ratio;
  const wheelRpm = (drivenRpm * grip) / FINAL;
  const kmh = (wheelRpm * Math.PI * TYRE * 60) / 1000;
  return {
    rpm,
    shift,
    grip,
    r1,
    r2,
    ratio,
    roller: ROLLER.from + (ROLLER.to - ROLLER.from) * shift,
    gap1: hubGap(r1, DRIVE.hub),
    gap2: hubGap(r2, DRIVEN.hub),
    shoe: SHOE_GAP * reach,
    drivenRpm,
    bellRpm: drivenRpm * grip,
    wheelRpm,
    kmh,
  };
}

export const GAP1 = [hubGap(R1_LOW, DRIVE.hub), hubGap(R1_TOP, DRIVE.hub)];
export const GAP2 = [hubGap(R2_LOW, DRIVEN.hub), hubGap(drivenFor(R1_TOP), DRIVEN.hub)];
