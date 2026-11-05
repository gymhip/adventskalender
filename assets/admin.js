/* =====================================================================
   Adventskalender GymHIP – Redaktion
   ===================================================================== */
(function () {
  "use strict";
  const A = window.Advent;
  const api = A.api;
  const $ = (id) => document.getElementById(id);
  const today = A.realToday();

  let settings = null;
  let season = today.y;
  let doors = new Map();
  let edit = null; // { day, original, dirty }

  /* ---------- Hilfen --------------------------------------------- */
  let toastTimer;
  function toast(msg, error = false) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.toggle("is-error", error);
    t.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("is-visible"), error ? 5000 : 2600);
  }

  async function guard(fn) {
    try { return await fn(); }
    catch (e) {
      console.error(e);
      if (e instanceof A.AuthError) { showLogin(e.message); return; }
      toast("Das hat nicht geklappt: " + (e.message || e), true);
      throw e;
    }
  }

  const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString("de-DE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
  const templateName = (t) => (A.TEMPLATES.find((x) => x.id === +t) || A.TEMPLATES[0]).name;
  const isFilled = (d) => d && ((d.kind === "card" && (d.heading || d.body)) || (d.kind === "link" && d.url));

  /* ---------- Anmeldung ------------------------------------------ */
  function showLogin(msg = "") {
    $("app").hidden = true;
    $("editor").hidden = true;
    $("login").hidden = false;
    $("login-error").textContent = msg;
    $("login-demo").hidden = !api.demo;
    setTimeout(() => $("password").focus(), 50);
  }

  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("login-btn");
    btn.disabled = true;
    btn.textContent = "Einen Moment …";
    $("login-error").textContent = "";
    try {
      await api.login($("password").value);
      $("password").value = "";
      await showApp();
    } catch (err) {
      $("login-error").textContent = err.message || "Anmeldung fehlgeschlagen.";
    } finally {
      btn.disabled = false;
      btn.textContent = "Anmelden";
    }
  });

  $("logout").addEventListener("click", () => { api.logout(); showLogin(); });

  /* ---------- Hauptansicht --------------------------------------- */
  async function showApp() {
    $("login").hidden = true;
    $("app").hidden = false;
    $("demo-note").hidden = !api.demo;

    const sel = $("season");
    sel.innerHTML = [today.y - 1, today.y, today.y + 1].map((y) => `<option value="${y}">Advent ${y}</option>`).join("");
    sel.value = String(season);

    await guard(async () => { settings = await api.getSettings(); });
    fillSettings();
    await loadSeason();
  }

  $("season").addEventListener("change", async (e) => { season = +e.target.value; await loadSeason(); });

  async function loadSeason() {
    await guard(async () => {
      const rows = await api.getAllDoors(season);
      doors = new Map(rows.map((r) => [r.day, r]));
    });
    $("preview-date").value = `${season}-12-${String(today.m === 12 && today.y === season ? Math.min(today.d, 24) : 1).padStart(2, "0")}`;
    renderStats();
    renderStatus();
    renderGrid();
  }

  function renderStats() {
    let pub = 0, draft = 0;
    for (let d = 1; d <= 24; d++) {
      const r = doors.get(d);
      if (isFilled(r)) r.published ? pub++ : draft++;
    }
    const empty = 24 - pub - draft;
    $("stats").innerHTML = `
      <h2>Advent ${season}: ${pub + draft} von 24 Türchen befüllt</h2>
      <div class="progress" aria-hidden="true"><span class="p-pub" style="width:${(pub / 24) * 100}%"></span><span class="p-draft" style="width:${(draft / 24) * 100}%"></span></div>
      <ul class="legend">
        <li style="--dot:var(--green)"><b>${pub}</b> fertig</li>
        <li style="--dot:#f0b941"><b>${draft}</b> Entwurf</li>
        <li style="--dot:#d5dcd2"><b>${empty}</b> leer</li>
      </ul>`;
  }

  function renderStatus() {
    const live = A.seasonOf(today);
    const closed = settings.closed_season != null && settings.closed_season >= season;
    let pill, text, action = "";
    if (closed) {
      pill = `<span class="pill pill--closed">Beendet</span>`;
      text = `Der Kalender ${season} ist beendet. Besucher sehen „Bis zum nächsten Advent“. Im November ${season + 1} startet der neue Kalender automatisch.`;
      action = `<button class="btn btn--secondary" type="button" data-act="reopen">Wieder öffnen</button>`;
    } else if (season > live || (season === live && today.m === 11)) {
      pill = `<span class="pill pill--wait">Startet automatisch</span>`;
      text = (season === live && today.m === 11 ? "Der Countdown läuft bereits." : `Ab 1. November ${season} zeigt die Seite einen Countdown.`) +
        " Ab 1. Dezember öffnet sich täglich ein Türchen. Nur Türchen mit „Fertig“ erscheinen.";
    } else if (season < live) {
      pill = `<span class="pill pill--closed">Vergangen</span>`;
      text = `Der Advent ${season} ist vorbei. Diese Inhalte bleiben als Archiv gespeichert.`;
    } else if (today.m === 12) {
      pill = `<span class="pill pill--live">Läuft</span>`;
      text = today.d <= 24 ? `Heute ist Türchen ${today.d} offen.` : "Alle 24 Türchen sind offen. Der Kalender bleibt online, bis du ihn beendest.";
      action = `<button class="btn btn--ghost" type="button" data-act="close">Kalender beenden</button>`;
    } else {
      pill = `<span class="pill pill--live">Online</span>`;
      text = "Alle 24 Türchen sind offen. Der Kalender bleibt online, bis du ihn beendest.";
      action = `<button class="btn btn--secondary" type="button" data-act="close">Kalender beenden</button>`;
    }
    $("status").innerHTML = `<h2>Status</h2>${pill}<p>${text}</p>${action}`;
  }

  $("status").addEventListener("click", async (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    if (act === "close" && !confirm(`Kalender ${season} jetzt beenden? Besucher sehen dann nur noch „Bis zum nächsten Advent“.`)) return;
    const closed_season = act === "close" ? season : null;
    await guard(async () => {
      await api.saveSettings({ closed_season });
      settings.closed_season = closed_season;
      renderStatus();
      toast(act === "close" ? "Kalender beendet." : "Kalender wieder geöffnet.");
    });
  });

  function renderGrid() {
    const grid = $("grid");
    grid.innerHTML = "";
    for (let day = 1; day <= 24; day++) {
      const d = doors.get(day);
      const filled = isFilled(d);
      const state = !filled ? "empty" : d.published ? "pub" : "draft";
      const chip = { empty: "Leer", draft: "Entwurf", pub: "Fertig" }[state];
      let title = "Noch nichts eingetragen";
      let meta = d && d.assignee ? `Zuständig: ${d.assignee}` : "Antippen zum Befüllen";
      if (filled) {
        title = d.heading || (d.kind === "link" ? (A.parseLink(d.url)?.label || "Link") : (d.body || "").slice(0, 60));
        const kind = d.kind === "card" ? `Karte · ${templateName(d.template)}` : (A.parseLink(d.url)?.label || "Link");
        meta = [kind, d.assignee].filter(Boolean).join(" · ");
      }
      const isToday = season === today.y && today.m === 12 && today.d === day;
      const b = document.createElement("button");
      b.type = "button";
      b.className = `tile tile--${state}${isToday ? " tile--today" : ""}`;
      b.innerHTML = `
        <span class="tile__top"><span class="tile__num">${day}</span><span class="tile__chip">${chip}</span></span>
        <span class="tile__title">${A.esc(title)}</span>
        <span class="tile__meta">${A.esc(meta)}</span>`;
      b.setAttribute("aria-label", `Türchen ${day}: ${chip}. ${title}`);
      b.addEventListener("click", () => openEditor(day));
      grid.appendChild(b);
    }
  }

  /* ---------- Einstellungen & Vorschau ---------------------------- */
  function fillSettings() {
    $("set-title").value = settings.title || "";
    $("set-subtitle").value = settings.subtitle || "";
    $("set-music").checked = !!settings.music;
  }
  $("settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const patch = { title: $("set-title").value.trim() || "Adventskalender", subtitle: $("set-subtitle").value.trim(), music: $("set-music").checked };
    await guard(async () => { await api.saveSettings(patch); Object.assign(settings, patch); toast("Einstellungen gespeichert."); });
  });
  $("preview-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = $("preview-date").value;
    if (v) window.open(`./?datum=${encodeURIComponent(v)}`, "_blank", "noopener");
  });
  $("demo-reset").addEventListener("click", async () => {
    if (!confirm("Alle Demo-Inhalte auf die Beispieldaten zurücksetzen?")) return;
    api.reset();
    settings = await api.getSettings();
    fillSettings();
    await loadSeason();
    toast("Beispieldaten wiederhergestellt.");
  });

  /* ---------- Editor ---------------------------------------------- */
  const F = {
    form: () => $("ed-form"),
    kind: () => document.querySelector('input[name="kind"]:checked').value,
    template: () => +(document.querySelector('input[name="template"]:checked')?.value || 1),
    device: () => document.querySelector('input[name="device"]:checked').value,
  };

  function currentDraft() {
    return {
      season, day: edit.day,
      kind: F.kind(),
      template: F.template(),
      heading: $("ed-heading").value.trim(),
      body: $("ed-body").value.replace(/\s+$/, ""),
      url: $("ed-url").value.trim(),
      credit: $("ed-credit").value.trim(),
      assignee: $("ed-assignee").value.trim(),
      published: $("ed-published").checked,
    };
  }

  function buildTemplatePicker() {
    const box = $("ed-templates");
    if (box.childElementCount) return;
    A.TEMPLATES.forEach((t) => {
      const l = document.createElement("label");
      l.className = "tpl";
      l.title = t.hint;
      l.innerHTML = `<input type="radio" name="template" value="${t.id}"><div class="tpl__card"></div><span class="tpl__name">${t.name}</span>`;
      box.appendChild(l);
    });
  }

  function renderTemplateThumbs() {
    const d = currentDraft();
    document.querySelectorAll(".tpl").forEach((l) => {
      const id = +l.querySelector("input").value;
      const holder = l.querySelector(".tpl__card");
      holder.innerHTML = "";
      const card = A.buildCard({ ...d, credit: "", template: id, heading: d.heading || "Überschrift", body: d.body || "Dein Text" }, { portrait: false, noFit: true });
      holder.appendChild(card);
      A.fitCard(card, 4);
    });
  }

  let previewTimer;
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, 120);
  }

  function renderPreview() {
    if (!edit) return;
    const d = currentDraft();
    const phone = F.device() === "phone";
    $("ed-stage").classList.toggle("is-phone", phone);
    const out = $("ed-preview");
    out.innerHTML = "";
    out.appendChild(A.renderDoor(d, { portrait: phone }));
    if (d.kind === "card") renderTemplateThumbs();
  }

  function updateUI() {
    const kind = F.kind();
    $("editor").dataset.kind = kind;
    // Zeichenzähler
    document.querySelectorAll(".count").forEach((c) => {
      const inp = $(c.dataset.for);
      c.textContent = `${inp.value.length}/${inp.maxLength}`;
      c.classList.toggle("is-high", inp.id === "ed-body" && kind === "card" && inp.value.length > 250);
    });
    // Link-Erkennung
    const det = $("ed-detect");
    const info = A.parseLink($("ed-url").value);
    if (!info) { det.textContent = ""; det.className = "detect"; }
    else if (info.kind === "invalid") { det.textContent = "✗ Das sieht nicht wie ein gültiger Link aus."; det.className = "detect detect--bad"; }
    else if (info.kind === "web") { det.textContent = `↗ Wird als Link-Karte zu ${info.host} angezeigt.`; det.className = "detect detect--web"; }
    else { det.textContent = `✓ Erkannt: ${info.label} – wird direkt eingebettet.`; det.className = "detect detect--ok"; }
    // Veröffentlichen
    const pub = $("ed-published").checked;
    $("ed-pub-title").textContent = pub ? "Fertig" : "Entwurf";
    $("ed-pub-hint").textContent = pub ? `Erscheint am ${edit.day}. Dezember ${season} automatisch.` : "Wird noch nicht angezeigt – du kannst später weitermachen.";
  }

  function onEdit() {
    if (edit) edit.dirty = true;
    updateUI();
    schedulePreview();
  }

  function openEditor(day) {
    buildTemplatePicker();
    const d = doors.get(day) || { kind: "card", template: 1, heading: "", body: "", url: "", credit: "", assignee: "", published: false };
    edit = { day, original: d, dirty: false };
    $("ed-title").textContent = `Türchen ${day}`;
    $("ed-date").textContent = `${day}. Dezember ${season}`;
    document.querySelector(`input[name="kind"][value="${d.kind === "link" ? "link" : "card"}"]`).checked = true;
    document.querySelector(`input[name="template"][value="${[1, 2, 3].includes(+d.template) ? +d.template : 1}"]`).checked = true;
    $("ed-heading").value = d.heading || "";
    $("ed-body").value = d.body || "";
    $("ed-url").value = d.url || "";
    $("ed-credit").value = d.credit || "";
    $("ed-assignee").value = d.assignee || "";
    $("ed-published").checked = !!d.published;
    $("ed-meta").textContent = d.updated_at ? `Zuletzt geändert: ${fmtDateTime(d.updated_at)}` : "";
    $("ed-clear").hidden = !doors.has(day);
    if (window.innerWidth < 700) document.querySelector('input[name="device"][value="phone"]').checked = true;
    $("editor").hidden = false;
    document.documentElement.style.overflow = "hidden";
    updateUI();
    renderPreview();
    setTimeout(() => (isFilled(d) ? null : $(d.kind === "link" ? "ed-url" : "ed-heading").focus()), 80);
  }

  function closeEditor(force = false) {
    if (!force && edit && edit.dirty && !confirm("Änderungen verwerfen?")) return;
    clearTimeout(previewTimer);
    $("editor").hidden = true;
    $("ed-preview").innerHTML = "";
    document.documentElement.style.overflow = "";
    edit = null;
  }

  async function save() {
    const d = currentDraft();
    if (d.kind === "card" && !d.heading && !d.body) { toast("Bitte mindestens eine Überschrift oder einen Text eingeben.", true); return; }
    if (d.kind === "link") {
      const info = A.parseLink(d.url);
      if (!info || info.kind === "invalid") { toast("Bitte einen gültigen Link eintragen.", true); $("ed-url").focus(); return; }
      if (!/^https?:\/\//i.test(d.url)) d.url = "https://" + d.url;
    }
    const btn = $("ed-save");
    btn.disabled = true;
    try {
      await guard(async () => {
        // Hat in der Zwischenzeit jemand anderes gespeichert?
        const current = await api.getDoor(season, edit.day);
        if (current && edit.original.updated_at && current.updated_at !== edit.original.updated_at) {
          if (!confirm("Jemand anderes hat dieses Türchen inzwischen geändert. Trotzdem mit deiner Version überschreiben?")) return;
        }
        const saved = await api.saveDoor(d);
        doors.set(edit.day, saved || d);
        renderStats();
        renderGrid();
        toast(d.published ? `Türchen ${edit.day} gespeichert – erscheint am ${edit.day}. Dezember.` : `Türchen ${edit.day} als Entwurf gespeichert.`);
        closeEditor(true);
      });
    } finally {
      btn.disabled = false;
    }
  }

  async function clearDoor() {
    if (!confirm(`Türchen ${edit.day} wirklich leeren? Der Inhalt wird gelöscht.`)) return;
    await guard(async () => {
      await api.deleteDoor(season, edit.day);
      doors.delete(edit.day);
      renderStats();
      renderGrid();
      toast(`Türchen ${edit.day} geleert.`);
      closeEditor(true);
    });
  }

  $("ed-form").addEventListener("input", onEdit);
  $("ed-form").addEventListener("change", onEdit);
  document.querySelectorAll('input[name="device"]').forEach((r) => r.addEventListener("change", renderPreview));
  $("ed-save").addEventListener("click", save);
  $("ed-clear").addEventListener("click", clearDoor);
  $("ed-cancel").addEventListener("click", () => closeEditor());
  $("ed-close").addEventListener("click", () => closeEditor());
  document.querySelector(".editor__backdrop").addEventListener("click", () => closeEditor());
  document.addEventListener("keydown", (e) => {
    if ($("editor").hidden) return;
    if (e.key === "Escape") closeEditor();
    if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); save(); }
  });
  window.addEventListener("beforeunload", (e) => { if (edit && edit.dirty) { e.preventDefault(); e.returnValue = ""; } });

  /* ---------- Start ----------------------------------------------- */
  if (api.isLoggedIn()) showApp().catch(() => showLogin());
  else showLogin();
})();
