// Warun – panel admina: zakładanie kont, reset hasła, blokada, usuwanie.
// Klucz secret jest tylko tutaj (sekret WARUN_SECRET_KEY), nigdy na stronie.
// Działa wyłącznie dla zalogowanego użytkownika z app_metadata.role = "admin" (nadaje: admin.py make-admin).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SECRET = Deno.env.get("WARUN_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DOMAIN = Deno.env.get("WARUN_LOGIN_DOMAIN") ?? "warun.invalid";
const ORIGINS = ["https://wujekmicz.github.io", "http://localhost:8090", "http://127.0.0.1:8090"];
const LOGIN_RE = /^[a-z0-9._-]{2,32}$/;

function cors(origin: string) {
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

/* Hasło startowe łatwe do przepisania: xxxx-xxxx-xxxx bez mylących znaków */
function genPassword() {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  const buf = new Uint32Array(12);
  crypto.getRandomValues(buf);
  const ch = [...buf].map((n) => abc[n % abc.length]).join("");
  return `${ch.slice(0, 4)}-${ch.slice(4, 8)}-${ch.slice(8, 12)}`;
}

Deno.serve(async (req) => {
  const h = cors(req.headers.get("origin") ?? "");
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...h, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json({ error: "Niedozwolona metoda." }, 405);

  const admin = createClient(SB_URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: me, error: meErr } = await admin.auth.getUser(token);
  if (meErr || !me?.user) return json({ error: "Zaloguj się." }, 401);
  if (me.user.app_metadata?.role !== "admin") return json({ error: "Tylko dla admina." }, 403);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const id = String(body.id ?? "");
  const self = id === me.user.id;

  try {
    if (action === "list") {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) throw error;
      const { data: prof } = await admin.from("profiles").select("user_id,must_change");
      const mustChange = new Map((prof ?? []).map((p) => [p.user_id, p.must_change]));
      const now = Date.now();
      const users = data.users.map((u) => ({
        id: u.id,
        login: (u.email ?? "").replace("@" + DOMAIN, ""),
        display_name: u.user_metadata?.display_name ?? "",
        admin: u.app_metadata?.role === "admin",
        disabled: !!u.banned_until && new Date(u.banned_until).getTime() > now,
        must_change: !!mustChange.get(u.id),
        last_sign_in_at: u.last_sign_in_at ?? null,
        me: u.id === me.user.id,
      })).sort((a, b) => a.login.localeCompare(b.login));
      return json({ users });
    }

    if (action === "create") {
      const login = String(body.login ?? "").trim().toLowerCase();
      const name = String(body.display_name ?? "").trim().slice(0, 64);
      if (!LOGIN_RE.test(login)) {
        return json({ error: "Login: 2–32 znaki, małe litery, cyfry, kropka, myślnik lub podkreślnik." }, 400);
      }
      const password = genPassword();
      const { error } = await admin.auth.admin.createUser({
        email: `${login}@${DOMAIN}`, password, email_confirm: true,
        user_metadata: { login, display_name: name },
      });
      if (error) {
        const taken = /already|exists|registered/i.test(error.message);
        return json({ error: taken ? `Login „${login}” jest już zajęty.` : error.message }, 400);
      }
      return json({ login, password });
    }

    if (!id) return json({ error: "Brak konta." }, 400);

    if (action === "reset") {
      const password = genPassword();
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) throw error;
      await admin.from("profiles").update({ must_change: true }).eq("user_id", id);
      return json({ password });
    }
    if (action === "disable" || action === "enable") {
      if (self) return json({ error: "Nie możesz zablokować własnego konta." }, 400);
      const { error } = await admin.auth.admin.updateUserById(id, {
        ban_duration: action === "disable" ? "876000h" : "none",
      });
      if (error) throw error;
      return json({ ok: true });
    }
    if (action === "delete") {
      if (self) return json({ error: "Nie możesz usunąć własnego konta." }, 400);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw error;
      return json({ ok: true });
    }
    return json({ error: "Nieznana akcja." }, 400);
  } catch (e) {
    console.error(action, e);
    return json({ error: e instanceof Error ? e.message : "Błąd serwera." }, 500);
  }
});
