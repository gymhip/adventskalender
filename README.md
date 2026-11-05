# Adventskalender – Gymnasium Hilpoltstein

Digitaler Adventskalender, der jedes Jahr automatisch weiterläuft. Ein Redaktionsbereich mit gemeinsamem Passwort ermöglicht es dem Kollegium, die Türchen zu befüllen.

| Seite | Wofür |
|---|---|
| `index.html` | Der Kalender für alle: Flügeltür-Intro, 24 Türchen, Musik |
| `admin.html` | Redaktion: Türchen befüllen, Vorschau, Kalender beenden |

## So funktioniert's

- **Saison:** Ab 1. November zeigt die Seite einen Countdown für das laufende Jahr. Ab 1. Dezember öffnet sich täglich ein Türchen (nach deutscher Zeit). Nach dem 24. bleibt alles offen.
- **Beenden:** In der Redaktion auf „Kalender beenden“ klicken. Besucher sehen dann „Bis zum nächsten Advent“. Im nächsten November startet der neue Jahrgang **von selbst**.
- **Türchen-Arten:**
  - *Karte*: Überschrift + Text auf einer von drei Vorlagen (Tannenzweig, Sternennacht, Winterpapier). Die Schrift passt sich der Textlänge automatisch an.
  - *Link*: YouTube, Vimeo, Spotify und Apple Podcasts werden eingebettet, MP3/MP4/Bild-Links direkt angezeigt, alle anderen Adressen erscheinen als Link-Karte.
- **Entwurf / Fertig:** Nur Türchen mit „Fertig“ erscheinen – und erst an ihrem Tag. Das prüft der Server, nicht das iPad. Wer die Uhr verstellt oder in den Quelltext schaut, sieht nichts vorab.
- **Datenschutz:** Schriften liegen lokal (keine Google-Server). Videos und Podcasts laden erst nach einem Klick (2-Klick-Lösung, YouTube über `youtube-nocookie.com`).
- **Vorschau:** In der Redaktion ein Datum wählen → „Kalender an diesem Tag ansehen“. Das klappt nur, wenn man in diesem Browser angemeldet ist.

## Demo-Modus (ohne Datenbank)

Solange in `assets/config.js` keine Supabase-Daten stehen, läuft alles im Demo-Modus mit Beispielinhalten. Das Passwort für die Redaktion lautet dann `demo`, und alle Änderungen bleiben im eigenen Browser. So lässt sich alles auf GitHub Pages ausprobieren, bevor die Datenbank steht.

## Einrichtung (einmalig, ca. 20 Minuten)

### 1. Supabase-Projekt anlegen
1. Auf [supabase.com](https://supabase.com) ein kostenloses Konto anlegen → **New project**.
2. Region **Central EU (Frankfurt)** wählen und ein Datenbank-Passwort vergeben (wird später nicht gebraucht, aber gut aufheben).

### 2. Datenbank einrichten
1. In `supabase/setup.sql` in der Funktion `is_admin` die E-Mail-Adresse des gemeinsamen Kontos prüfen (Standard: `adventskalender@gym-hip.de`). Die Adresse muss nicht wirklich existieren.
2. Supabase → **SQL Editor** → **New query** → den ganzen Inhalt von `setup.sql` einfügen → **Run**.

### 3. Gemeinsames Konto anlegen
1. Supabase → **Authentication → Users → Add user → Create new user**.
2. Die E-Mail-Adresse aus Schritt 2 eintragen, ein gutes Passwort vergeben, **Auto Confirm User** anhaken.
3. Supabase → **Authentication → Sign In / Providers**: **Allow new users to sign up** ausschalten.
   (Doppelte Sicherung: Auch ohne diesen Schritt hätte ein fremdes Konto keine Schreibrechte.)

### 4. Zugangsdaten eintragen
Supabase → **Project Settings → API**:
- **Project URL** → in `assets/config.js` bei `supabaseUrl`
- **anon public** bzw. **publishable key** → bei `supabaseAnonKey`

Optional `impressumUrl` und `datenschutzUrl` setzen, zum Beispiel auf die entsprechenden Seiten von gym-hip.de.

### 5. Auf GitHub Pages veröffentlichen
1. Neues Repository anlegen (z. B. `adventskalender`) und **den Inhalt dieses Ordners** hochladen (`index.html` liegt im Hauptverzeichnis).
2. Repository → **Settings → Pages** → Source: *Deploy from a branch*, Branch `main`, Ordner `/ (root)`.
3. Nach ca. einer Minute ist der Kalender erreichbar unter `https://<name>.github.io/adventskalender/` und die Redaktion unter `…/admin.html`.

## Jährliche Pflege

- **Anfang November:** Supabase-Dashboard öffnen. Kostenlose Projekte werden nach einer Woche ohne Nutzung pausiert, dann einmal auf **Restore** klicken. Danach das Passwort für die Redaktion an das Kollegium geben (am besten jedes Jahr ein neues: Authentication → Users → … → Reset password).
- **Im Januar:** In der Redaktion „Kalender beenden“.
- Die Inhalte früherer Jahre bleiben gespeichert und sind in der Redaktion über die Jahresauswahl erreichbar.

## Dateien

```
index.html            Kalender
admin.html            Redaktion
assets/config.js      ← Zugangsdaten eintragen
assets/common.js      Datum/Saison, Datenzugriff, Link-Erkennung, Kartenvorlagen
assets/calendar.js    Kalender-Logik inkl. Flügeltür
assets/admin.js       Redaktion
assets/*.css          Gestaltung
assets/fonts/         Schriften (SIL Open Font License, Lizenzen liegen bei)
assets/musik.mp3      Hintergrundmusik (aus dem Kalender 2025 übernommen)
supabase/setup.sql    Datenbank, Zugriffsregeln
```
