// Arc — scroll story.
// One pinned stage: the speedometer clip (hero), the phone arriving around it
// in landscape, turning to portrait, then the Speed, Trips, and Stats clips,
// the Settings screenshots, and Chrono. Scrolling moves the phone into place;
// from there it stays put while the clips and text crossfade. Each clip plays
// at normal speed once its step has settled, and loops; the screenshots take
// turns the same way.
(() => {
  const story = document.getElementById("story");
  const stage = story.querySelector(".stage");
  const device = stage.querySelector(".device");
  const clip = stage.querySelector(".device-clip");
  const frame = device.querySelector(".frame");
  const screen = device.querySelector(".screen");
  const light = stage.querySelector(".stage-light");
  const hint = stage.querySelector(".scroll-hint");
  const nav = document.querySelector(".nav");
  const panels = Object.fromEntries([...stage.querySelectorAll("[data-panel]")].map((el) => [el.dataset.panel, el]));
  const layers = Object.fromEntries([...stage.querySelectorAll("[data-layer]")].map((el) => [el.dataset.layer, el]));
  const styleItems = [...stage.querySelectorAll(".styles li")];
  const shotImgs = [...layers.settings.querySelectorAll("img")];
  const shotItems = [...panels.settings.querySelectorAll(".shots li")];

  // Scroll positions below are in vh of scrolling (the story is 1200vh tall,
  // less one screen).
  const SPAN = 1100;

  // Hero clip: Arc, Classic, Glow, Donut, Segment, Particle, Sport, Halo; 2 s
  // each plus a 0.5 s crossfade (encode.py), so the name changes halfway
  // through the fade.
  const SLOT = 2.5, STYLES = 8;

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

  // Settings: each screenshot shows for SHOT_MS while the step is settled.
  const SHOT_MS = 2800;
  let shot = 0, shotTimer = 0;
  function showShot(i) {
    shot = (i + shotImgs.length) % shotImgs.length;
    shotImgs.forEach((img, k) => img.classList.toggle("on", k === shot));
    shotItems.forEach((li, k) => li.classList.toggle("on", k === shot));
    // On phones only the current item shows, so the text's height changes.
    if (L && L.compact) request();
  }
  function setShots(opacity, playing) {
    const el = layers.settings;
    el.style.opacity = opacity.toFixed(3);
    if (playing && !shotTimer) {
      shotTimer = setInterval(() => showShot(shot + 1), SHOT_MS);
    } else if (!playing && shotTimer) {
      clearInterval(shotTimer);
      shotTimer = 0;
    }
    if (opacity <= 0.001 && shot !== 0) showShot(0);
  }
  shotItems.forEach((li, k) => li.addEventListener("click", () => {
    showShot(k);
    if (shotTimer) { clearInterval(shotTimer); shotTimer = setInterval(() => showShot(shot + 1), SHOT_MS); }
  }));

  const played = new Set();
  function setLayer(name, opacity, playing) {
    if (name === "settings") return setShots(opacity, playing);
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
  function preload(u) {
    const ahead = { speed: 90, trips: 250, stats: 430, chrono: 760 };
    for (const [name, at] of Object.entries(ahead)) {
      const v = layers[name];
      if (u >= at && v.preload !== "auto") { v.preload = "auto"; v.load(); }
    }
    if (u >= 600) shotImgs.forEach((img) => { img.loading = "eager"; });
  }

  function update() {
    ticking = false;
    if (!L) layout();
    const u = progress() * SPAN;
    const a = (x, y) => seg(u, x, y);
    const { vw, vh } = L;

    // Phone
    const tLand = a(36, 108);
    const tTurn = a(171, 234);
    let st = mix(L.hero, L.land, tLand);
    st = mix(st, L.port, tTurn);
    device.style.transform = `translate(${st.x - vw / 2}px, ${st.y - vh / 2}px) rotate(${st.r}deg) scale(${st.s})`;
    frame.style.opacity = a(54, 108).toFixed(3);
    const m = a(36, 90);
    screen.style.setProperty("--m0", `${lerp(74, 400, m).toFixed(1)}%`);
    screen.style.setProperty("--m1", `${lerp(100, 420, m).toFixed(1)}%`);
    light.style.opacity = (a(45, 117) * (1 - a(1028, 1100))).toFixed(3);
    light.style.setProperty("--lx", `${(st.x / vw) * 100}%`);
    hint.style.opacity = (1 - a(0, 13.5)).toFixed(3);

    // Screen
    const ops = {
      land: 1 - a(189, 225),
      speed: a(189, 225) - a(342, 369),
      trips: a(342, 369) - a(540, 567),
      stats: a(540, 567) - a(702, 729),
      settings: a(702, 729) - a(882, 909),
      chrono: a(882, 909),
    };
    // A clip plays once its step has settled (the hero clip always plays).
    const settled = { speed: [225, 360], trips: [369, 540], stats: [567, 720], settings: [729, 882], chrono: [909, 1111] };
    for (const [name, op] of Object.entries(ops)) {
      const o = clamp(op);
      const play = name === "land" ? o > 0.001 : o > 0.98 && u >= settled[name][0] && u <= settled[name][1];
      setLayer(name, o, play);
    }
    preload(u);

    // Text
    const text = {
      hero: 1 - a(22.5, 63),
      focus: a(90, 117) - a(162, 184.5),
      speed: a(220.5, 243) - a(333, 355.5),
      trips: a(355.5, 378) - a(517.5, 540),
      stats: a(549, 576) - a(697.5, 720),
      settings: a(711, 738) - a(877.5, 900),
      chrono: a(891, 918),
    };
    for (const [name, op] of Object.entries(text)) setPanel(name, clamp(op));

    // Phones and tall windows: fade the phone out above the text that's
    // showing (as much as that text is showing), so they never overlap.
    if (L.compact) {
      const none = vh + 120;
      let cut = none;
      for (const [name, op] of Object.entries(text)) {
        const o = clamp(op);
        if (o > 0.001) cut = Math.min(cut, lerp(none, panels[name].offsetTop, o));
      }
      clip.style.setProperty("--cut", `${cut.toFixed(1)}px`);
    } else {
      clip.style.removeProperty("--cut");
    }

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
  showShot(0);
  requestAnimationFrame(tick);

  // Opened from the Kebby Studios carousel: its zoom ended on this page (in an
  // iframe), with the hero clip at some time. Pick the clip up from there.
  try {
    const raw = window.top === window && sessionStorage.getItem("kebby-handoff");
    if (raw) {
      sessionStorage.removeItem("kebby-handoff");
      const h = JSON.parse(raw);
      const age = (Date.now() - h.at) / 1000;
      if (age >= 0 && age < 5 && typeof h.t === "number") {
        const v = layers.land;
        const seek = () => { try { v.currentTime = (h.t + age) % (v.duration || 40); } catch (e) {} };
        if (v.readyState >= 1) seek(); else v.addEventListener("loadedmetadata", seek, { once: true });
      }
    }
  } catch (e) {}

  // Placeholder until the App Store link exists.
  const APP_STORE_URL = "";
  document.querySelectorAll("[data-app-store]").forEach((a) => {
    if (APP_STORE_URL) { a.href = APP_STORE_URL; return; }
    a.addEventListener("click", (e) => e.preventDefault());
    a.setAttribute("title", "Arc is coming soon to the App Store");
  });
})();
