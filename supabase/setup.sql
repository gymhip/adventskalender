-- =====================================================================
--  Adventskalender GymHIP – Datenbank-Einrichtung (Supabase)
--  Einmal komplett im Supabase „SQL Editor“ ausführen.
--
--  VORHER ANPASSEN: die E-Mail-Adresse des gemeinsamen Admin-Kontos
--  (unten in der Funktion is_admin, Zeile mit  >>> HIER <<<).
--  Sie muss genau der Adresse entsprechen, die du unter
--  Authentication → Users anlegst und in assets/config.js einträgst.
-- =====================================================================

-- ---------- Wer ist Admin? -------------------------------------------
-- Nur dieses eine Konto darf schreiben. Selbst wenn sich jemand über
-- die öffentliche API ein eigenes Konto anlegen würde, hätte es keine
-- Schreibrechte.
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'adventskalender@gym-hip.de'  -- >>> HIER <<<
$$;

-- ---------- Einstellungen (genau eine Zeile) --------------------------
create table if not exists public.settings (
  id             int primary key default 1 check (id = 1),
  title          text not null default 'Adventskalender',
  subtitle       text not null default 'Gymnasium Hilpoltstein',
  music          boolean not null default true,
  -- Saison (Jahr), die im Backend beendet wurde. Ab November des
  -- Folgejahres startet der Kalender automatisch wieder.
  closed_season  int,
  updated_at     timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ---------- Türchen ---------------------------------------------------
create table if not exists public.doors (
  season      int  not null check (season between 2024 and 2100),
  day         int  not null check (day between 1 and 24),
  kind        text not null default 'card' check (kind in ('card', 'link')),
  template    int  not null default 1 check (template between 1 and 3),
  heading     text check (char_length(heading) <= 80),
  body        text check (char_length(body) <= 600),
  url         text check (char_length(url) <= 600),
  credit      text check (char_length(credit) <= 80),   -- öffentlich: „Von …“
  assignee    text check (char_length(assignee) <= 80), -- intern: Wer kümmert sich?
  published   boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (season, day)
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists doors_touch on public.doors;
create trigger doors_touch before update on public.doors
  for each row execute function public.touch_updated_at();

drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- ---------- Zugriffsregeln (Row Level Security) -----------------------
alter table public.settings enable row level security;
alter table public.doors    enable row level security;

drop policy if exists "settings lesen"    on public.settings;
drop policy if exists "settings schreiben" on public.settings;
create policy "settings lesen"     on public.settings for select using (true);
create policy "settings schreiben" on public.settings for update
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "tueren oeffentlich" on public.doors;
drop policy if exists "tueren admin"       on public.doors;

-- Öffentlich sichtbar ist ein Türchen nur, wenn es veröffentlicht ist
-- UND sein Tag nach deutscher Zeit erreicht ist. Das entscheidet der
-- Server – die Uhr am iPad zu verstellen bringt also nichts.
create policy "tueren oeffentlich" on public.doors for select
  using (
    published
    and make_date(season, 12, day) <= (now() at time zone 'Europe/Berlin')::date
  );

create policy "tueren admin" on public.doors for all
  using (public.is_admin()) with check (public.is_admin());

-- Interne Spalten (assignee, published, updated_at) bleiben für
-- Besucher unsichtbar.
revoke all on public.doors from anon;
grant select (season, day, kind, template, heading, body, url, credit)
  on public.doors to anon;

revoke all on public.settings from anon;
grant select (title, subtitle, music, closed_season) on public.settings to anon;

grant select, insert, update, delete on public.doors to authenticated;
grant select, update on public.settings to authenticated;
