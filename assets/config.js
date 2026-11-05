/* =====================================================================
   Adventskalender GymHIP – Konfiguration
   ---------------------------------------------------------------------
   Solange supabaseUrl leer ist, läuft der Kalender im DEMO-MODUS:
   Beispielinhalte, Admin-Passwort „demo“, alles nur im eigenen Browser.

   Für den echten Betrieb die Werte aus Supabase eintragen
   (Project Settings → API). Der „anon/publishable key“ darf öffentlich
   sein – geschützt wird über die Regeln in supabase/setup.sql.
   ===================================================================== */
window.ADVENT_CONFIG = {
  supabaseUrl: "",          // z. B. "https://abcdefgh.supabase.co"
  supabaseAnonKey: "",      // anon- bzw. publishable-Key

  // Das gemeinsame Admin-Konto (muss in Supabase angelegt sein und
  // in supabase/setup.sql in der Funktion is_admin stehen).
  adminEmail: "adventskalender@gym-hip.de",

  // Rechtliche Links im Fußbereich (leer lassen = ausblenden)
  impressumUrl: "",
  datenschutzUrl: "",

  // Hintergrundmusik (Datei in assets/ ablegen; fehlt sie, verschwindet der Knopf)
  musicFile: "assets/musik.mp3"
};
