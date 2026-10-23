// Live code shared by the card and the video page: the gas sets engine rpm, the model sets every part.
const svg = document.querySelector(".iso-svg");
const slots = {};
svg.querySelectorAll("[data-slot]").forEach((g) => (slots[g.dataset.slot] = g));
const moves = {};
svg.querySelectorAll("[data-move]").forEach((g) => (moves[g.dataset.move] = g));
const readout = document.querySelector("[data-readout]");
const TAU = Math.PI * 2;
const VIS = 1 / 90; // the drawing turns at 1/90 of real speed, or nothing would be seen
const { L } = SCENE;
const rot = { drive: 0, driven: 0, bell: 0, belt: 0 };
let rpm = MODEL.IDLE;

function needle(dial, frac) {
  const { at: [x, y], r, z } = dial;
  const span = Math.PI * 1.5;
  const a = -span / 2 + span * Math.min(1.02, Math.max(0, frac));
  return lineOnTop([x - Math.sin(a) * 5, y + Math.cos(a) * 5], [x + Math.sin(a) * (r - 7), y - Math.cos(a) * (r - 7)], z + 0.2, P);
}

function litFor(st) {
  if (st.rpm > MODEL.CLUTCH[0] - 400 && st.grip < 0.999) return "shoes";
  return "rollers";
}

function render(st, lit) {
  const s = SCENE.frameSlots(K, P, st, rot, lit);
  for (const key in s) if (slots[key]) slots[key].innerHTML = s[key];
  const pose = SCENE.poseOf(st);
  moves["drive-movable"].setAttribute("transform", translateAlong(P, [0, 0, pose.lift]));
  moves["driven-movable"].setAttribute("transform", translateAlong(P, [0, 0, pose.drivenLift]));
  const { from, to } = L.SLIDER;
  const share = (st.rpm - MODEL.IDLE) / (MODEL.REDLINE - MODEL.IDLE);
  moves.slider.setAttribute("transform", translateAlong(P, [from + (to - from) * share, 0, 0]));
  const block = moves.slider.querySelectorAll(".iso-solid");
  block.forEach((g) => (lit === "slider" ? g.setAttribute("data-lit", "") : g.removeAttribute("data-lit")));
  slots.tacho.innerHTML = `<path class="iso-line" data-tone="lit" data-free="start" style="stroke-width:1.3" d="${needle(L.TACHO, st.rpm / 10000)}"/>`;
  slots.speedo.innerHTML = `<path class="iso-line" data-tone="lit" data-free="start" style="stroke-width:1.3" d="${needle(L.SPEEDO, st.kmh / 120)}"/>`;
}

function advance(dt, st) {
  rot.drive += (TAU * st.rpm * VIS * dt) / 60;
  rot.driven += (TAU * st.drivenRpm * VIS * dt) / 60;
  rot.bell += (TAU * st.bellRpm * VIS * dt) / 60;
  rot.belt += (TAU * st.rpm * VIS * dt * st.r1) / 60;
}

const fmt = (n) => Math.round(n).toLocaleString("id-ID");
const textOf = (st) => `${fmt(Math.round(st.rpm / 50) * 50)} rpm · rasio ${st.ratio.toFixed(2).replace(".", ",")} · ${fmt(st.kmh)} km/j`;

if (MODE === "card") {
  const stage = document.querySelector(".iso-stage");
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const tour = [MODEL.IDLE, 3300, 5600, 8500, 8500, 4200, MODEL.IDLE];
  let target = rpm, frame = 0, last = 0, clock = 0, touring = !still.matches, visible = false, idle = 0;
  function tick(now) {
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;
    if (touring) { clock += dt; target = tour[Math.floor(clock / 2.6) % tour.length]; }
    rpm = still.matches ? target : rpm + (target - rpm) * (1 - Math.exp(-dt / 0.45));
    const st = MODEL.stateAt(rpm);
    if (!still.matches) advance(dt, st);
    render(st, litFor(st));
    const text = textOf(st);
    if (readout.textContent !== text) readout.textContent = text;
    stage.setAttribute("aria-valuenow", String(Math.round(rpm)));
    stage.setAttribute("aria-valuetext", text);
    frame = visible ? requestAnimationFrame(tick) : 0;
  }
  const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
  const steer = (next) => { touring = false; target = Math.min(MODEL.REDLINE, Math.max(MODEL.IDLE, next)); clearTimeout(idle); idle = setTimeout(() => { touring = !still.matches; clock = 0; }, 4000); run(); };
  new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
  stage.addEventListener("pointermove", (event) => {
    const box = svg.getBoundingClientRect();
    const share = Math.min(1, Math.max(0, ((event.clientX - box.left) / box.width - 0.15) / 0.7));
    steer(MODEL.IDLE + share * (MODEL.REDLINE - MODEL.IDLE));
  });
  stage.addEventListener("keydown", (event) => {
    let to = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") to = target + 500;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") to = target - 500;
    if (event.key === "Home") to = MODEL.IDLE;
    if (event.key === "End") to = MODEL.REDLINE;
    if (to === null) return;
    event.preventDefault();
    steer(to);
  });
  render(MODEL.stateAt(rpm), "rollers");
}

if (MODE === "video") {
  const SCENES = window.VIDEO_SCENES;
  const total = SCENES[SCENES.length - 1].end;
  const ease = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
  const rpmAt = (t) => {
    const sc = SCENES.find((s) => t < s.end) || SCENES[SCENES.length - 1];
    const span = sc.ramp ?? sc.end - sc.start;
    return sc.from + (sc.to - sc.from) * ease((t - sc.start) / span);
  };
  const el = (sel) => document.querySelector(sel);
  let clock = 0, shown = -1;
  window.__videoLength = total;
  window.__frame = (t) => {
    while (clock < t - 1e-9) {
      const dt = Math.min(1 / 240, t - clock);
      clock += dt;
      advance(dt, MODEL.stateAt(rpmAt(clock)));
    }
    rpm = rpmAt(t);
    const st = MODEL.stateAt(rpm);
    const index = Math.max(0, SCENES.findIndex((s) => t < s.end));
    const sc = SCENES[index === -1 ? SCENES.length - 1 : index];
    render(st, sc.lit);
    const F = window.VIDEO_FOCUS;
    const prev = SCENES[Math.max(0, index - 1)];
    const blend = index <= 0 ? 1 : ease((t - sc.start) / 1.1);
    const a = F[prev.focus], b = F[sc.focus];
    svg.setAttribute("viewBox", a.map((v, i) => (v + (b[i] - v) * blend).toFixed(2)).join(" "));
    if (index !== shown) {
      shown = index;
      el("[data-step]").textContent = `${index + 1}/${SCENES.length}`;
      el("[data-title]").textContent = sc.title;
      el("[data-body]").textContent = sc.body;
    }
    const local = (t - sc.start) / (sc.end - sc.start);
    el("[data-cap]").style.opacity = String(Math.min(1, Math.min(local * (sc.end - sc.start) / 0.35, (1 - local) * (sc.end - sc.start) / 0.25)));
    el("[data-rpm]").textContent = fmt(Math.round(st.rpm / 50) * 50);
    el("[data-ratio]").textContent = st.ratio.toFixed(2).replace(".", ",");
    el("[data-kmh]").textContent = fmt(st.kmh);
    el("[data-grip]").textContent = st.grip < 0.01 ? "lepas" : st.grip > 0.99 ? "nempel" : "slip " + Math.round(st.grip * 100) + "%";
    el("[data-progress]").style.width = ((t / total) * 100).toFixed(2) + "%";
  };
  window.__frame(0);
}
