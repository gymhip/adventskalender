/* =====================================================================
   Adventskalender GymHIP – Kalenderseite
   ===================================================================== */
(function () {
  "use strict";
  const A = window.Advent;
  const $ = (id) => document.getElementById(id);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Farben der Türchen – angelehnt an die Kreise im GymHIP-Logo
  const PALETTE = ["#d9862a", "#2a7d45", "#1f5f9e", "#b8962f", "#6f9a45", "#3d679f", "#c96a28", "#1e6448", "#5d78ad", "#a77a35", "#3f86c2", "#7b8f37"];
  const LOCK = `<svg class="door__lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.2" fill="currentColor"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;

  const params = new URLSearchParams(location.search);
  const override = A.parseISO(params.get("datum"));
  const isPreview = !!override && (A.api.demo || A.api.isLoggedIn());
  const today = isPreview ? override : A.realToday();

  let state = null;
  let doors = new Map();
  let lastFocus = null;

  /* ---------- Intro: Flügeltür ----------------------------------- */
  function runIntro() {
    const intro = $("intro");
    const parts = String(A.seasonOf(today));
    intro.querySelector('[data-year-part="0"]').textContent = parts.slice(0, 2);
    intro.querySelector('[data-year-part="1"]').textContent = parts.slice(2);
    intro.querySelectorAll(".wing__wreath").forEach((w) => (w.innerHTML = A.ornaments.wreath(+w.dataset.seed)));

    let done = false;
    const timers = [];
    const reveal = () => document.body.classList.add("is-revealed");
    const finish = () => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      reveal();
      intro.classList.add("is-fading");
      setTimeout(() => intro.remove(), 950);
    };
    intro.addEventListener("click", finish);

    if (reduced) { timers.push(setTimeout(finish, 350)); return; }
    timers.push(setTimeout(() => intro.classList.add("is-turning"), 650));
    timers.push(setTimeout(() => intro.classList.add("is-open"), 950));
    timers.push(setTimeout(reveal, 1850));
    timers.push(setTimeout(finish, 2250));
  }

  /* ---------- Schnee --------------------------------------------- */
  function snow() {
    if (reduced) return;
    const box = $("snow");
    const n = window.innerWidth < 600 ? 28 : 46;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      const f = document.createElement("span");
      const s = 2 + Math.random() * 4.5;
      f.className = "flake";
      f.style.cssText = `left:${Math.random() * 100}vw;width:${s}px;height:${s}px;animation-duration:${11 + Math.random() * 12}s;animation-delay:${-Math.random() * 20}s;--dx:${(Math.random() - 0.5) * 60}px;--o:${0.35 + Math.random() * 0.55}`;
      frag.appendChild(f);
    }
    box.appendChild(frag);
  }

  /* ---------- Hinweis -------------------------------------------- */
  let toastTimer;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("is-visible"), 2800);
  }

  /* ---------- Geöffnete Türchen merken --------------------------- */
  const openedKey = () => `advent-opened-${state.season}`;
  const opened = () => new Set(A.lsGet(openedKey()) || []);
  const markOpened = (day) => { const s = opened(); s.add(day); A.lsSet(openedKey(), [...s]); };

  /* ---------- Kopfbereich ---------------------------------------- */
  function renderHero(settings) {
    $("title").textContent = settings.title || "Adventskalender";
    $("subtitle").textContent = settings.subtitle || "";
    $("year").textContent = state.season;
    document.title = `${settings.title || "Adventskalender"} ${state.season} · Gymnasium Hilpoltstein`;
    const info = $("info");
    if (state.phase === "before") {
      info.textContent = state.daysLeft === 1 ? "Morgen öffnet sich das erste Türchen!" : `Noch ${state.daysLeft} Tage bis zum ersten Türchen`;
    } else if (state.phase === "running") {
      info.textContent = state.today <= 24 ? `Heute öffnet sich Türchen ${state.today}.` : "Frohe Weihnachten! Alle Türchen sind offen.";
    } else if (state.phase === "after") {
      info.textContent = "Alle 24 Türchen sind offen – viel Freude beim Nachstöbern!";
    } else {
      info.textContent = "Bis zum nächsten Advent!";
    }
  }

  function renderPreviewBanner() {
    if (!isPreview) return;
    const b = $("preview-banner");
    const d = new Date(Date.UTC(today.y, today.m - 1, today.d)).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    b.innerHTML = `<span>Vorschau: ${d}${A.api.demo ? " (Demo)" : ""}</span><a href="${location.pathname}">Beenden</a>`;
    b.hidden = false;
  }

  function renderFoot() {
    const c = A.config;
    const links = [];
    if (c.impressumUrl) links.push(`<a href="${A.esc(c.impressumUrl)}">Impressum</a>`);
    if (c.datenschutzUrl) links.push(`<a href="${A.esc(c.datenschutzUrl)}">Datenschutz</a>`);
    $("foot").innerHTML = `<p>Gymnasium Hilpoltstein · Frohe Adventszeit!</p>${links.length ? `<p>${links.join("")}</p>` : ""}`;
  }

  /* ---------- Raster --------------------------------------------- */
  function renderGrid() {
    const cal = $("calendar");
    cal.innerHTML = "";
    if (state.phase === "closed") {
      cal.innerHTML = `<div class="closed"><p class="closed__star">✦</p><h2>Der Adventskalender ${state.season} ist beendet.</h2><p>Danke fürs Mitmachen – wir sehen uns im nächsten Advent!</p></div>`;
      return;
    }
    const seen = opened();
    for (let day = 1; day <= 24; day++) {
      const isOpen = day <= state.openUntil;
      const isToday = state.phase === "running" && state.today === day;
      const b = document.createElement("button");
      b.type = "button";
      b.className = `door ${isOpen ? "is-open" : "is-locked"}${isOpen && seen.has(day) ? " is-opened" : ""}${isToday ? " is-today" : ""}`;
      b.style.setProperty("--c", PALETTE[(day * 5) % PALETTE.length]);
      b.style.setProperty("--i", day);
      b.dataset.day = day;
      b.setAttribute("aria-label", isOpen ? `Türchen ${day} öffnen` : `Türchen ${day}, öffnet am ${day}. Dezember`);
      b.innerHTML = `
        <span class="door__inside" aria-hidden="true"><span class="door__star">✦</span></span>
        <span class="door__front" aria-hidden="true"><span class="door__num">${day}</span>${isOpen ? "" : LOCK}</span>
        ${isToday ? '<span class="door__badge">Heute</span>' : ""}`;
      b.addEventListener("click", () => onDoor(b, day, isOpen));
      cal.appendChild(b);
    }
  }

  function onDoor(btn, day, isOpen) {
    if (!isOpen) {
      btn.classList.remove("shake");
      void btn.offsetWidth;
      btn.classList.add("shake");
      toast(state.phase === "before" || state.phase === "running" ? `Noch ein bisschen Geduld – Türchen ${day} öffnet sich am ${day}. Dezember.` : "Dieses Türchen ist noch verschlossen.");
      return;
    }
    btn.classList.remove("is-opened");
    btn.classList.add("is-opening");
    markOpened(day);
    setTimeout(() => openSheet(day, btn), reduced ? 0 : 420);
  }

  /* ---------- Inhalt anzeigen ------------------------------------ */
  function openSheet(day, btn) {
    const sheet = $("sheet");
    const body = $("sheet-body");
    lastFocus = btn;
    $("sheet-title").innerHTML = `<b>${day}</b>${A.dayLabel(day)}`;
    body.innerHTML = "";
    sheet.hidden = false;
    document.documentElement.classList.add("no-scroll");
    const portrait = window.innerWidth < 700 && window.innerHeight > window.innerWidth;
    body.appendChild(A.renderDoor(doors.get(day), { portrait }));
    requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add("is-visible")));
    sheet.querySelector(".sheet__close").focus({ preventScroll: true });
    sheet._btn = btn;
  }

  function closeSheet() {
    const sheet = $("sheet");
    if (sheet.hidden) return;
    sheet.classList.remove("is-visible");
    const btn = sheet._btn;
    if (btn) { btn.classList.remove("is-opening"); btn.classList.add("is-opened"); }
    setTimeout(() => {
      sheet.hidden = true;
      $("sheet-body").innerHTML = ""; // stoppt Videos/Audio
      sheet.querySelector(".sheet__panel").style.transform = "";
      document.documentElement.classList.remove("no-scroll");
      if (lastFocus) lastFocus.focus({ preventScroll: true });
    }, 380);
  }

  function wireSheet() {
    const sheet = $("sheet");
    sheet.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeSheet(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
    // Nach unten wischen schließt (iPhone)
    const panel = sheet.querySelector(".sheet__panel");
    const head = sheet.querySelector(".sheet__head");
    let y0 = null, dy = 0;
    const start = (e) => { if (window.innerWidth >= 700) return; y0 = e.touches[0].clientY; dy = 0; panel.style.transition = "none"; };
    const move = (e) => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); panel.style.transform = `translateY(${dy}px)`; };
    const end = () => {
      if (y0 == null) return;
      panel.style.transition = "";
      y0 = null;
      if (dy > 90) closeSheet(); else panel.style.transform = "";
    };
    [head, sheet.querySelector(".sheet__grab")].forEach((el) => {
      el.addEventListener("touchstart", start, { passive: true });
      el.addEventListener("touchmove", move, { passive: true });
      el.addEventListener("touchend", end);
    });
  }

  /* ---------- Musik ---------------------------------------------- */
  function initMusic(settings) {
    const btn = $("music");
    if (!settings.music || !A.config.musicFile) return;
    const audio = new Audio();
    audio.loop = true;
    audio.preload = "none";
    audio.src = A.config.musicFile;
    btn.hidden = false;
    audio.addEventListener("error", () => { btn.hidden = true; });
    btn.addEventListener("click", async () => {
      if (audio.paused) {
        try {
          await audio.play();
          btn.setAttribute("aria-pressed", "true");
          btn.setAttribute("aria-label", "Musik anhalten");
        } catch { toast("Die Musik konnte nicht gestartet werden."); }
      } else {
        audio.pause();
        btn.setAttribute("aria-pressed", "false");
        btn.setAttribute("aria-label", "Musik abspielen");
      }
    });
  }

  /* ---------- Start ---------------------------------------------- */
  async function start() {
    runIntro();
    snow();
    wireSheet();
    renderFoot();
    renderPreviewBanner();

    let settings;
    try { settings = await A.api.getSettings(); }
    catch (e) { console.error(e); settings = { title: "Adventskalender", subtitle: "Gymnasium Hilpoltstein", music: true, closed_season: null }; }
    state = A.phase(settings, today);
    renderHero(settings);
    renderGrid();
    initMusic(settings);

    if (state.phase === "closed" || state.openUntil === 0) return;
    try {
      let rows;
      if (isPreview && !A.api.demo) {
        rows = (await A.api.getAllDoors(state.season)).filter((d) => d.published && A.isUnlockedOn(d.season, d.day, today));
      } else {
        rows = await A.api.getPublicDoors(state.season, today);
      }
      doors = new Map(rows.map((r) => [r.day, r]));
    } catch (e) {
      console.error(e);
      toast("Die Inhalte konnten gerade nicht geladen werden.");
    }
  }

  start();
})();
