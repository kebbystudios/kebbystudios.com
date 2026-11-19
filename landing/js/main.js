// Kebby Studios — the carousel.
//
// One continuous position (`pos`, in cards) drives everything: where each card
// sits and how large it is, the dial's ticks, and the name. Wheel,
// trackpad, drag, swipe, and the arrow keys move a target; `pos` eases toward
// it and settles on a whole card.
//
// Opening an app: the card grows to fill the window while the app's real page
// (preloaded in an iframe at window size, scaled to cover the card) fades in
// over it. When the card fills the window, the iframe is exactly the page that
// loads next, so navigating to it shows no cut. Browsers with cross-document
// view transitions also crossfade the two identical frames, and the Arc page
// picks up its hero clip where the iframe left it (arc/js/main.js).
(() => {
  const root = document.documentElement;
  const body = document.body;
  const track = document.getElementById("track");
  const stage = document.getElementById("stage");
  const rollEl = document.getElementById("roll");
  const kindEl = document.getElementById("kind");
  const ticksEl = document.getElementById("ticks");
  const hint = document.querySelector(".hint");
  const cursor = document.querySelector(".cursor");
  const aboutBtn = document.querySelector(".about-btn");
  const about = document.getElementById("about");
  const ambL = document.querySelector(".amb-l");
  const ambR = document.querySelector(".amb-r");

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;

  // Fallback colors for cards without a video to sample: [left, right, needle].
  const AMBIENT = {
    arc: ["#0f2a3c", "#0b2233", "#5cc8ff"],
    soon: ["#1e1834", "#2a2150", "#b9a8ff"],
    studypass: ["#3a1f2e", "#221a55", "#c3b4ff"],
    studio: ["#2c1f14", "#21170f", "#f0b37e"],
  };

  // ---------- Slots: the cards, repeated so the loop never shows a seam ----------
  const originals = [...track.children];
  const UNIQUE = originals.length;
  const MIN_SLOTS = 7;
  const reps = Math.max(1, Math.ceil(MIN_SLOTS / UNIQUE));
  for (let r = 1; r < reps; r++) {
    for (const li of originals) {
      const copy = li.cloneNode(true);
      copy.setAttribute("aria-hidden", "true");
      copy.querySelector("a").tabIndex = -1;
      track.appendChild(copy);
    }
  }
  const slots = [...track.children].map((el, k) => ({
    el,
    k,
    u: k % UNIQUE,
    id: el.dataset.id,
    href: el.dataset.href || null,
    media: el.querySelector(".card-media"),
    video: el.querySelector("video"),
    hover: 0,
    hoverTo: 0,
    px: 0, py: 0, pxTo: 0, pyTo: 0,
    d: 0,
  }));
  const N = slots.length;

  // ---------- Layout ----------
  let vw = 0, vh = 0, cw = 0, ch = 0, X1 = 0, X2 = 0, narrow = false;
  const SIDE = 0.64; // scale of the cards beside the center
  function layout() {
    vw = window.innerWidth;
    vh = window.innerHeight;
    // Phones get tall (4:5) cards and clips; everything else, 16:9.
    narrow = vw < 700 && vh > vw;
    cw = narrow ? Math.min(vw * 0.78, (vh - 250) * 0.8) : Math.min(vw * 0.56, 1180, (vh - 250) * 16 / 9);
    ch = narrow ? cw * 1.25 : cw * 9 / 16;
    root.style.setProperty("--cw", `${cw}px`);
    root.style.setProperty("--ch", `${ch}px`);
    const gap = Math.max(18, cw * 0.06);
    X1 = (cw * (1 + SIDE)) / 2 + gap;
    X2 = cw * SIDE + gap;
    for (const s of slots) {
      if (!s.video) continue;
      const poster = narrow && s.video.dataset.posterTall;
      if (poster && !s.video.dataset.posterWide) s.video.dataset.posterWide = s.video.getAttribute("poster");
      if (s.video.dataset.posterWide) s.video.poster = poster || s.video.dataset.posterWide;
      if (s.video.dataset.chosen) chooseSource(s);
    }
  }

  // ---------- Motion state ----------
  let pos = reduce ? 0 : 2.6;     // intro: the dial spins in and lands on Arc
  let target = 0;
  let lastIndex = -1;
  let dragging = false;
  let opening = null;             // the open animation, when running
  let intro = reduce ? 1 : 0;     // 0 → 1, cards fading in
  let pointer = { x: -1, y: -1, inside: false, nx: 0, ny: 0 };
  let sway = 0, swayTo = 0;       // the whole row leans a little toward the cursor

  const wrap = (d) => { d = ((d % N) + N) % N; return d > N / 2 ? d - N : d; };
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const smooth = (t) => t * t * (3 - 2 * t);
  const easeInOut = (t) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2);
  const easeOut = (t) => 1 - (1 - t) ** 3;
  const lerp = (a, b, t) => a + (b - a) * t;

  function placement(d) {
    const ad = Math.abs(d);
    const x = Math.sign(d) * (ad <= 1 ? ad * X1 : X1 + (ad - 1) * X2);
    const s = 1 - (1 - SIDE) * Math.min(ad, 1);
    const dim = Math.min(ad, 1) * 0.38 + Math.max(0, ad - 1) * 0.35;
    return { x, s, dim, ad };
  }

  // ---------- Video ----------
  function chooseSource(s) {
    const v = s.video;
    const small = cw * Math.min(2, window.devicePixelRatio || 1) < 1300;
    const want = narrow && v.dataset.srcTall ? v.dataset.srcTall : small ? v.dataset.srcSm : v.dataset.src;
    if (v.dataset.chosen === want) return;
    const t = v.currentTime || 0;
    v.dataset.chosen = want;
    v.src = want;
    if (t) v.addEventListener("loadedmetadata", () => { v.currentTime = t; }, { once: true });
  }
  function setPlaying(s, on) {
    const v = s.video;
    if (!v) return;
    if (on) {
      if (!v.dataset.chosen) chooseSource(s);
      if (v.paused) { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
    } else if (!v.paused) {
      v.pause();
    }
  }

  // ---------- Ambient light: sampled from the centered card's video ----------
  const sampler = document.createElement("canvas");
  sampler.width = 16; sampler.height = 9;
  const sctx = sampler.getContext("2d", { willReadFrequently: true });
  let lastSample = 0;
  function tint(rgb) {
    // Keep the hue; set the saturation and lightness: a glow, never a wash.
    const [r, g, b] = rgb.map((c) => c / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let hue = 0;
    if (mx - mn > 0.01) {
      if (mx === r) hue = ((g - b) / (mx - mn)) % 6;
      else if (mx === g) hue = (b - r) / (mx - mn) + 2;
      else hue = (r - g) / (mx - mn) + 4;
    }
    const sat = mx - mn > 0.04 ? 55 : 8;
    return `hsl(${Math.round(hue * 60 + 360) % 360} ${sat}% 13%)`;
  }
  function sampleAmbient(s, now) {
    if (now - lastSample < 160) return;
    lastSample = now;
    const fall = AMBIENT[s.id] || AMBIENT.studio;
    const v = s.video;
    let left = null, right = null;
    if (v && v.readyState >= 2 && !v.paused) {
      try {
        sctx.drawImage(v, 0, 0, 16, 9);
        const px = sctx.getImageData(0, 0, 16, 9).data;
        const acc = [[0, 0, 0, 0], [0, 0, 0, 0]];
        for (let i = 0; i < px.length; i += 4) {
          const r = px[i], g = px[i + 1], b = px[i + 2];
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          // Weight colorful, bright pixels: the gauge glow, the route line.
          const w = ((mx - mn) / 255) * (mx / 255) + 0.002;
          const side = ((i / 4) % 16) < 8 ? 0 : 1;
          acc[side][0] += r * w; acc[side][1] += g * w; acc[side][2] += b * w; acc[side][3] += w;
        }
        [left, right] = acc.map((a) => [a[0] / a[3], a[1] / a[3], a[2] / a[3]]);
      } catch (e) { /* not ready */ }
    }
    ambL.style.backgroundColor = left ? tint(left) : fall[0];
    ambR.style.backgroundColor = right ? tint(right) : fall[1];
    root.style.setProperty("--needle", fall[2]);
  }

  // ---------- Dial and name ----------
  const TICK = 48;
  function setDial() {
    const off = ((pos * TICK) % TICK + TICK) % TICK;
    ticksEl.style.transform = `translate3d(${120 - off - TICK * 10}px,0,0)`;
  }
  let rollDir = 1;
  function setName(u, dir) {
    const li = originals[u];
    const old = rollEl.querySelector("span.in");
    const span = document.createElement("span");
    span.textContent = li.dataset.name;
    span.className = "in";
    if (old && !reduce) {
      span.style.transform = `translateY(${dir * 100}%)`;
      span.style.opacity = "0";
      rollEl.appendChild(span);
      old.classList.remove("in");
      requestAnimationFrame(() => {
        span.style.transform = "";
        span.style.opacity = "";
        old.style.transform = `translateY(${-dir * 100}%)`;
        old.style.opacity = "0";
      });
      setTimeout(() => old.remove(), 600);
    } else {
      rollEl.textContent = "";
      rollEl.appendChild(span);
    }
    kindEl.textContent = li.dataset.kind;
  }

  // ---------- Frame ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const k = 1 - Math.exp(-dt * (dragging ? 30 : 9));
    const prev = pos;
    pos = lerp(pos, target, k);
    if (Math.abs(pos - target) < 0.0005) pos = target;
    if (intro < 1) intro = Math.min(1, intro + dt / 1.1);
    sway = lerp(sway, swayTo, 1 - Math.exp(-dt * 4));

    const center = Math.round(pos);
    const u = ((center % UNIQUE) + UNIQUE) % UNIQUE;
    if (u !== lastIndex) {
      setName(u, pos >= prev ? 1 : -1);
      lastIndex = u;
    }
    setDial();

    for (const s of slots) {
      if (opening && opening.slot === s) continue;
      const d = wrap(s.k - pos);
      s.d = d;
      const p = placement(d);
      s.hover = lerp(s.hover, s.hoverTo, 1 - Math.exp(-dt * 10));
      s.px = lerp(s.px, s.pxTo, 1 - Math.exp(-dt * 6));
      s.py = lerp(s.py, s.pyTo, 1 - Math.exp(-dt * 6));
      const zoom = 1 + s.hover * (p.ad < 0.5 ? 0.036 : 0.09);
      let x = p.x + sway * (1 - Math.min(p.ad, 1) * 0.4);
      let op = p.ad > 2.4 ? 0 : 1;
      // Intro: cards rise in from the right, nearest first.
      const ii = smooth(clamp(intro * 1.6 - p.ad * 0.25));
      op *= ii;
      let y = (1 - ii) * 40;
      if (opening) {
        // The rest of the row parts and fades.
        const e = opening.e;
        x += Math.sign(d) * e * vw * 0.25;
        op *= 1 - clamp(e * 2);
      }
      const el = s.el;
      el.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) scale(${(p.s * zoom).toFixed(4)})`;
      el.style.opacity = op.toFixed(3);
      el.style.visibility = op <= 0.001 ? "hidden" : "visible";
      el.style.zIndex = String(100 - Math.round(p.ad * 10));
      el.style.setProperty("--dim", (p.dim * (1 - s.hover * 0.6)).toFixed(3));
      s.media.style.setProperty("--px", `${s.px.toFixed(2)}px`);
      s.media.style.setProperty("--py", `${s.py.toFixed(2)}px`);
      setPlaying(s, p.ad < 1.6 && op > 0);
    }

    const cs = slots.find((s) => Math.abs(wrap(s.k - pos)) < 0.5);
    if (cs) sampleAmbient(cs, now);
    if (opening) stepOpening(now);
    updateCursor();
    maybePreload(now, cs);
    requestAnimationFrame(frame);
  }

  // ---------- Input: wheel and trackpad ----------
  let snapTimer = 0;
  let gestureBase = null;
  let interacted = false;
  function nudged() {
    if (!interacted) { interacted = true; hint && hint.classList.add("gone"); }
  }
  function snap() {
    // Settle in the direction of travel, so one notch of a wheel is one card.
    const diff = target - gestureBase;
    if (Math.abs(diff) < 0.06) target = gestureBase;
    else target = diff > 0 ? Math.ceil(target - 0.2) : Math.floor(target + 0.2);
    gestureBase = null;
  }
  stage.addEventListener("wheel", (e) => {
    if (opening || body.classList.contains("about-open")) return;
    e.preventDefault();
    let delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (e.deltaMode === 1) delta *= 16;
    else if (e.deltaMode === 2) delta *= vh;
    delta = clamp(delta, -140, 140);
    if (gestureBase === null) gestureBase = Math.round(target);
    // Up and left go back; down and right go on.
    target += delta / 840;
    nudged();
    clearTimeout(snapTimer);
    snapTimer = setTimeout(snap, 140);
  }, { passive: false });

  // ---------- Input: drag and swipe ----------
  let down = null;
  let moved = false;
  let pressedSettled = false;
  stage.addEventListener("pointerdown", (e) => {
    if (opening || e.button !== 0) return;
    down = { x: e.clientX, y: e.clientY, t: target, axis: null, hist: [[e.clientX, e.clientY, performance.now()]] };
    moved = false;
  });
  window.addEventListener("pointermove", (e) => {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (!down.axis && Math.hypot(dx, dy) > 6) {
      down.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
      dragging = true;
      moved = true;
      nudged();
    }
    if (!down.axis) return;
    const delta = down.axis === "x" ? dx : dy;
    target = down.t - delta / X1;
    down.hist.push([e.clientX, e.clientY, performance.now()]);
    if (down.hist.length > 6) down.hist.shift();
  });
  const release = () => {
    if (!down) return;
    if (dragging) {
      const h = down.hist;
      const a = h[0], b = h[h.length - 1];
      const dtm = Math.max(16, b[2] - a[2]);
      const v = (down.axis === "x" ? b[0] - a[0] : b[1] - a[1]) / dtm; // px per ms
      target = Math.round(target - (v * 220) / X1);
    }
    dragging = false;
    down = null;
  };
  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", release);

  // Links and clips aren't draggable here; dragging turns the carousel.
  track.addEventListener("dragstart", (e) => e.preventDefault());

  // ---------- Input: click ----------
  track.addEventListener("click", (e) => {
    const a = e.target.closest(".card-link");
    if (!a) return;
    if (moved) { e.preventDefault(); moved = false; return; }
    const s = slots.find((x) => x.el.contains(a));
    if (!s) return;
    // Let the browser handle new-tab clicks on real links.
    if (s.href && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1)) return;
    e.preventDefault();
    const d = wrap(s.k - pos);
    // Mouse and touch clicks carry a count in e.detail; Enter on a focused link doesn't.
    const settled = e.detail ? pressedSettled && e.detail === 1 : Math.abs(d) < 0.5;
    if (!settled) { target = Math.round(pos + d); nudged(); return; }
    activate(s);
  });

  function activate(s) {
    if (s.href) return open(s);
    if (s.id === "studio") return toggleAbout(true);
    // Not out yet: a small shake, like a locked door.
    const el = s.el;
    el.animate([
      { translate: "0 0" }, { translate: "-10px 0" }, { translate: "8px 0" }, { translate: "-4px 0" }, { translate: "0 0" },
    ], { duration: 420, easing: "ease-out" });
  }

  // ---------- Keyboard ----------
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && body.classList.contains("about-open")) return toggleAbout(false);
    if (opening || body.classList.contains("about-open")) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { target = Math.round(target) + 1; nudged(); e.preventDefault(); }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") { target = Math.round(target) - 1; nudged(); e.preventDefault(); }
  });
  // Tabbing to a card brings it to the center.
  track.addEventListener("focusin", (e) => {
    const s = slots.find((x) => x.el.contains(e.target));
    if (s) target = Math.round(pos + wrap(s.k - pos));
  });

  // ---------- Cursor ----------
  let cx = -100, cy = -100;
  const useCursor = finePointer && !reduce;
  if (useCursor) body.classList.add("has-cursor");
  window.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.inside = true;
    swayTo = ((e.clientX / vw) - 0.5) * -18;
    if (cx < -50) { cx = e.clientX; cy = e.clientY; }
    hoverTest();
  });
  document.addEventListener("pointerleave", () => { pointer.inside = false; swayTo = 0; hoverTest(); });
  function hoverTest() {
    let hit = null;
    if (pointer.inside && !opening && !body.classList.contains("about-open")) {
      const el = document.elementFromPoint(pointer.x, pointer.y);
      const li = el && el.closest(".card");
      hit = li ? slots.find((s) => s.el === li) : null;
    }
    for (const s of slots) {
      const on = s === hit;
      s.hoverTo = on ? 1 : 0;
      if (on && !reduce) {
        const r = s.el.getBoundingClientRect();
        const nx = (pointer.x - r.left) / r.width - 0.5;
        const ny = (pointer.y - r.top) / r.height - 0.5;
        // The picture drifts against the cursor, like looking through a window.
        // Capped so the oversized picture never shows its edge on a small card.
        const w = s.el.offsetWidth, hh = s.el.offsetHeight;
        s.pxTo = -nx * Math.min(28, w * 0.075); s.pyTo = -ny * Math.min(20, hh * 0.075);
      } else { s.pxTo = 0; s.pyTo = 0; }
    }
    // A plain circle: full over the centered card, smaller over the neighbors.
    const cls = hit ? (Math.abs(wrap(hit.k - pos)) < 0.5 ? "big" : "mid") : "";
    cursor.classList.toggle("big", cls === "big");
    cursor.classList.toggle("mid", cls === "mid");
    cursor.classList.toggle("on", pointer.inside && !opening && !body.classList.contains("about-open"));
  }
  function updateCursor() {
    if (!useCursor) return;
    cx = lerp(cx, pointer.x, 0.28);
    cy = lerp(cy, pointer.y, 0.28);
    cursor.style.transform = `translate3d(${cx.toFixed(1)}px,${cy.toFixed(1)}px,0)`;
    // While the carousel moves under a still cursor, keep the hover honest.
    if (pointer.inside && Math.abs(pos - target) > 0.001) hoverTest();
  }

  // ---------- About ----------
  aboutBtn.innerHTML = "<span>About</span><span>Close</span>";
  function toggleAbout(on) {
    body.classList.toggle("about-open", on);
    aboutBtn.setAttribute("aria-expanded", String(on));
    about.setAttribute("aria-hidden", String(!on));
    hoverTest();
    if (on) about.querySelector("a").focus({ preventScroll: true });
  }
  aboutBtn.addEventListener("click", () => toggleAbout(!body.classList.contains("about-open")));
  about.addEventListener("click", (e) => { if (e.target === about) toggleAbout(false); });

  // ---------- Handoff iframe ----------
  // Built once Arc has sat in the center for a moment (or on press), so the
  // page is ready by the time the zoom finishes.
  const handoffs = new Map(); // href → { frame, ready }
  let settledSince = 0, settledId = null;
  function maybePreload(now, cs) {
    if (!cs || !cs.href || opening) { settledId = null; return; }
    if (settledId !== cs.k) { settledId = cs.k; settledSince = now; return; }
    const conn = navigator.connection;
    if (conn && (conn.saveData || /2g/.test(conn.effectiveType || ""))) return;
    if (now - settledSince > 1200 && Math.abs(pos - target) < 0.01) prepare(cs.href);
  }
  stage.addEventListener("pointerdown", (e) => {
    const li = e.target.closest(".card");
    const s = li && slots.find((x) => x.el === li);
    // Only a card that was already centered and at rest when pressed opens;
    // a press on a neighbor (or on one still sliding in) just centers it.
    pressedSettled = !!s && Math.abs(wrap(s.k - pos)) < 0.5 && Math.abs(target - pos) < 0.08;
    if (s && s.href && pressedSettled) prepare(s.href);
  });
  function heroOf(h) {
    try { return h.frame.contentDocument.querySelector("video[data-layer='land']"); } catch (e) { return null; }
  }
  function prepare(href) {
    if (handoffs.has(href)) return handoffs.get(href);
    const frame = document.createElement("iframe");
    frame.className = "handoff";
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.title = "";
    const h = { frame, ready: false, href };
    handoffs.set(href, h);
    frame.addEventListener("load", () => {
      const v = heroOf(h);
      const done = () => {
        h.ready = true;
        // Hold the clip on its first frame until the zoom starts.
        if (v && !(opening && opening.h === h)) { v.pause(); try { v.currentTime = 0; } catch (e) {} }
      };
      if (!v || v.readyState >= 2) done();
      else v.addEventListener("loadeddata", done, { once: true });
    });
    frame.src = href;
    return h;
  }
  function sizeHandoff(frameEl, w, h) {
    // Window-sized page, scaled to cover the card's current box.
    const sc = Math.max(w / vw, h / vh);
    frameEl.style.width = `${vw}px`;
    frameEl.style.height = `${vh}px`;
    frameEl.style.transform = `translate(-50%,-50%) scale(${sc.toFixed(5)})`;
  }

  // ---------- Opening ----------
  const OPEN_MS = reduce ? 450 : 1150;
  function open(s) {
    if (opening) return;
    const h = prepare(s.href);
    const r = s.el.getBoundingClientRect();
    // Bake the carousel transform into a plain box, then grow the box.
    const from = { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
    const el = s.el;
    el.style.transform = "none";
    el.style.margin = "0";
    el.style.zIndex = "200";
    el.style.setProperty("--dim", "0");
    s.media.style.setProperty("--px", "0px");
    s.media.style.setProperty("--py", "0px");
    if (h.frame.parentNode !== el) el.appendChild(h.frame);
    opening = { slot: s, h, from, start: performance.now(), e: 0, fade: 0, waitStart: 0, reverse: false };
    applyBox(opening, from, 0);
    body.classList.add("opening");
    cursor.classList.remove("on");
    startHero(h);
  }
  function startHero(h) {
    const v = heroOf(h);
    if (!v) return;
    try { v.currentTime = 0; } catch (e) {}
    const pr = v.play();
    if (pr && pr.catch) pr.catch(() => {});
  }
  function boxAt(o, e) {
    const f = o.from;
    return {
      x: lerp(f.x, vw / 2, e), y: lerp(f.y, vh / 2, e),
      w: lerp(f.w, vw, e), h: lerp(f.h, vh, e),
    };
  }
  function applyBox(o, b, e) {
    const el = o.slot.el;
    el.style.left = `${b.x - b.w / 2}px`;
    el.style.top = `${b.y - b.h / 2}px`;
    el.style.width = `${b.w}px`;
    el.style.height = `${b.h}px`;
    el.style.borderRadius = `${14 * (1 - e)}px`;
    el.style.opacity = "1";
    el.style.visibility = "visible";
    sizeHandoff(o.h.frame, b.w, b.h);
  }
  function stepOpening(now) {
    const o = opening;
    const t = clamp((now - o.start) / OPEN_MS);
    const e = reduce ? 1 : easeInOut(o.reverse ? 1 - t : t);
    o.e = e;
    applyBox(o, boxAt(o, e), e);
    if (o.reverse) {
      o.h.frame.style.opacity = (1 - clamp(t / 0.45)).toFixed(3);
      if (t >= 1) finishClose();
      return;
    }
    // The page fades in while the card is still near its size (the zoom
    // eases in), so the camera then moves into the page itself.
    if (o.h.ready) o.fade = Math.min(1, o.fade + 1 / 24);
    o.h.frame.style.opacity = (reduce ? o.fade : Math.min(o.fade, smooth(clamp((t - 0.02) / 0.2)))).toFixed(3);
    if (t < 1) return;
    if (o.fade >= 1 || (o.waitStart && now - o.waitStart > 2500)) return go(o);
    if (!o.waitStart) o.waitStart = now;
  }
  function go(o) {
    if (o.gone) return;
    o.gone = true;
    const v = heroOf(o.h);
    try {
      sessionStorage.setItem("kebby-handoff", JSON.stringify({
        href: o.h.href, t: v ? v.currentTime : 0, at: Date.now(),
      }));
    } catch (e) {}
    location.href = o.h.href;
  }

  // Back from the app: zoom back out into the carousel.
  function reverseFrom(s, h) {
    const el = s.el;
    el.style.transform = "none";
    el.style.margin = "0";
    el.style.zIndex = "200";
    // Where the card will rest once it's back in the row.
    target = pos = s.k;
    const from = { x: vw / 2, y: (vh / 2 - 18), w: cw, h: ch };
    opening = { slot: s, h, from, start: performance.now(), e: 1, fade: 1, reverse: true };
    body.classList.add("opening");
    if (h.frame.parentNode !== el) el.appendChild(h.frame);
    const v = heroOf(h);
    if (v) v.pause();
    requestAnimationFrame(() => body.classList.remove("opening"));
  }
  function finishClose() {
    const s = opening.slot;
    const el = s.el;
    for (const k of ["left", "top", "width", "height", "borderRadius", "margin", "zIndex"]) el.style[k] = "";
    opening.h.frame.style.opacity = "0";
    opening = null;
    body.classList.remove("opening");
    hoverTest();
  }
  window.addEventListener("pageshow", (e) => {
    if (!e.persisted) return;
    last = performance.now();
    if (opening && !opening.reverse) {
      const o = opening;
      opening = null;
      reverseFrom(o.slot, o.h);
    }
  });

  window.addEventListener("resize", () => {
    layout();
    if (opening) applyBox(opening, boxAt(opening, opening.e), opening.e);
  });

  layout();
  // Arriving from an app's site: start on that app.
  try {
    const ref = document.referrer && new URL(document.referrer);
    if (ref && ref.origin === location.origin) {
      const s = slots.find((x) => x.href && ref.pathname.startsWith(new URL(x.href, location.href).pathname));
      if (s) { pos = target = s.k; intro = 0.4; }
    }
  } catch (e) {}
  requestAnimationFrame((t) => { last = t; frame(t); });
})();
