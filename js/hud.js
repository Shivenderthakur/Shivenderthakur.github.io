/* The instruments over the world: a compass bar with a bearing for every
   building, a heading-up radar, an objective line, and on touch screens a thumb
   stick. They exist because the site is navigated by walking, so the reader has
   to be able to see where each part of the portfolio is from where they stand.

   At the workbench they give way to the seat controls: Stand up, About, a hint,
   and the armctl console, a log and one input line whose text goes to the arm. */

const CYAN = "#9ad9ee";
const SIGNAL = "#ffb43d";
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createHud({ places, coarse }) {
  const hud = document.getElementById("hud");
  const strip = document.getElementById("compass-strip");
  const radar = document.getElementById("radar");
  const objective = document.getElementById("objective");
  const stickEl = document.getElementById("stick");
  const ctx = radar ? radar.getContext("2d") : null;

  /* ------------------------------------------------------------ compass */
  const marks = [];
  const addMark = (label, bearing, place, kind) => {
    if (!strip) return;
    const el = document.createElement("span");
    el.className = "compass__mark compass__mark--" + kind;
    el.textContent = label;
    strip.append(el);
    marks.push({ el, bearing, place });
  };
  /* north is -Z on the island */
  [["N", Math.PI], ["E", Math.PI / 2], ["S", 0], ["W", -Math.PI / 2]].forEach(([l, b]) => addMark(l, b, null, "cardinal"));
  places.forEach((p) => addMark(p.short || p.label, null, p, "place"));
  const HALF = 1.75;   // radians either side of centre shown on the bar

  /* -------------------------------------------------------------- stick */
  const stick = { active: false, x: 0, y: 0 };
  if (stickEl && coarse) {
    stickEl.hidden = false;
    const knob = stickEl.querySelector(".stick__knob");
    let id = null, cx = 0, cy = 0, R = 48;
    const set = (e) => {
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const d = Math.hypot(dx, dy), m = Math.min(d, R);
      if (d > 0) { dx = (dx / d) * m; dy = (dy / d) * m; }
      stick.x = dx / R;
      stick.y = -dy / R;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const end = () => {
      id = null;
      stick.active = false;
      stick.x = stick.y = 0;
      knob.style.transform = "";
    };
    stickEl.addEventListener("pointerdown", (e) => {
      id = e.pointerId;
      stickEl.setPointerCapture(id);
      const r = stickEl.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2; R = r.width / 2;
      stick.active = true;
      set(e);
      e.preventDefault();
    });
    stickEl.addEventListener("pointermove", (e) => { if (e.pointerId === id) set(e); });
    stickEl.addEventListener("pointerup", end);
    stickEl.addEventListener("pointercancel", end);
  }

  /* -------------------------------------------------------------- radar */
  const RANGE = 26;   // metres from the reader to the edge of the dish
  function drawRadar(player, view, current) {
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = radar.clientWidth || 160;
    if (radar.width !== Math.round(size * dpr)) { radar.width = radar.height = Math.round(size * dpr); }
    const W = radar.width, c = W / 2, scale = (W / 2 - 6) / RANGE;
    ctx.clearRect(0, 0, W, W);

    ctx.save();
    ctx.beginPath(); ctx.arc(c, c, c - 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = "rgba(12, 22, 30, 0.72)";
    ctx.fillRect(0, 0, W, W);
    ctx.strokeStyle = "rgba(154, 217, 238, 0.16)";
    ctx.lineWidth = dpr;
    for (const k of [0.33, 0.66]) { ctx.beginPath(); ctx.arc(c, c, (c - 2) * k, 0, Math.PI * 2); ctx.stroke(); }

    const sv = Math.sin(view), cv = Math.cos(view);
    const project = (x, z) => {
      const dx = x - player.position.x, dz = z - player.position.z;
      const fwd = dx * sv + dz * cv;
      const right = -dx * cv + dz * sv;
      return [c + right * scale, c - fwd * scale];
    };

    /* the island's rim */
    ctx.strokeStyle = "rgba(154, 217, 238, 0.28)";
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const [sx, sy] = project(Math.cos(a) * 22, Math.sin(a) * 22);
      i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
    }
    ctx.stroke();

    for (const p of places) {
      const z = p.zone;
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
        const lx = u * z.hw, lz = v * z.hd;
        return project(z.x + lx * z.c + lz * z.s, z.z - lx * z.s + lz * z.c);
      });
      ctx.beginPath();
      corners.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      const on = p === current;
      ctx.fillStyle = on ? "rgba(255, 180, 61, 0.28)" : "rgba(154, 217, 238, 0.12)";
      ctx.strokeStyle = on ? SIGNAL : "rgba(154, 217, 238, 0.55)";
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();

    /* the reader, always pointing up the dish in the direction of travel */
    const rel = wrap(player.heading - view);
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(-rel);
    ctx.fillStyle = SIGNAL;
    ctx.beginPath();
    ctx.moveTo(0, -7 * dpr); ctx.lineTo(5 * dpr, 6 * dpr); ctx.lineTo(0, 3 * dpr); ctx.lineTo(-5 * dpr, 6 * dpr);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = CYAN;
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.arc(c, c, c - 2, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  let seatedNow = false;
  function update(player, yaw, current) {
    if (seatedNow) return;   // the compass and radar are hidden at the desk; no need to draw them
    const view = yaw + Math.PI;   // the direction the camera looks along the ground
    for (const m of marks) {
      const b = m.place
        ? Math.atan2(m.place.zone.x - player.position.x, m.place.zone.z - player.position.z)
        : m.bearing;
      const rel = wrap(b - view);
      const visible = Math.abs(rel) < HALF;
      m.el.style.visibility = visible ? "visible" : "hidden";
      if (visible) m.el.style.left = `${50 - (rel / HALF) * 50}%`;
      if (m.place) m.el.classList.toggle("is-current", m.place === current);
    }
    drawRadar(player, view, current);
  }

  function setPlace(place) {
    if (objective) objective.textContent = place ? place.label : "Walk into a building to open it";
  }

  function show(on) { if (hud) hud.classList.toggle("is-on", on); if (stickEl) stickEl.classList.toggle("is-on", on); }

  /* ------------------------------------------------------- seat and console */
  const seatEl = document.getElementById("seat");
  const logEl = document.getElementById("console-log");
  const form = document.getElementById("console-form");
  const input = document.getElementById("console-input");
  const hint = document.getElementById("seat-hint");
  const aboutBtn = document.getElementById("seat-about");
  const standBtn = document.getElementById("seat-stand");
  const on = { command: null, stand: null, about: null };

  if (hint && coarse) hint.textContent = "Tap the desk to point, the arm places the block there, or type help";

  /* earlier lines come back with the arrow keys, as in a shell */
  const history = [];
  let back = 0;

  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const line = input.value.trim();
    input.value = "";
    if (!line) return;
    if (history[history.length - 1] !== line) history.push(line);
    if (history.length > 40) history.shift();
    back = history.length;
    on.command?.(line);
  });

  input?.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" && history.length) {
      e.preventDefault();
      back = Math.max(0, back - 1);
      input.value = history[back];
    } else if (e.key === "ArrowDown" && history.length) {
      e.preventDefault();
      back = Math.min(history.length, back + 1);
      input.value = history[back] || "";
    } else if (e.key === "Escape") {
      /* the first Escape leaves the input; the next one, on the page, stands up */
      e.preventDefault();
      input.blur();
    }
  });

  standBtn?.addEventListener("click", () => on.stand?.());
  aboutBtn?.addEventListener("click", () => on.about?.());

  /* a phone keyboard covers the bottom of the layout viewport; lift the console above it */
  const vv = window.visualViewport;
  if (vv && seatEl) {
    const fit = () => {
      const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      seatEl.style.setProperty("--kb", `${Math.round(covered)}px`);
    };
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
  }

  function print(lines, kind = "out") {
    if (!logEl) return;
    for (const text of Array.isArray(lines) ? lines : [lines]) {
      const li = document.createElement("li");
      li.className = "console__row console__row--" + kind;
      li.textContent = String(text);
      logEl.append(li);
    }
    while (logEl.children.length > 80) logEl.firstElementChild.remove();
    logEl.scrollTop = logEl.scrollHeight;
  }

  function setSeated(state) {
    seatedNow = !!state;
    if (seatEl) seatEl.hidden = !seatedNow;
    if (!seatedNow && input && document.activeElement === input) input.blur();
  }

  function setAbout(open) {
    if (aboutBtn) aboutBtn.setAttribute("aria-pressed", open ? "true" : "false");
  }

  return {
    stick, update, setPlace, show,
    setSeated, setAbout, print,
    onCommand(fn) { on.command = fn; },
    onStand(fn) { on.stand = fn; },
    onAbout(fn) { on.about = fn; },
    get typing() { return !!input && document.activeElement === input; }
  };
}
