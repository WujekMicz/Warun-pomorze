/* Licznik odwiedzin: jeden wpis na otwarcie strony. Bez ciasteczek i danych osobowych –
   losowy identyfikator przeglądarki (localStorage), telefon/komputer, czy zalogowany. */
(function(){
"use strict";
const CFG = window.WARUN_CONFIG || {};
if (!CFG.supabaseUrl || !CFG.supabaseAnonKey) return;
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;  // podgląd lokalny się nie liczy
const page = document.body.dataset.page || "index";

function visitorId() {
  try {
    let id = localStorage.getItem("warun-visitor");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("warun-visitor", id); }
    return id;
  } catch (e) { return crypto.randomUUID(); }
}
function loggedIn() {
  try { return Object.keys(localStorage).some(k => /^sb-.*-auth-token$/.test(k)); } catch (e) { return false; }
}
const mobile = matchMedia("(pointer:coarse)").matches || /Mobi|Android|iPhone/i.test(navigator.userAgent);

fetch(CFG.supabaseUrl.replace(/\/$/, "") + "/rest/v1/visits", {
  method: "POST",
  keepalive: true,
  headers: {"apikey": CFG.supabaseAnonKey, "Content-Type": "application/json", "Prefer": "return=minimal"},
  body: JSON.stringify({visitor: visitorId(), page, mobile, logged_in: loggedIn()}),
}).catch(() => {});
})();
