/* Konto i własne skrzydła (Supabase). Bez konfiguracji w config.js strona działa z samymi presetami. */
(function(){
"use strict";
const CFG = window.WARUN_CONFIG || {};
const box = document.getElementById("acct");
if (!CFG.supabaseUrl || !CFG.supabaseAnonKey || !window.supabase || !window.WARUN) return;
const SB = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
const DOMAIN = CFG.loginDomain || "warun.invalid";

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const f1 = x => x == null ? "–" : (Math.round(x * 10) / 10).toFixed(1).replace(".", ",");
const num = v => { const x = parseFloat(String(v).replace(",", ".")); return isFinite(x) ? x : NaN; };
const toEmail = login => login.trim().toLowerCase() + "@" + DOMAIN;
/* Punkt startowy przy kopiowaniu presetu: progi z klifu w Chłapowie */
const COPY = {A: {min: 4, max: 7, gust: 8.5, spread: 3}, B: {min: 4, max: 8, gust: 9.5, spread: 4}};

let USER = null, PROFILE = null, WINGS = [];
let VIEW = "idle";   // idle | login | password | wings
let EDIT = null;     // id edytowanego skrzydła albo "new"
let ASK_DEL = null;  // id skrzydła czekającego na potwierdzenie usunięcia
let MSG = null;      // {kind, text}

function setMsg(kind, text) { MSG = kind ? {kind, text} : null; }
function msgHtml() { return MSG ? `<div class="msg ${MSG.kind}" role="status">${esc(MSG.text)}</div>` : ""; }
function fromRow(r) { return {id: "u:" + r.id, dbId: r.id, name: r.name, min: r.wmin, max: r.wmax, gust: r.gust, spread: r.spread}; }

async function loadUser() {
  const {data} = await SB.auth.getSession();
  USER = data.session ? data.session.user : null;
  PROFILE = null; WINGS = [];
  if (USER) {
    const p = await SB.from("profiles").select("*").eq("user_id", USER.id).maybeSingle();
    PROFILE = p.data || {login: (USER.email || "").split("@")[0], must_change: false};
    const w = await SB.from("wings").select("*").order("created_at");
    WINGS = (w.data || []).map(fromRow);
    if (PROFILE.must_change) VIEW = "password";
    else if (VIEW === "login" || VIEW === "idle") VIEW = "idle";
  } else if (VIEW !== "login") VIEW = "idle";
  window.WARUN.setOwnWings(WINGS);
  render();
}

function render() {
  if (!USER) {
    box.innerHTML = VIEW === "login" ? `
      <div class="bar"><strong>Logowanie</strong><button type="button" class="lnk" data-a="cancel">Anuluj</button></div>
      <form data-f="login" novalidate>
        <label>Login<input name="login" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
        <label>Hasło<input name="password" type="password" autocomplete="current-password" required></label>
        <button class="btn" type="submit">Zaloguj</button>
      </form>${msgHtml()}
      <span class="muted" style="font-size:.8rem">Konta zakłada admin klubu. Nie pamiętasz hasła? Napisz do Maćka.</span>`
    : `<div class="bar"><span class="muted" style="font-size:.88rem">Własne skrzydła z Twoimi progami – po zalogowaniu.</span>
        <button type="button" class="lnk" data-a="login">Zaloguj się</button></div>${msgHtml()}`;
    return;
  }
  const who = esc(PROFILE.display_name || PROFILE.login);
  const head = `<div class="bar"><strong>Moje skrzydła · ${who}</strong><div class="links">
      ${VIEW === "wings" || PROFILE.must_change ? "" : '<button type="button" class="lnk" data-a="wings">Moje skrzydła</button>'}
      ${PROFILE.must_change ? "" : '<button type="button" class="lnk" data-a="password">Zmień hasło</button>'}
      <button type="button" class="lnk" data-a="logout">Wyloguj</button></div></div>`;
  if (VIEW === "password") {
    box.innerHTML = head + `
      ${PROFILE.must_change ? '<div class="msg warn"><strong>Masz hasło startowe.</strong> Ustaw własne – potem możesz dodać skrzydła.</div>' : ""}
      <form data-f="password" novalidate>
        <input name="username" autocomplete="username" value="${esc(PROFILE.login)}" hidden>
        <label>Obecne hasło<input name="current" type="password" autocomplete="current-password" required></label>
        <label>Nowe hasło (min. 8 znaków)<input name="new" type="password" autocomplete="new-password" minlength="8" required></label>
        <label>Powtórz nowe<input name="new2" type="password" autocomplete="new-password" minlength="8" required></label>
        <button class="btn" type="submit">Zapisz hasło</button>
        ${PROFILE.must_change ? "" : '<button class="btn ghost" type="button" data-a="idle">Anuluj</button>'}
      </form>${msgHtml()}`;
    return;
  }
  if (VIEW !== "wings") { box.innerHTML = head + msgHtml(); return; }
  const rows = WINGS.map(w => EDIT === w.id ? `<tr><td colspan="3">${formHtml(w)}</td></tr>` : `
    <tr><td><strong>${esc(w.name)}</strong></td>
      <td class="mono" style="font-size:.8rem">${f1(w.min)}–${f1(w.max)} m/s<br>por. ${f1(w.gust)} · różn. ${f1(w.spread)}</td><td class="acts">${ASK_DEL === w.id
        ? `Usunąć? <button type="button" class="lnk" data-a="delYes" data-id="${esc(w.id)}" style="color:var(--no)">Tak</button>
           &nbsp; <button type="button" class="lnk" data-a="delNo">Nie</button>`
        : `<button type="button" class="lnk" data-a="edit" data-id="${esc(w.id)}">Edytuj</button>
           &nbsp; <button type="button" class="lnk" data-a="del" data-id="${esc(w.id)}" style="color:var(--no)">Usuń</button>`}</td></tr>`).join("");
  box.innerHTML = head + `
    ${WINGS.length ? `<div style="overflow-x:auto"><table><thead><tr><th>Skrzydło</th><th>Progi</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>` : '<span class="muted" style="font-size:.88rem">Nie masz jeszcze własnych skrzydeł. Gotowe EN-A, EN-B i Parakite są zawsze dostępne.</span>'}
    ${EDIT === "new" ? formHtml(null) : '<div><button type="button" class="btn ghost" data-a="new">+ Dodaj skrzydło</button></div>'}
    ${msgHtml()}
    <span class="muted" style="font-size:.8rem">Na każdej miejscówce obowiązuje też jej własne minimum (np. wydma 6 m/s) – liczy się bezpieczniejsza z wartości.</span>`;
}

function formHtml(w) {
  const v = w || {name: "", min: "", max: "", gust: "", spread: ""};
  const presets = window.WARUN.presets;
  return `<form data-f="wing" data-id="${w ? esc(w.id) : ""}" novalidate>
    <label>Nazwa<input name="name" maxlength="40" value="${esc(v.name)}" placeholder="np. Rush 6 ML" required></label>
    <label class="num">Min m/s<input name="min" inputmode="decimal" value="${esc(v.min)}" required></label>
    <label class="num">Max m/s<input name="max" inputmode="decimal" value="${esc(v.max)}" required></label>
    <label class="num">Porywy do<input name="gust" inputmode="decimal" value="${esc(v.gust)}" required></label>
    <label class="num">Różnica<input name="spread" inputmode="decimal" value="${esc(v.spread)}" required></label>
    ${w ? "" : `<label class="num">Kopiuj z<select name="copy"><option value="">–</option>${presets.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select></label>`}
    <button class="btn" type="submit">${w ? "Zapisz" : "Dodaj"}</button>
    <button class="btn ghost" type="button" data-a="cancelEdit">Anuluj</button>
  </form>`;
}

function readWing(f) {
  const w = {name: f.name.value.trim(), wmin: num(f.min.value), wmax: num(f.max.value), gust: num(f.gust.value), spread: num(f.spread.value)};
  if (!w.name) return [null, "Podaj nazwę skrzydła."];
  if ([w.wmin, w.wmax, w.gust, w.spread].some(isNaN)) return [null, "Wpisz wszystkie progi jako liczby (m/s)."];
  if (w.wmin < 0 || w.wmax > 30 || w.gust > 40) return [null, "Progi poza rozsądnym zakresem (0–30 m/s)."];
  if (w.wmax <= w.wmin) return [null, "Max musi być większy niż min."];
  if (w.gust < w.wmax) return [null, "Limit porywów nie może być niższy niż max wiatru."];
  if (w.spread <= 0) return [null, "Różnica poryw − średni musi być większa od zera."];
  return [w, null];
}

box.addEventListener("change", e => {
  if (e.target.name !== "copy" || !e.target.value) return;
  const f = e.target.form, id = e.target.value;
  const p = COPY[id] || window.WARUN.presets.find(x => x.id === id);
  f.min.value = f1(p.min); f.max.value = f1(p.max); f.gust.value = f1(p.gust); f.spread.value = f1(p.spread);
  if (!f.name.value) f.name.value = "Moje " + window.WARUN.presets.find(x => x.id === id).name;
});

box.addEventListener("click", async e => {
  const b = e.target.closest("[data-a]"); if (!b) return;
  const a = b.dataset.a; setMsg(null);
  if (a === "login") VIEW = "login";
  else if (a === "cancel" || a === "idle") VIEW = "idle";
  else if (a === "password") VIEW = "password";
  else if (a === "wings") { VIEW = "wings"; EDIT = null; }
  else if (a === "new") EDIT = "new";
  else if (a === "edit") EDIT = b.dataset.id;
  else if (a === "cancelEdit") EDIT = null;
  else if (a === "logout") { await SB.auth.signOut(); VIEW = "idle"; return loadUser(); }
  else if (a === "del") ASK_DEL = b.dataset.id;
  else if (a === "delNo") ASK_DEL = null;
  else if (a === "delYes") {
    // Potwierdzenie w tabeli zamiast confirm() – okienka bywają blokowane przez przeglądarkę.
    const w = WINGS.find(x => x.id === b.dataset.id); ASK_DEL = null;
    if (!w) return render();
    const r = await SB.from("wings").delete().eq("id", w.dbId).select("id");
    if (r.error) setMsg("err", "Nie udało się usunąć: " + r.error.message);
    else if (!r.data || !r.data.length) setMsg("err", "Nie udało się usunąć – odśwież stronę i spróbuj ponownie.");
    else { setMsg("ok", `Usunięto „${w.name}”.`); return loadUser(); }
  }
  render();
  const first = box.querySelector("form input:not([hidden])"); if (first && a !== "logout") first.focus();
});

box.addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target, kind = f.dataset.f, btns = f.querySelectorAll("button");
  btns.forEach(x => x.disabled = true); setMsg(null);
  try {
    if (kind === "login") {
      const r = await SB.auth.signInWithPassword({email: toEmail(f.login.value), password: f.password.value});
      if (r.error) { setMsg("err", r.error.status === 429 ? "Za dużo prób. Spróbuj za kilka minut." : "Nieprawidłowy login lub hasło."); render(); return; }
      VIEW = "idle"; await loadUser(); return;
    }
    if (kind === "password") {
      if (f.new.value.length < 8) { setMsg("err", "Nowe hasło musi mieć co najmniej 8 znaków."); render(); return; }
      if (f.new.value !== f.new2.value) { setMsg("err", "Nowe hasła się różnią."); render(); return; }
      if (f.new.value === f.current.value) { setMsg("err", "Nowe hasło musi się różnić od obecnego."); render(); return; }
      const chk = await SB.auth.signInWithPassword({email: USER.email, password: f.current.value});
      if (chk.error) { setMsg("err", "Obecne hasło jest nieprawidłowe."); render(); return; }
      const up = await SB.auth.updateUser({password: f.new.value});
      if (up.error) { setMsg("err", up.error.message); render(); return; }
      await SB.from("profiles").update({must_change: false}).eq("user_id", USER.id);
      VIEW = "wings"; setMsg("ok", "Hasło zmienione."); await loadUser(); return;
    }
    if (kind === "wing") {
      const [w, err] = readWing(f);
      if (err) { setMsg("err", err); render(); keepForm(f); return; }
      const id = f.dataset.id, old = WINGS.find(x => x.id === id);
      const r = old ? await SB.from("wings").update(w).eq("id", old.dbId) : await SB.from("wings").insert(w);
      if (r.error) { setMsg("err", r.error.message); render(); return; }
      EDIT = null; setMsg("ok", old ? "Zapisano zmiany." : "Dodano skrzydło – jest już do wyboru u góry."); await loadUser(); return;
    }
  } finally { btns.forEach(x => x.disabled = false); }
});

/* Po błędzie walidacji zostaw wpisane wartości w formularzu */
function keepForm(old) {
  const f = box.querySelector('form[data-f="wing"]'); if (!f) return;
  for (const n of ["name", "min", "max", "gust", "spread"]) f[n].value = old[n].value;
}

SB.auth.onAuthStateChange(ev => { if (ev === "SIGNED_OUT" || ev === "TOKEN_REFRESHED") setTimeout(loadUser, 0); });
loadUser();
})();
