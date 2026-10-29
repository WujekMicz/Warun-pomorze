#!/usr/bin/env python3
"""Warun – zarządzanie kontami w Supabase (tylko dla admina, uruchamiane na własnym komputerze).

Klucz „secret” (dawniej service_role) trzymaj w pliku .env.admin obok tego skryptu – NIGDY w repozytorium:
  SUPABASE_URL=https://xxxx.supabase.co
  SUPABASE_SECRET_KEY=sb_secret_...

Użycie:
  python3 admin.py add <login> [--name "Jan Kowalski"]   # zakłada konto, wypisuje hasło startowe
  python3 admin.py reset <login>                          # nowe hasło startowe
  python3 admin.py disable <login> | enable <login>
  python3 admin.py delete <login>                         # usuwa konto razem z jego skrzydłami
  python3 admin.py list
  python3 admin.py make-admin <login>                     # dostęp do panelu admin.html (wyloguj się i zaloguj ponownie)
"""
import argparse
import json
import os
import re
import secrets
import sys
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
LOGIN_RE = re.compile(r"^[a-z0-9._-]{2,32}$")


def load_env():
    env = {}
    p = os.path.join(HERE, ".env.admin")
    if os.path.exists(p):
        for line in open(p, encoding="utf8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"')
    env.update({k: v for k, v in os.environ.items() if k.startswith("SUPABASE_")})
    if not env.get("SUPABASE_URL") or not env.get("SUPABASE_SECRET_KEY"):
        sys.exit("Brak SUPABASE_URL / SUPABASE_SECRET_KEY w .env.admin")
    return env["SUPABASE_URL"].rstrip("/"), env["SUPABASE_SECRET_KEY"]


def login_domain():
    """Ta sama domena loginów co na stronie (config.js)."""
    m = re.search(r'loginDomain:\s*"([^"]+)"', open(os.path.join(HERE, "config.js"), encoding="utf8").read())
    return m.group(1) if m else "warun.invalid"


URL, KEY = None, None


def call(method, path, body=None):
    headers = {"apikey": KEY, "Content-Type": "application/json"}
    if KEY.startswith("eyJ"):  # stary klucz service_role (JWT) idzie też w Authorization
        headers["Authorization"] = "Bearer " + KEY
    if path.startswith("/rest/"):
        headers["Prefer"] = "return=minimal"
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(URL + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        sys.exit("Błąd Supabase %d: %s" % (e.code, e.read().decode(errors="replace")[:300]))


def gen_password():
    alphabet = "abcdefghjkmnpqrstuvwxyz23456789"
    return "-".join("".join(secrets.choice(alphabet) for _ in range(4)) for _ in range(3))


def all_users():
    out, page = [], 1
    while True:
        r = call("GET", "/auth/v1/admin/users?page=%d&per_page=200" % page)
        users = r.get("users", []) if isinstance(r, dict) else r
        out += users
        if len(users) < 200:
            return out
        page += 1


def find(login):
    email = login.lower() + "@" + login_domain()
    for u in all_users():
        if (u.get("email") or "").lower() == email:
            return u
    sys.exit("Nie ma konta „%s”." % login)


def set_must_change(uid, value):
    call("PATCH", "/rest/v1/profiles?user_id=eq." + uid, {"must_change": value})


def main():
    global URL, KEY
    p = argparse.ArgumentParser(description="Warun – konta w Supabase")
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("add"); s.add_argument("login"); s.add_argument("--name", default="")
    for c in ("reset", "disable", "enable", "delete", "make-admin"):
        sub.add_parser(c).add_argument("login")
    sub.add_parser("list")
    a = p.parse_args()
    URL, KEY = load_env()

    if a.cmd == "add":
        login = a.login.strip().lower()
        if not LOGIN_RE.match(login):
            sys.exit("Login: 2–32 znaki, małe litery, cyfry, kropka, myślnik lub podkreślnik.")
        pw = gen_password()
        call("POST", "/auth/v1/admin/users", {
            "email": login + "@" + login_domain(), "password": pw, "email_confirm": True,
            "user_metadata": {"login": login, "display_name": a.name.strip()}})
        print("Założono konto:", login)
        print("Hasło startowe:", pw)
        print("Przy pierwszym logowaniu strona poprosi o zmianę hasła.")
    elif a.cmd == "reset":
        u = find(a.login)
        pw = gen_password()
        call("PUT", "/auth/v1/admin/users/" + u["id"], {"password": pw})
        set_must_change(u["id"], True)
        print("Nowe hasło startowe dla %s: %s" % (a.login, pw))
    elif a.cmd in ("disable", "enable"):
        u = find(a.login)
        call("PUT", "/auth/v1/admin/users/" + u["id"], {"ban_duration": "876000h" if a.cmd == "disable" else "none"})
        print("Konto", a.login, "wyłączone" if a.cmd == "disable" else "włączone")
    elif a.cmd == "delete":
        u = find(a.login)
        if input("Usunąć konto %s razem ze skrzydłami? [t/N] " % a.login).strip().lower() != "t":
            return
        call("DELETE", "/auth/v1/admin/users/" + u["id"])
        print("Usunięto", a.login)
    elif a.cmd == "make-admin":
        u = find(a.login)
        meta = dict(u.get("app_metadata") or {}); meta["role"] = "admin"
        call("PUT", "/auth/v1/admin/users/" + u["id"], {"app_metadata": meta})
        print("Konto", a.login, "ma teraz dostęp do panelu admina. Wyloguj się i zaloguj ponownie na stronie.")
    elif a.cmd == "list":
        dom = "@" + login_domain()
        for u in sorted(all_users(), key=lambda x: x.get("email") or ""):
            login = (u.get("email") or "").replace(dom, "")
            name = (u.get("user_metadata") or {}).get("display_name", "")
            last = (u.get("last_sign_in_at") or "–")[:16].replace("T", " ")
            off = " (wyłączone)" if u.get("banned_until") else ""
            adm = " [admin]" if (u.get("app_metadata") or {}).get("role") == "admin" else ""
            print("%-22s %-22s ostatnio: %s%s%s" % (login, name, last, off, adm))


if __name__ == "__main__":
    main()
