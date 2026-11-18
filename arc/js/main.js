// Arc — scroll story.
// One pinned stage: the speedometer clip (hero), the phone arriving around it
// in landscape, turning to portrait, then the Speed, Trips, Stats, and Chrono
// clips. Scrolling moves the phone into place; from there it stays put while
// the clips and text crossfade. Each clip plays at normal speed once its step
// has settled, and loops.
(() => {
  const story = document.getElementById("story");
  const stage = story.querySelector(".stage");
  const device = stage.querySelector(".device");
  const frame = device.querySelector(".frame");
  const screen = device.querySelector(".screen");
  const light = stage.querySelector(".stage-light");
  const hint = stage.querySelector(".scroll-hint");
  const nav = document.querySelector(".nav");
  const panels = Object.fromEntries([...stage.querySelectorAll("[data-panel]")].map((el) => [el.dataset.panel, el]));
  const layers = Object.fromEntries([...stage.querySelectorAll("[data-layer]")].map((el) => [el.dataset.layer, el]));
  const styleItems = [...stage.querySelectorAll(".styles li")];

  // Hero clip: Glow, Arc, Donut, Segment, Particle, Halo; 2 s each plus a
  // 0.5 s crossfade (encode.py), so the name changes halfway through the fade.
  const SLOT = 2.5, STYLES = 6;

  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const smooth = (t) => t * t * (3 - 2 * t);
  const seg = (p, a, b) => smooth(clamp((p - a) / (b - a)));
  const lerp = (a, b, t) => a + (b - a) * t;

  let L = null;

  function layout() {
    const vw = window.innerWidth;
    const vh = stage.clientHeight;
    const compact = vw < 820 || vw / vh < 1.05;
    document.documentElement.classList.toggle("compact", compact);

    // Screen 1320 × 2868 px; body 1424 × 2972 units.
    let SH = compact ? Math.min(vh * 0.54, vw * 0.58 * 2.1727) : Math.min(vh * 0.8, 880, vw * 0.36 * 2.1727);
    const SW = SH * 1320 / 2868;
    const DW = SW * 1424 / 1320;
    const DH = SH * 2972 / 2868;
    device.style.setProperty("--dw", `${DW}px`);
    device.style.setProperty("--dh", `${DH}px`);
    device.style.setProperty("--sw", `${SW}px`);
    device.style.setProperty("--sh", `${SH}px`);

    // The gauge is about 40% of the landscape screen's width, centered.
    const GAUGE = 0.4;
    const navH = 64;
    let hero, land, port;
    if (!compact) {
      const cx = vw * 0.29;
      const heroD = Math.min(vw * 0.38, vh * 0.66);
      hero = { x: cx, y: vh / 2, s: heroD / (GAUGE * SH), r: -90 };
      const landS = Math.min(1, (vw * 0.52 - 48) / DH, (vh * 0.72) / DW);
      land = { x: Math.max(cx, (landS * DH) / 2 + 32), y: vh / 2 + 8, s: landS, r: -90 };
      port = { x: cx, y: vh / 2 + 16, s: 1, r: 0 };
    } else {
      const heroD = Math.min(vw * 0.8, vh * 0.36);
      hero = { x: vw / 2, y: vh * 0.29, s: heroD / (GAUGE * SH), r: -90 };
      const landS = Math.min((vw * 0.94) / DH, 1.2);
      land = { x: vw / 2, y: vh * 0.3, s: landS, r: -90 };
      port = { x: vw / 2, y: navH + 6 + DH / 2, s: 1, r: 0 };
    }
    L = { vw, vh, compact, SW, SH, DW, DH, hero, land, port };

    // Phones get the smaller hero clip (same loop, so it can swap at any time).
    const heroVideo = layers.land;
    const want = compact ? "media/hero-sm.mp4" : "media/hero.mp4";
    if (!heroVideo.getAttribute("src").endsWith(want.slice(6))) {
      const t = heroVideo.currentTime;
      heroVideo.src = want;
      heroVideo.addEventListener("loadedmetadata", () => { heroVideo.currentTime = t; }, { once: true });
    }
  }

  const mix = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), s: lerp(a.s, b.s, t), r: lerp(a.r, b.r, t) });

  function progress() {
    const top = story.offsetTop;
    const span = story.offsetHeight - stage.clientHeight;
    return clamp((window.scrollY - top) / span);
  }

  function setPanel(name, opacity) {
    const el = panels[name];
    el.style.opacity = opacity.toFixed(3);
    el.style.visibility = opacity <= 0.001 ? "hidden" : "visible";
    const rise = (1 - opacity) * 18;
    el.style.transform = L.compact ? `translateY(${rise}px)` : `translateY(calc(-50% + ${rise}px))`;
  }

  const played = new Set();
  function setLayer(name, opacity, playing) {
    const v = layers[name];
    v.style.opacity = name === "land" ? "" : opacity.toFixed(3);
    if (name === "land") v.style.visibility = opacity <= 0.001 ? "hidden" : "visible";
    if (name === "land") v.style.opacity = opacity.toFixed(3);
    if (playing) {
      if (v.preload !== "auto") { v.preload = "auto"; }
      if (v.paused) {
        if (!played.has(name) && name !== "land") { try { v.currentTime = 0; } catch (e) {} }
        played.add(name);
        const pr = v.play();
        if (pr && pr.catch) pr.catch(() => {});
      }
    } else {
      if (!v.paused) v.pause();
      if (opacity <= 0.001 && name !== "land") played.delete(name);
    }
  }

  // Load the next clips a little before they're needed.
  function preload(p) {
    const ahead = { speed: 0.1, trips: 0.28, stats: 0.48, chrono: 0.66 };
    for (const [name, at] of Object.entries(ahead)) {
      const v = layers[name];
      if (p >= at && v.preload !== "auto") { v.preload = "auto"; v.load(); }
    }
  }

  function update() {
    ticking = false;
    if (!L) layout();
    const p = progress();
    const { vw, vh, compact } = L;

    // Phone
    const tLand = seg(p, 0.04, 0.12);
    const tTurn = seg(p, 0.19, 0.26);
    let st = mix(L.hero, L.land, tLand);
    st = mix(st, L.port, tTurn);
    device.style.transform = `translate(${st.x - vw / 2}px, ${st.y - vh / 2}px) rotate(${st.r}deg) scale(${st.s})`;
    frame.style.opacity = seg(p, 0.06, 0.12).toFixed(3);
    const m = seg(p, 0.04, 0.1);
    screen.style.setProperty("--m0", `${lerp(74, 400, m).toFixed(1)}%`);
    screen.style.setProperty("--m1", `${lerp(100, 420, m).toFixed(1)}%`);
    light.style.opacity = (seg(p, 0.05, 0.13) * (1 - seg(p, 0.92, 1))).toFixed(3);
    light.style.setProperty("--lx", `${(st.x / vw) * 100}%`);
    hint.style.opacity = (1 - seg(p, 0, 0.015)).toFixed(3);

    // Screen
    const a = (x, y) => seg(p, x, y);
    const ops = {
      land: 1 - a(0.21, 0.25),
      speed: a(0.21, 0.25) - a(0.38, 0.41),
      trips: a(0.38, 0.41) - a(0.6, 0.63),
      stats: a(0.6, 0.63) - a(0.78, 0.81),
      chrono: a(0.78, 0.81),
    };
    // A clip plays once its step has settled (the hero clip always plays).
    const settled = { speed: [0.25, 0.4], trips: [0.41, 0.6], stats: [0.63, 0.8], chrono: [0.81, 1.01] };
    for (const [name, op] of Object.entries(ops)) {
      const o = clamp(op);
      const play = name === "land" ? o > 0.001 : o > 0.98 && p >= settled[name][0] && p <= settled[name][1];
      setLayer(name, o, play);
    }
    preload(p);

    // Text
    setPanel("hero", 1 - a(0.025, 0.07));
    setPanel("focus", a(0.1, 0.13) - a(0.18, 0.205));
    setPanel("speed", a(0.245, 0.27) - a(0.37, 0.395));
    setPanel("chrono", a(0.8, 0.83));
    setPanel("trips", a(0.395, 0.42) - a(0.575, 0.6));
    setPanel("stats", a(0.61, 0.64) - a(0.775, 0.8));

    nav.classList.toggle("solid", window.scrollY > story.offsetTop + story.offsetHeight - vh * 1.05);
  }

  // Hero style names follow the clip.
  function tick() {
    const v = layers.land;
    if (!v.paused && styleItems.length) {
      const t = v.currentTime % (SLOT * STYLES);
      const i = Math.floor(t / SLOT) % STYLES;
      const local = t - i * SLOT;
      const shown = local > SLOT - 0.25 ? (i + 1) % STYLES : i;
      styleItems.forEach((li, k) => li.classList.toggle("on", k === shown));
    }
    requestAnimationFrame(tick);
  }

  let ticking = false;
  const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  window.addEventListener("scroll", request, { passive: true });
  window.addEventListener("resize", () => { layout(); request(); });
  layout();
  update();
  styleItems[0] && styleItems[0].classList.add("on");
  requestAnimationFrame(tick);

  // Placeholder until the App Store link exists.
  const APP_STORE_URL = "";
  document.querySelectorAll("[data-app-store]").forEach((a) => {
    if (APP_STORE_URL) { a.href = APP_STORE_URL; return; }
    a.addEventListener("click", (e) => e.preventDefault());
    a.setAttribute("title", "Arc is coming soon to the App Store");
  });
})();
