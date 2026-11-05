/* =====================================================================
   Adventskalender GymHIP – gemeinsame Logik (Kalender + Redaktion)
   Datum/Saison · Datenzugriff (Supabase oder Demo) · Links · Karten
   ===================================================================== */
(function () {
  "use strict";
  const C = window.ADVENT_CONFIG || {};
  const A = (window.Advent = {});
  A.config = C;
  A.isDemo = !(C.supabaseUrl && C.supabaseAnonKey);

  /* ---------------------------------------------------------------- */
  /* Hilfen                                                            */
  /* ---------------------------------------------------------------- */
  A.esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  A.rng = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  A.el = (html) => {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };

  /* ---------------------------------------------------------------- */
  /* Datum & Saison (immer deutsche Zeit)                              */
  /* ---------------------------------------------------------------- */
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" });
  A.parseISO = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
    return m ? { y: +m[1], m: +m[2], d: +m[3], iso: s } : null;
  };
  A.realToday = () => A.parseISO(fmt.format(new Date()));
  /** Saison = Jahr des Advents, um den es gerade geht. Ab November das laufende Jahr, davor der letzte Advent. */
  A.seasonOf = (t) => (t.m >= 11 ? t.y : t.y - 1);
  A.dayLabel = (day) => `${day}. Dezember`;

  /** Phase des Kalenders für ein Datum. */
  A.phase = (settings, t) => {
    const season = A.seasonOf(t);
    if (settings && settings.closed_season != null && settings.closed_season >= season)
      return { season, phase: "closed", openUntil: 0 };
    if (t.m === 11) return { season, phase: "before", openUntil: 0, daysLeft: 31 - t.d };
    if (t.m === 12) return { season, phase: "running", openUntil: Math.min(t.d, 24), today: t.d };
    return { season, phase: "after", openUntil: 24 };
  };

  /* ---------------------------------------------------------------- */
  /* Datenzugriff                                                      */
  /* ---------------------------------------------------------------- */
  const LS_SESSION = "advent-admin-session";
  const LS_DEMO = "advent-demo-v2";
  const PUBLIC_COLS = "season,day,kind,template,heading,body,url,credit";
  const DEFAULT_SETTINGS = { title: "Adventskalender", subtitle: "Gymnasium Hilpoltstein", music: true, closed_season: null };

  class AuthError extends Error {}
  A.AuthError = AuthError;

  const lsGet = (k) => {
    try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; }
  };
  const lsSet = (k, v) => {
    try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {}
  };
  A.lsGet = lsGet;
  A.lsSet = lsSet;

  /* ---------- Supabase (nur fetch, keine Bibliothek) --------------- */
  function supabaseApi() {
    // Nur „https://xyz.supabase.co“ – versehentlich mitkopierte Pfade wie /rest/v1/ werden entfernt
    let base = C.supabaseUrl.trim();
    try { base = new URL(base).origin; } catch { base = base.replace(/\/+$/, ""); }
    const key = C.supabaseAnonKey;

    const session = () => lsGet(LS_SESSION);
    async function token() {
      let s = session();
      if (!s) throw new AuthError("Nicht angemeldet");
      if (Date.now() / 1000 > s.expires_at - 60) {
        const r = await fetch(`${base}/auth/v1/token?grant_type=refresh_token`, {
          method: "POST",
          headers: { apikey: key, "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: s.refresh_token }),
        });
        if (!r.ok) { lsSet(LS_SESSION, null); throw new AuthError("Sitzung abgelaufen"); }
        const j = await r.json();
        s = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || Date.now() / 1000 + j.expires_in };
        lsSet(LS_SESSION, s);
      }
      return s.access_token;
    }

    async function rest(path, { method = "GET", body, auth = false, prefer } = {}) {
      const headers = { apikey: key, "Content-Type": "application/json" };
      if (auth) headers.Authorization = "Bearer " + (await token());
      if (prefer) headers.Prefer = prefer;
      const r = await fetch(`${base}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
      if (auth && (r.status === 401 || r.status === 403)) { lsSet(LS_SESSION, null); throw new AuthError("Keine Berechtigung – bitte neu anmelden"); }
      if (!r.ok) throw new Error(`Serverfehler ${r.status}: ${await r.text()}`);
      return r.status === 204 ? null : r.json();
    }

    return {
      demo: false,
      isLoggedIn: () => !!session(),
      async login(password) {
        const r = await fetch(`${base}/auth/v1/token?grant_type=password`, {
          method: "POST",
          headers: { apikey: key, "Content-Type": "application/json" },
          body: JSON.stringify({ email: C.adminEmail, password }),
        });
        if (!r.ok) {
          if (r.status === 429) throw new AuthError("Zu viele Versuche – bitte kurz warten.");
          if (r.status === 400) throw new AuthError("Passwort falsch.");
          throw new AuthError(`Keine Verbindung zur Datenbank (Fehler ${r.status}). Bitte die Supabase-Adresse in config.js prüfen.`);
        }
        const j = await r.json();
        lsSet(LS_SESSION, { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || Date.now() / 1000 + j.expires_in });
      },
      logout() {
        const s = session();
        lsSet(LS_SESSION, null);
        if (s) fetch(`${base}/auth/v1/logout`, { method: "POST", headers: { apikey: key, Authorization: "Bearer " + s.access_token } }).catch(() => {});
      },
      async getSettings() {
        const rows = await rest("settings?select=title,subtitle,music,closed_season");
        return Object.assign({}, DEFAULT_SETTINGS, rows[0] || {});
      },
      /** Öffentlich: der Server liefert nur, was heute schon offen sein darf. */
      async getPublicDoors(season) {
        return rest(`doors?select=${PUBLIC_COLS}&season=eq.${season}&order=day`);
      },
      async getAllDoors(season) {
        return rest(`doors?select=*&season=eq.${season}&order=day`, { auth: true });
      },
      async getDoor(season, day) {
        const rows = await rest(`doors?select=*&season=eq.${season}&day=eq.${day}`, { auth: true });
        return rows[0] || null;
      },
      async saveDoor(door) {
        const rows = await rest("doors?on_conflict=season,day", {
          method: "POST", auth: true, body: door, prefer: "resolution=merge-duplicates,return=representation",
        });
        return rows[0];
      },
      async deleteDoor(season, day) {
        await rest(`doors?season=eq.${season}&day=eq.${day}`, { method: "DELETE", auth: true });
      },
      async saveSettings(patch) {
        await rest("settings?id=eq.1", { method: "PATCH", auth: true, body: patch });
      },
    };
  }

  /* ---------- Demo (alles im eigenen Browser) ---------------------- */
  function demoApi() {
    const load = () => {
      let s = lsGet(LS_DEMO);
      if (!s) { s = { settings: { ...DEFAULT_SETTINGS }, doors: A.demoDoors(A.seasonOf(A.realToday())) }; lsSet(LS_DEMO, s); }
      return s;
    };
    const save = (s) => lsSet(LS_DEMO, s);
    const loggedKey = "advent-demo-login";
    const now = () => new Date().toISOString();
    return {
      demo: true,
      isLoggedIn: () => { try { return sessionStorage.getItem(loggedKey) === "1" || !!lsGet(loggedKey); } catch { return false; } },
      async login(pw) {
        if (pw !== "demo") throw new AuthError("Im Demo-Modus lautet das Passwort „demo“.");
        lsSet(loggedKey, true);
      },
      logout() { lsSet(loggedKey, null); },
      async getSettings() { return { ...DEFAULT_SETTINGS, ...load().settings }; },
      async getPublicDoors(season, t) {
        t = t || A.realToday();
        return load().doors.filter((d) => d.season === season && d.published && A.isUnlockedOn(d.season, d.day, t));
      },
      async getAllDoors(season) { return load().doors.filter((d) => d.season === season).sort((a, b) => a.day - b.day); },
      async getDoor(season, day) { return load().doors.find((d) => d.season === season && d.day === day) || null; },
      async saveDoor(door) {
        const s = load();
        const i = s.doors.findIndex((d) => d.season === door.season && d.day === door.day);
        const row = { ...door, updated_at: now() };
        i >= 0 ? (s.doors[i] = row) : s.doors.push(row);
        save(s);
        return row;
      },
      async deleteDoor(season, day) { const s = load(); s.doors = s.doors.filter((d) => !(d.season === season && d.day === day)); save(s); },
      async saveSettings(patch) { const s = load(); s.settings = { ...s.settings, ...patch }; save(s); },
      reset() { lsSet(LS_DEMO, null); },
    };
  }

  /** Darf Türchen <day> der Saison <season> am Datum t schon offen sein? (gleiche Regel wie auf dem Server) */
  A.isUnlockedOn = (season, day, t) => {
    const doorIso = `${season}-12-${String(day).padStart(2, "0")}`;
    return doorIso <= t.iso;
  };

  A.api = A.isDemo ? demoApi() : supabaseApi();

  /* ---------------------------------------------------------------- */
  /* Demo-Inhalte                                                      */
  /* ---------------------------------------------------------------- */
  A.demoDoors = (season) => {
    const T = "Tu dir mal was Gutes!";
    const rows = [
      [1, "card", 1, T, "Koche dir einen leckeren Tee oder Kaffee, nimm dir Zeit und schmecke ihn bewusst.", "", "SMV"],
      [2, "link", 1, "Musik zum zweiten Advent", "Ein kleiner Gruß aus der Fachschaft Musik.", "https://www.youtube.com/watch?v=z1rYmzQ8C9Q", "Fachschaft Musik"],
      [3, "card", 2, "Gedanke des Tages", "Manchmal ist das schönste Geschenk ein ruhiger Moment ganz für dich allein.", "", ""],
      [4, "card", 1, T, "Plane ein Treffen mit deinen Freunden.", "", "SMV"],
      [5, "card", 3, "Nikolaus-Vorfreude", "Stell heute Abend deine Stiefel vor die Tür – und denk an jemanden, dem du eine Freude machen kannst.", "", "Klasse 6c"],
      [6, "card", 2, "Zum Nikolaustag", "Wer anderen eine Freude macht, beschenkt am Ende sich selbst.", "", ""],
      [7, "link", 1, "Schau mal vorbei", "Was gerade bei uns an der Schule los ist, findest du auf unserer Homepage.", "https://www.gym-hip.de/", ""],
      [8, "card", 1, T, "Schreib heute jemandem eine kurze Nachricht, an den du lange nicht gedacht hast.", "", ""],
      [9, "card", 3, "Wintersprüche", "Schnee ist das schönste Argument für eine Tasse Kakao.", "", "Klasse 8a"],
      [10, "card", 2, "Kleines Rätsel", "Was wird nasser, je mehr es trocknet?\n\n(Ein Handtuch.)", "", "Fachschaft Deutsch"],
      [11, "card", 1, T, "Geh heute zehn Minuten an die frische Luft – ohne Handy.", "", ""],
      [12, "card", 3, "Plätzchenzeit", "Back mit deiner Familie dein Lieblingsplätzchen und bring eins mit in die Schule.", "", ""],
      [13, "card", 2, "Lucia", "Am Luciatag feiert man das Licht. Zünde heute bewusst eine Kerze an.", "", ""],
      [14, "card", 1, T, "Mach heute eine Sache, die du schon lange vor dir herschiebst – und freu dich, wenn sie erledigt ist.", "", ""],
      [17, "link", 1, "Weihnachtliche Klänge", "", "https://youtu.be/aib0R72b9Nk", "Chor des GymHIP"],
      [18, "card", 3, "Danke!", "Sag heute einer Person in der Schule Danke – einfach so.", "", "Schulleitung"],
    ];
    return rows.map(([day, kind, template, heading, body, url, credit]) => ({
      season, day, kind, template, heading, body, url, credit,
      assignee: credit || "", published: day !== 14, updated_at: new Date().toISOString(),
    }));
  };

  /* ---------------------------------------------------------------- */
  /* Links erkennen & einbetten                                        */
  /* ---------------------------------------------------------------- */
  const ytTime = (u) => {
    const t = u.searchParams.get("t") || u.searchParams.get("start");
    if (!t) return 0;
    const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(t);
    return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
  };

  /** Erkennt, was hinter einem Link steckt, und wie er eingebettet wird. */
  A.parseLink = (raw) => {
    const s = String(raw || "").trim();
    if (!s) return null;
    let u;
    try { u = new URL(/^https?:\/\//i.test(s) ? s : "https://" + s); } catch { return { kind: "invalid", label: "Kein gültiger Link" }; }
    if (!/^https?:$/.test(u.protocol)) return { kind: "invalid", label: "Kein gültiger Link" };
    const host = u.hostname.replace(/^www\.|^m\./, "");
    const path = u.pathname;

    // YouTube
    let id = null;
    if (host === "youtu.be") id = path.slice(1).split("/")[0];
    else if (/(^|\.)youtube(-nocookie)?\.com$/.test(host)) {
      id = u.searchParams.get("v") || (/^\/(?:shorts|embed|live|v)\/([\w-]{6,})/.exec(path) || [])[1];
    }
    if (id && /^[\w-]{6,}$/.test(id)) {
      const start = ytTime(u);
      return {
        kind: "embed", provider: "YouTube", label: "YouTube-Video", ratio: path.startsWith("/shorts") ? "9/16" : "16/9",
        src: `https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1&autoplay=1${start ? "&start=" + start : ""}`,
        href: u.href,
      };
    }
    // Vimeo
    const vm = host === "vimeo.com" && /^\/(\d+)/.exec(path);
    if (vm) return { kind: "embed", provider: "Vimeo", label: "Vimeo-Video", ratio: "16/9", src: `https://player.vimeo.com/video/${vm[1]}?dnt=1&autoplay=1`, href: u.href };
    // Spotify (Podcast-Folgen, Sendungen, Songs, Playlists)
    const sp = host === "open.spotify.com" && /^\/(?:intl-[a-z-]+\/)?(episode|show|track|playlist|album)\/([A-Za-z0-9]+)/.exec(path);
    if (sp) {
      const small = sp[1] === "episode" || sp[1] === "track";
      return {
        kind: "embed", provider: "Spotify", label: sp[1] === "episode" || sp[1] === "show" ? "Podcast (Spotify)" : "Musik (Spotify)",
        height: small ? 152 : 352, src: `https://open.spotify.com/embed/${sp[1]}/${sp[2]}`, href: u.href,
      };
    }
    // Apple Podcasts
    if (host === "podcasts.apple.com") {
      return {
        kind: "embed", provider: "Apple Podcasts", label: "Podcast (Apple)", height: u.searchParams.get("i") ? 175 : 450,
        src: `https://embed.podcasts.apple.com${path}${u.search}`, href: u.href,
      };
    }
    // Direkte Dateien
    if (/\.(mp3|m4a|ogg|wav|aac)$/i.test(path)) return { kind: "audio", label: "Audiodatei", src: u.href, href: u.href };
    if (/\.(mp4|webm|mov)$/i.test(path)) return { kind: "video", label: "Videodatei", src: u.href, href: u.href };
    if (/\.(jpe?g|png|webp|gif|avif)$/i.test(path)) return { kind: "image", label: "Bild", src: u.href, href: u.href };
    // Alles andere: Link-Karte
    return { kind: "web", label: "Webseite", host, href: u.href };
  };

  /* ---------- Einwilligung für externe Inhalte (2-Klick) ----------- */
  const CONSENT_KEY = "advent-consent";
  const consentFor = (p) => !!(lsGet(CONSENT_KEY) || {})[p];
  const rememberConsent = (p) => { const c = lsGet(CONSENT_KEY) || {}; c[p] = true; lsSet(CONSENT_KEY, c); };

  function embedFrame(info) {
    const f = document.createElement("iframe");
    f.src = info.src;
    f.title = info.label;
    f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write";
    f.allowFullscreen = true;
    f.loading = "lazy";
    f.referrerPolicy = "strict-origin-when-cross-origin";
    return f;
  }

  function embedBlock(info, { autoload = false } = {}) {
    const box = A.el(`<div class="embed ${info.height ? "embed--fixed" : ""}"></div>`);
    if (info.height) box.style.height = info.height + "px";
    else box.style.aspectRatio = info.ratio || "16/9";
    if (info.ratio === "9/16") box.classList.add("embed--portrait");

    const load = () => { box.innerHTML = ""; box.appendChild(embedFrame(info)); box.classList.add("is-loaded"); };
    if (autoload || consentFor(info.provider)) { load(); return box; }

    const icon = /Podcast|Spotify/.test(info.label)
      ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a4 4 0 0 1 4 4v5a4 4 0 0 1-8 0V7a4 4 0 0 1 4-4Zm-7 9a7 7 0 0 0 14 0M12 19v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`
      : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>`;
    const consent = A.el(`
      <div class="consent">
        <button type="button" class="consent__play" aria-label="${A.esc(info.label)} laden">${icon}</button>
        <p class="consent__title">${A.esc(info.label)}</p>
        <p class="consent__note">Beim Abspielen werden Daten an ${A.esc(info.provider)} übertragen.</p>
        <label class="consent__remember"><input type="checkbox"> ${A.esc(info.provider)} künftig direkt laden</label>
      </div>`);
    consent.querySelector(".consent__play").addEventListener("click", () => {
      if (consent.querySelector("input").checked) rememberConsent(info.provider);
      load();
    });
    box.appendChild(consent);
    return box;
  }

  /* ---------------------------------------------------------------- */
  /* Inhalt eines Türchens darstellen                                  */
  /* ---------------------------------------------------------------- */
  A.renderDoor = (door, opts = {}) => {
    if (!door || (door.kind === "card" && !door.heading && !door.body) || (door.kind === "link" && !door.url)) {
      return A.el(`<div class="door-empty"><p class="door-empty__star">✦</p><p>Hier kommt bald etwas Schönes hinein.</p></div>`);
    }
    if (door.kind === "card") return A.buildCard(door, opts);

    const info = A.parseLink(door.url) || { kind: "invalid" };
    const wrap = A.el(`<div class="linkview"></div>`);
    if (door.heading) wrap.appendChild(A.el(`<h2 class="linkview__heading">${A.esc(door.heading)}</h2>`));
    let media;
    if (info.kind === "embed") media = embedBlock(info, opts);
    else if (info.kind === "audio") media = A.el(`<audio class="linkview__audio" controls preload="none" src="${A.esc(info.src)}"></audio>`);
    else if (info.kind === "video") media = A.el(`<video class="linkview__video" controls playsinline preload="metadata" src="${A.esc(info.src)}"></video>`);
    else if (info.kind === "image") media = A.el(`<img class="linkview__image" alt="${A.esc(door.heading || "Bild")}" src="${A.esc(info.src)}">`);
    else if (info.kind === "web")
      media = A.el(`
        <a class="webcard" href="${A.esc(info.href)}" target="_blank" rel="noopener noreferrer">
          <span class="webcard__icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3Z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></span>
          <span class="webcard__text"><span class="webcard__host">${A.esc(info.host)}</span><span class="webcard__cta">Seite öffnen</span></span>
          <span class="webcard__arrow" aria-hidden="true">↗</span>
        </a>`);
    else media = A.el(`<p class="linkview__invalid">Dieser Link konnte nicht erkannt werden.</p>`);
    wrap.appendChild(media);
    if (door.body) wrap.appendChild(A.el(`<p class="linkview__text">${A.esc(door.body)}</p>`));
    if (door.credit) wrap.appendChild(A.el(`<p class="linkview__credit">${A.esc(door.credit)}</p>`));
    return wrap;
  };

  /* ---------------------------------------------------------------- */
  /* Karten (drei Vorlagen)                                            */
  /* ---------------------------------------------------------------- */
  A.TEMPLATES = [
    { id: 1, name: "Tannenzweig", hint: "Grün mit Zweigen und Beeren" },
    { id: 2, name: "Sternennacht", hint: "Nachtblau mit Goldsternen" },
    { id: 3, name: "Winterpapier", hint: "Hell, Stechpalme, Handschrift" },
  ];

  /** Baut eine Karte. opts.portrait erzwingt Hochformat (sonst automatisch nach Bildschirm). */
  A.buildCard = (door, opts = {}) => {
    const t = [1, 2, 3].includes(+door.template) ? +door.template : 1;
    const card = A.el(`
      <article class="card t${t}">
        <div class="card__bg" aria-hidden="true"></div>
        <div class="card__deco" aria-hidden="true"></div>
        <div class="card__frame">
          ${door.heading ? `<h2 class="card__heading"><span>${A.esc(door.heading)}</span></h2>` : ""}
          <div class="card__panel"><p class="card__text">${A.esc(door.body || "")}</p></div>
          ${door.credit ? `<p class="card__credit">${A.esc(door.credit)}</p>` : ""}
        </div>
        <span class="card__day" aria-hidden="true">${door.day || ""}</span>
      </article>`);
    if (!door.body) card.querySelector(".card__panel").remove();
    const portrait = opts.portrait ?? (window.innerWidth < 700 && window.innerHeight > window.innerWidth);
    card.classList.toggle("is-portrait", portrait);
    card.querySelector(".card__deco").innerHTML = A.ornaments.forTemplate(t, portrait, (door.day || 1) * 97 + t);
    if (!opts.noFit) {
      const ro = new ResizeObserver(() => A.fitCard(card));
      ro.observe(card);
      (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => A.fitCard(card));
    }
    return card;
  };

  /** Passt Schriftgrößen so an, dass der Text die Karte füllt, ohne überzulaufen. */
  A.fitCard = (card, minPx = 13) => {
    const w = card.clientWidth;
    if (!w) return;
    const portrait = card.classList.contains("is-portrait");
    const head = card.querySelector(".card__heading");
    const text = card.querySelector(".card__text");
    const panel = card.querySelector(".card__panel");
    const credit = card.querySelector(".card__credit");
    const tpl = card.classList.contains("t3") ? 3 : card.classList.contains("t2") ? 2 : 1;
    if (credit) credit.style.fontSize = Math.max(Math.min(11, minPx), w * (portrait ? 0.036 : 0.022) * (tpl === 3 ? 1.5 : 1)) + "px";
    if (head) {
      let size = w * (portrait ? 0.075 : 0.042) * (tpl === 2 ? 0.72 : 1);
      const min = Math.max(minPx, w * 0.028);
      head.style.fontSize = size + "px";
      // höchstens zwei Zeilen, nichts darf seitlich überstehen
      while (size > min && (head.scrollWidth > head.clientWidth + 1 || head.offsetHeight > size * 2.8)) {
        size *= 0.94;
        head.style.fontSize = size + "px";
      }
    }
    if (text && panel) {
      const t = card.classList.contains("t3") ? 1.12 : card.classList.contains("t1") ? 1.05 : 0.9;
      let size = w * (portrait ? 0.105 : 0.066) * t;
      const min = Math.max(minPx, w * 0.026);
      text.style.fontSize = size + "px";
      const cs = getComputedStyle(panel);
      const avail = () => panel.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      let guard = 60;
      while (guard-- && size > min && (text.offsetHeight > avail() + 1 || text.scrollWidth > text.clientWidth + 1)) {
        size *= 0.95;
        text.style.fontSize = size + "px";
      }
    }
  };

  /* ---------------------------------------------------------------- */
  /* Ornamente (prozedurale SVGs – keine Bilddateien nötig)            */
  /* ---------------------------------------------------------------- */
  const O = (A.ornaments = {});
  const f1 = (n) => Math.round(n * 10) / 10;

  /** Tannenzweig entlang einer Kurve. Liefert SVG-Gruppe (Koordinaten im viewBox des Aufrufers). */
  O.branch = (rnd, { x0, y0, x1, y1, bend = 20, len = 34, needles = 70, colors = ["#1c2f23", "#2c4834", "#3c5d43"], width = 1.6 }) => {
    const pts = (t) => {
      const mx = (x0 + x1) / 2 + bend, my = (y0 + y1) / 2;
      const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * mx + t * t * x1;
      const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * my + t * t * y1;
      const dx = 2 * (1 - t) * (mx - x0) + 2 * t * (x1 - mx);
      const dy = 2 * (1 - t) * (my - y0) + 2 * t * (y1 - my);
      const l = Math.hypot(dx, dy) || 1;
      return { x, y, tx: dx / l, ty: dy / l };
    };
    let out = `<path d="M${f1(x0)},${f1(y0)} Q${f1((x0 + x1) / 2 + bend)},${f1((y0 + y1) / 2)} ${f1(x1)},${f1(y1)}" stroke="${colors[0]}" stroke-width="${width * 1.8}" fill="none" stroke-linecap="round"/>`;
    for (let i = 0; i < needles; i++) {
      const t = 0.04 + (i / needles) * 0.96;
      const p = pts(t);
      const side = i % 2 ? 1 : -1;
      const ang = (0.55 + rnd() * 0.35) * side;
      const L = len * (1 - 0.5 * t) * (0.75 + rnd() * 0.5);
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const nx = p.tx * ca - p.ty * sa, ny = p.tx * sa + p.ty * ca;
      const c = colors[Math.floor(rnd() * colors.length)];
      out += `<line x1="${f1(p.x)}" y1="${f1(p.y)}" x2="${f1(p.x + nx * L)}" y2="${f1(p.y + ny * L)}" stroke="${c}" stroke-width="${width}" stroke-linecap="round"/>`;
    }
    return out;
  };

  O.berries = (rnd, cx, cy, n = 5, r = 5, color = "#b3242c") => {
    let out = "";
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * r * 2.2;
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d, rr = r * (0.75 + rnd() * 0.4);
      out += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rr)}" fill="${color}"/><circle cx="${f1(x - rr * 0.35)}" cy="${f1(y - rr * 0.35)}" r="${f1(rr * 0.28)}" fill="#fff" opacity=".55"/>`;
    }
    return out;
  };

  /** Stechpalmenblatt, Länge L, gedreht um rot (Grad). */
  O.holly = (x, y, L, rot, fill = "#5f8f45", vein = "#3e6b2c") => {
    const w = L * 0.24, n = 4;
    let top = `M0,0`, bot = ``;
    for (let k = 1; k <= n * 2; k++) {
      const xx = (k / (n * 2)) * L;
      const base = w * Math.sin((Math.PI * xx) / L);
      const yy = k % 2 ? -base * 1.25 : -base * 0.72;
      top += ` L${f1(xx)},${f1(yy)}`;
    }
    for (let k = n * 2 - 1; k >= 0; k--) {
      const xx = (k / (n * 2)) * L;
      const base = w * Math.sin((Math.PI * xx) / L);
      const yy = k % 2 ? base * 1.25 : base * 0.72;
      bot += ` L${f1(xx)},${f1(yy)}`;
    }
    return `<g transform="translate(${f1(x)},${f1(y)}) rotate(${f1(rot)})"><path d="${top}${bot} Z" fill="${fill}" stroke="${vein}" stroke-width="1" stroke-linejoin="round"/><path d="M2,0 L${f1(L * 0.92)},0" stroke="${vein}" stroke-width="1.2"/></g>`;
  };

  O.sparkle = (x, y, r, color = "#f3d08a", op = 1) =>
    `<path transform="translate(${f1(x)},${f1(y)})" d="M0,${-r} Q0,0 ${r},0 Q0,0 0,${r} Q0,0 ${-r},0 Q0,0 0,${-r}Z" fill="${color}" opacity="${op}"/>`;

  O.snowdots = (rnd, w, h, n, color = "#fff", maxR = 3.2, op = 0.85) => {
    let out = "";
    for (let i = 0; i < n; i++) out += `<circle cx="${f1(rnd() * w)}" cy="${f1(rnd() * h)}" r="${f1(0.8 + rnd() * maxR)}" fill="${color}" opacity="${f1((0.35 + rnd() * 0.65) * op)}"/>`;
    return out;
  };

  /** Komplette Deko-Ebene je Vorlage. viewBox 1000×625 (quer) oder 800×1000 (hoch). */
  O.forTemplate = (t, portrait, seed) => {
    const rnd = A.rng(seed);
    const W = portrait ? 800 : 1000, H = portrait ? 1000 : 625;
    let g = "";
    if (t === 1) {
      g += O.snowdots(rnd, W, H, 26, "#fff", 3.4, 0.9);
      const k = portrait ? 1.45 : 1; // im Hochformat kräftiger zeichnen
      const sprig = (x0, y0, x1, y1, bend, flip, side = 1) => {
        let s = O.branch(rnd, { x0, y0, x1, y1, bend, len: 46 * k, needles: 110, width: 2.1 * k });
        // Seitenzweige
        for (let j = 0; j < 3; j++) {
          const t0 = 0.25 + j * 0.22;
          const sx = x0 + (x1 - x0) * t0 + bend * 0.5, sy = y0 + (y1 - y0) * t0;
          const ex = portrait ? sx + (rnd() - 0.3) * 60 : sx + flip * (70 + rnd() * 40);
          const ey = portrait ? sy + side * (80 + rnd() * 50) : sy - (60 + rnd() * 40);
          s += O.branch(rnd, { x0: sx, y0: sy, x1: ex, y1: ey, bend: flip * 10, len: 26 * k, needles: 40, width: 1.6 * k });
        }
        const hx = x0 + (x1 - x0) * 0.85, hy = y0 + (y1 - y0) * 0.85;
        s += O.holly(hx, hy, 70 * k, flip > 0 ? -60 : 120);
        s += O.holly(x0 + (x1 - x0) * 0.12, y0 + (y1 - y0) * 0.12, 64 * k, flip > 0 ? 30 : -150);
        s += O.berries(rnd, x0 + (x1 - x0) * 0.12, y0 + (y1 - y0) * 0.12, 4, 7 * k);
        s += O.berries(rnd, x0 + (x1 - x0) * 0.55, y0 + (y1 - y0) * 0.55, 6, 6 * k);
        s += O.berries(rnd, hx, hy, 3, 6 * k);
        return s;
      };
      if (portrait) {
        g += sprig(-40, 230, 470, 30, 40, 1, 1);
        g += sprig(840, 770, 330, 970, -40, -1, -1);
      } else {
        g += sprig(110, 610, 150, 20, -40, 1);
        g += sprig(890, 610, 850, 20, 40, -1);
      }
    } else if (t === 2) {
      g += O.snowdots(rnd, W, H, 90, "#dfe8ff", 1.4, 0.8);
      for (let i = 0; i < 14; i++) {
        const x = rnd() * W, y = rnd() * H;
        g += O.sparkle(x, y, 4 + rnd() * 9, "#f3d08a", 0.45 + rnd() * 0.5);
      }
      // Mondsichel
      const mx = portrait ? W - 105 : W - 120, my = portrait ? 92 : 95, mr = portrait ? 34 : 42;
      g += `<circle cx="${mx}" cy="${my}" r="${mr}" fill="#f6e3b0" opacity=".95"/><circle cx="${mx + mr * 0.43}" cy="${my - mr * 0.24}" r="${mr * 0.9}" fill="#10264b"/>`;
      // Tannensilhouetten am unteren Rand
      const tree = (x, h) => `<path d="M${f1(x)},${H} L${f1(x - h * 0.32)},${H} L${f1(x - h * 0.1)},${f1(H - h * 0.45)} L${f1(x - h * 0.24)},${f1(H - h * 0.45)} L${f1(x - h * 0.06)},${f1(H - h * 0.75)} L${f1(x - h * 0.16)},${f1(H - h * 0.75)} L${f1(x)},${f1(H - h)} L${f1(x + h * 0.16)},${f1(H - h * 0.75)} L${f1(x + h * 0.06)},${f1(H - h * 0.75)} L${f1(x + h * 0.24)},${f1(H - h * 0.45)} L${f1(x + h * 0.1)},${f1(H - h * 0.45)} L${f1(x + h * 0.32)},${H} Z" fill="#0a1a36" opacity=".9"/>`;
      const trees = portrait ? [[60, 170], [150, 120], [690, 190], [760, 120]] : [[50, 150], [125, 105], [880, 165], [955, 115]];
      trees.forEach(([x, h]) => (g += tree(x, h)));
    } else {
      // Winterpapier: Stechpalme in zwei Ecken
      const corner = (x, y, s) => {
        let c = "";
        c += O.holly(x, y, 92, s > 0 ? 10 : 190);
        c += O.holly(x, y, 82, s > 0 ? 58 : 238);
        c += O.holly(x, y, 70, s > 0 ? -32 : 148, "#77a35a", "#4b7536");
        c += O.berries(rnd, x + s * 8, y + s * 6, 4, 9, "#b0282d");
        return c;
      };
      g += corner(portrait ? 70 : 80, portrait ? 80 : 70, 1);
      g += corner(portrait ? W - 70 : W - 80, portrait ? H - 80 : H - 70, -1);
      for (let i = 0; i < 6; i++) g += O.sparkle(rnd() * W, rnd() * H, 4 + rnd() * 5, "#c9a24c", 0.35);
    }
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">${g}</svg>`;
  };

  /** Kranz für die Eingangstür (viewBox 200×200). */
  O.wreath = (seed) => {
    const rnd = A.rng(seed);
    let g = "";
    const R = 70;
    for (let i = 0; i < 220; i++) {
      const a = (i / 220) * Math.PI * 2 + rnd() * 0.05;
      const r = R + (rnd() - 0.5) * 18;
      const x = 100 + Math.cos(a) * r, y = 100 + Math.sin(a) * r;
      const ang = a + Math.PI / 2 + (rnd() - 0.5) * 1.6;
      const L = 12 + rnd() * 10;
      const c = ["#1d3a2a", "#2b5139", "#3d6a4a", "#24452f"][Math.floor(rnd() * 4)];
      g += `<line x1="${f1(x)}" y1="${f1(y)}" x2="${f1(x + Math.cos(ang) * L)}" y2="${f1(y + Math.sin(ang) * L)}" stroke="${c}" stroke-width="2.4" stroke-linecap="round"/>`;
    }
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + 0.3;
      g += O.berries(rnd, 100 + Math.cos(a) * R, 100 + Math.sin(a) * R, 3, 4.2, "#c0262e");
    }
    // Schleife
    g += `<g transform="translate(100,172)">
      <path d="M0,0 C-16,-16 -40,-14 -38,0 C-40,14 -16,16 0,0Z" fill="#a8192a"/>
      <path d="M0,0 C16,-16 40,-14 38,0 C40,14 16,16 0,0Z" fill="#a8192a"/>
      <path d="M-3,2 L-16,30 L-8,27 L-4,34 L2,4Z M3,2 L16,30 L8,27 L4,34 L-2,4Z" fill="#8e1222"/>
      <circle r="6" fill="#c42536"/></g>`;
    return `<svg viewBox="0 0 200 210" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${g}</svg>`;
  };
})();
