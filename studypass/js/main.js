/* StudyPass page. No dependencies.
 * - Copies the phone template into each [data-phone] and drives its screens.
 * - Hero: the study ring counts down, then the pass gets its Unlocked stamp; cursor parallax.
 * - Reveal blocks (html.story only): the circle behind the title grows into the screen, then the steps play.
 */
(() => {
  "use strict";
  const root = document.documentElement;
  const story = root.classList.contains("story");
  const C = 2 * Math.PI * 44; // ring circumference (r = 44 in a 100 viewBox)
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ease = (t) => 1 - Math.pow(1 - t, 3);

  /* ---------- phones ---------- */
  const tpl = document.getElementById("phone-tpl");
  let n = 0;
  document.querySelectorAll("[data-phone]").forEach((el) => {
    el.innerHTML = tpl.innerHTML.replaceAll("__N__", String(++n));
  });

  function setRing(phone, kind, value, max) {
    const scr = phone.querySelector(".scr-" + kind);
    if (!scr) return;
    const num = scr.querySelector("[data-num]");
    const arc = scr.querySelector(".ring-arc");
    if (num) num.textContent = String(value);
    if (arc) arc.style.strokeDashoffset = String(C * (1 - clamp(value / max)));
  }
  function setScreen(phone, s) {
    if (phone.dataset.screen !== s) phone.dataset.screen = s;
  }
  const MAX = { free: 10, study: 10 }; // 10 min of App Time, 10 min of Study Time
  document.querySelectorAll("[data-phone]").forEach((p) => {
    setRing(p, "free", 8, MAX.free);
    setRing(p, "study", 6, MAX.study);
  });

  /* ---------- header ---------- */
  const top = document.getElementById("top");
  const hero = document.getElementById("hero");
  const menuBtn = top.querySelector(".menu-btn");
  const menu = document.getElementById("menu");
  function onScrollHeader() {
    const y = window.scrollY;
    top.classList.toggle("scrolled", y > 8);
    top.classList.toggle("show-pill", y > hero.offsetHeight * 0.55);
  }
  function setMenu(open) {
    menuBtn.setAttribute("aria-expanded", String(open));
    menu.hidden = !open;
    document.body.style.overflow = open ? "hidden" : "";
  }
  menuBtn.addEventListener("click", () => setMenu(menu.hidden));
  menu.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { setMenu(false); menuBtn.focus(); } });
  matchMedia("(min-width: 861px)").addEventListener("change", (e) => { if (e.matches) setMenu(false); });

  /* ---------- in view (intro, why blocks) ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
  }, { threshold: 0.35 });
  document.querySelectorAll(".intro, .why-block").forEach((el) => io.observe(el));

  /* ---------- hero ---------- */
  const heroPhone = document.querySelector(".phone-hero");
  const pass = document.querySelector(".pass");
  if (story && heroPhone) {
    let left = MAX.study, timer = 0, visible = true;
    const step = () => {
      if (!visible) { timer = setTimeout(step, 600); return; }
      if (left > 0) {
        left -= 1;
        setScreen(heroPhone, "study");
        setRing(heroPhone, "study", left, MAX.study);
        if (left === 0) {
          timer = setTimeout(() => {
            setScreen(heroPhone, "free");
            setRing(heroPhone, "free", MAX.free, MAX.free);
            pass.classList.add("earned");
            timer = setTimeout(() => {
              pass.classList.remove("earned");
              left = MAX.study;
              setScreen(heroPhone, "study");
              setRing(heroPhone, "study", MAX.study, MAX.study);
              timer = setTimeout(step, 1400);
            }, 4200);
          }, 700);
          return;
        }
      }
      timer = setTimeout(step, 1000);
    };
    setRing(heroPhone, "study", MAX.study, MAX.study);
    timer = setTimeout(step, 1600);
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(hero);

    // Parallax: the phone and the pass drift in opposite directions with the cursor.
    if (matchMedia("(pointer: fine)").matches) {
      hero.addEventListener("pointermove", (e) => {
        const r = hero.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        heroPhone.style.translate = `${(-x * 16).toFixed(1)}px ${(-y * 12).toFixed(1)}px`;
        pass.style.translate = `${(x * 18).toFixed(1)}px ${(y * 18).toFixed(1)}px`;
      });
      hero.addEventListener("pointerleave", () => { heroPhone.style.translate = ""; pass.style.translate = ""; });
    }
  }

  /* ---------- reveal blocks ---------- */
  const reveals = [...document.querySelectorAll(".reveal")].map((sec) => {
    const steps = [...sec.querySelectorAll(".step")];
    const dots = document.createElement("div");
    dots.className = "step-dots";
    dots.setAttribute("aria-hidden", "true");
    steps.forEach(() => dots.appendChild(document.createElement("i")));
    sec.querySelector(".reveal-inner").appendChild(dots);
    return {
      sec, steps, dots: [...dots.children],
      weights: steps.map((st) => +(st.dataset.weight || 1)), // how much scroll each step gets
      pin: sec.querySelector(".reveal-pin"),
      title: sec.querySelector(".reveal-title"),
      mask: sec.querySelector(".reveal-mask"),
      inner: sec.querySelector(".reveal-inner"),
      stage: sec.querySelector(".reveal-stage"),
      phone: sec.querySelector("[data-phone]"),
      last: -1,
    };
  });

  function sizeReveals() {
    reveals.forEach((r) => {
      r.stage.style.setProperty("--pw-half", r.phone.offsetWidth / 2 + "px");
    });
  }

  function playStep(r, step, local) {
    const p = r.phone;
    const kind = step.dataset.count;
    if (kind) {
      const from = +step.dataset.from, to = +step.dataset.to;
      const max = MAX[kind];
      // Study counts down in the first half, then the unlocked screen holds for the rest.
      if (kind === "study" && local > 0.55) {
        // Study done: back to Free Time, one more session counted.
        setScreen(p, "free");
        setRing(p, "free", MAX.free, MAX.free);
        const sess = p.querySelector(".scr-free [data-sess]");
        if (sess) sess.textContent = "2 of 3 study sessions done today";
        return;
      }
      const v = Math.round(from + (to - from) * clamp(local / (kind === "study" ? 0.5 : 0.75)));
      setScreen(p, kind);
      setRing(p, kind, v, max);
      return;
    }
    if (step.hasAttribute("data-cards")) {
      // The shield first, its button pressed, then the study app.
      if (local < 0.28) {
        setScreen(p, "shield");
        p.classList.toggle("tap", local > 0.14);
        p.classList.remove("flip");
      } else {
        p.classList.remove("tap");
        setScreen(p, "cards");
        p.classList.toggle("flip", local > 0.58);
        const bar = p.querySelector("[data-fc-bar]");
        if (bar) bar.style.width = (35 + clamp((local - 0.28) / 0.7) * 25).toFixed(1) + "%";
      }
      return;
    }
    setScreen(p, step.dataset.screen);
  }

  function updateReveals() {
    const vh = window.innerHeight;
    reveals.forEach((r) => {
      const rect = r.sec.getBoundingClientRect();
      if (rect.bottom < -50 || rect.top > vh + 50) return;
      const p = clamp(-rect.top / (rect.height - vh));

      // 1. The circle behind the title grows into the full screen; the title fades as it goes.
      const pin = r.pin.getBoundingClientRect();
      const r0 = parseFloat(getComputedStyle(r.title).fontSize) * 2.2; // matches the 4.4em circle in CSS
      const rEnd = Math.hypot(pin.width, pin.height) / 2 + 2;
      const e = ease(clamp((p - 0.025) / 0.12));
      r.mask.style.clipPath = `circle(${(r0 + (rEnd - r0) * e).toFixed(1)}px at 50% 50%)`;
      r.title.style.opacity = (1 - clamp(e / 0.45)).toFixed(3);
      r.inner.style.opacity = clamp((p - 0.1) / 0.06).toFixed(3);

      // 2. The steps.
      const q = clamp((p - 0.17) / 0.8);
      const total = r.weights.reduce((a, b) => a + b, 0);
      let at = q * total, idx = 0;
      while (idx < r.weights.length - 1 && at >= r.weights[idx]) { at -= r.weights[idx]; idx++; }
      const local = clamp(at / r.weights[idx]);
      if (idx !== r.last) {
        r.steps.forEach((st, i) => {
          st.classList.toggle("on", i === idx);
          st.classList.toggle("past", i < idx);
        });
        r.dots.forEach((d, i) => d.classList.toggle("on", i === idx));
        r.last = idx;
      }
      playStep(r, r.steps[idx], local);
    });
  }

  if (story) {
    sizeReveals();
    let ticking = false;
    const frame = () => { ticking = false; onScrollHeader(); updateReveals(); };
    const req = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
    window.addEventListener("scroll", req, { passive: true });
    window.addEventListener("resize", () => { sizeReveals(); req(); });
    document.fonts && document.fonts.ready.then(() => { sizeReveals(); req(); });
    frame();
  } else {
    window.addEventListener("scroll", onScrollHeader, { passive: true });
    onScrollHeader();
  }

  /* ---------- features scroller ---------- */
  const sc = document.querySelector(".feats-scroll");
  const btns = document.querySelectorAll(".feats-nav .round-btn");
  if (sc) {
    const syncBtns = () => {
      const max = sc.scrollWidth - sc.clientWidth - 2;
      btns[0].disabled = sc.scrollLeft <= 2;
      btns[1].disabled = sc.scrollLeft >= max;
    };
    btns.forEach((b) => b.addEventListener("click", () => {
      const card = sc.querySelector(".feat");
      const stepPx = (card.offsetWidth + 16) * Math.max(1, Math.floor(sc.clientWidth / (card.offsetWidth + 16)) - 1);
      sc.scrollBy({ left: +b.dataset.dir * stepPx, behavior: story ? "smooth" : "auto" });
    }));
    sc.addEventListener("scroll", syncBtns, { passive: true });
    window.addEventListener("resize", syncBtns);
    syncBtns();

    // Drag to scroll with a mouse (touch already scrolls natively).
    let down = false, startX = 0, startL = 0, moved = false;
    sc.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      down = true; moved = false; startX = e.clientX; startL = sc.scrollLeft;
    });
    window.addEventListener("pointermove", (e) => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) > 4) { moved = true; sc.classList.add("dragging"); }
      if (moved) sc.scrollLeft = startL - dx;
    });
    window.addEventListener("pointerup", () => {
      if (!down) return;
      down = false;
      if (moved) {
        sc.classList.remove("dragging");
        // Let snapping settle on the nearest card.
        const card = sc.querySelector(".feat");
        const w = card.offsetWidth + 16;
        sc.scrollTo({ left: Math.round(sc.scrollLeft / w) * w, behavior: "smooth" });
      }
    });
  }

  /* ---------- footer year ---------- */
  const y = document.querySelector("[data-year]");
  if (y) y.textContent = String(new Date().getFullYear());
})();
