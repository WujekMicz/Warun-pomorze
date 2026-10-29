#!/usr/bin/env python3
"""Warun – buduje data.js dla strony z prognoz api.met.no.

Użycie:
  python3 build.py fetch  <katalog>        # pobiera JSON-y z api.met.no (wymaga dostępu do domeny)
  python3 build.py build  <katalog> <out>  # z pobranych JSON-ów robi data.js
  python3 build.py demo   <out>            # dane przykładowe (oznaczone jako demo)
  python3 build.py ping   <config.js>      # zapytanie do Supabase, żeby darmowy projekt nie usnął
"""
import json, math, os, sys, time, urllib.request, datetime as dt

SPOTS = {
    "chlapowo":   (54.81, 18.39),
    "jastrzebia": (54.83, 18.31),
    "stegna":     (54.33, 19.11),
    "krynica":    (54.38, 19.44),
    "mrzezino":   (54.652, 18.44),
    "nowemarzy":  (53.467, 18.649),
    "elblag":     (54.16, 19.42),
    "borsk":      (53.97, 17.84),
}
UA = "warun-paralotnie/1.0 (+https://github.com/WujekMicz/Warun-pomorze)"
URL = "https://api.met.no/weatherapi/locationforecast/2.0/complete?lat={:.3f}&lon={:.3f}"


def fetch(d):
    os.makedirs(d, exist_ok=True)
    for sid, (lat, lon) in SPOTS.items():
        req = urllib.request.Request(URL.format(lat, lon), headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read()
        json.loads(body)  # walidacja
        with open(os.path.join(d, sid + ".json"), "wb") as f:
            f.write(body)
        print("ok", sid, len(body))
        time.sleep(0.5)


def r1(x):
    return None if x is None else round(float(x), 1)


def parse(js):
    """Zwraca listę wierszy: [t_utc_s, dir, ws, gust, p90, opad_na_h, chmury, burza%, rozdz_h]."""
    ts = js["properties"]["timeseries"]
    rows = []
    for i, e in enumerate(ts):
        t = int(dt.datetime.strptime(e["time"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc).timestamp())
        d = e["data"]["instant"]["details"]
        if "next_1_hours" in e["data"]:
            nd = e["data"]["next_1_hours"].get("details", {})
            pr, res = nd.get("precipitation_amount"), 1
            th = nd.get("probability_of_thunder")
        elif "next_6_hours" in e["data"]:
            nd = e["data"]["next_6_hours"].get("details", {})
            pr = nd.get("precipitation_amount")
            pr = None if pr is None else pr / 6.0
            res, th = 6, None
        else:
            pr, res, th = None, 6, None
        rows.append([t, round(d.get("wind_from_direction", 0)), r1(d.get("wind_speed")),
                     r1(d.get("wind_speed_of_gust")), r1(d.get("wind_speed_percentile_90")),
                     None if pr is None else round(pr, 2), round(d.get("cloud_area_fraction", 0)),
                     None if th is None else round(th, 1), res])
    return js["properties"]["meta"].get("updated_at"), rows


def write_out(out, spots, demo):
    data = {"generated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "demo": demo, "spots": spots}
    with open(out, "w") as f:
        f.write("window.WARUN_DATA=" + json.dumps(data, separators=(",", ":")) + ";\n")
    print("zapisano", out, os.path.getsize(out), "B")


def build(d, out):
    spots = {}
    for sid in SPOTS:
        p = os.path.join(d, sid + ".json")
        if not os.path.exists(p):
            print("brak", sid); continue
        with open(p) as f:
            upd, rows = parse(json.load(f))
        spots[sid] = {"updated": upd, "rows": rows}
    write_out(out, spots, False)


def demo(out):
    """Przykładowe dane: przejście frontu z wiatrem skręcającym z S na NW. Tylko do podglądu."""
    now = dt.datetime.now(dt.timezone.utc).replace(minute=0, second=0, microsecond=0)
    spots = {}
    for k, sid in enumerate(SPOTS):
        rows = []
        for h in range(0, 24 * 7, 1):
            t = now + dt.timedelta(hours=h)
            if h > 60 and t.hour % 6:
                continue
            x = h / 24.0
            direction = (170 + 200 * (1 / (1 + math.exp(-(x - 3.2) * 2.5)))) % 360
            base = 3.5 + 2.5 * math.sin(x * 1.3 + k * 0.4) + (1.5 if 1.6 < x < 2.4 else 0)
            diurnal = 1.0 + 0.25 * math.sin((t.hour - 8) / 24 * 2 * math.pi)
            ws = max(0.5, base * diurnal)
            gust = ws * (1.55 + 0.15 * math.sin(h * 0.7 + k))
            rain = 0.8 if 1.7 < x < 2.2 else (0.1 if 4.5 < x < 4.8 else 0.0)
            res = 1 if h <= 60 else 6
            rows.append([int(t.timestamp()), round(direction), round(ws, 1),
                         round(gust, 1) if res == 1 else None, round(ws * 1.25, 1),
                         rain, round(40 + 50 * math.sin(x + k)), 0.0 if res == 1 else None, res])
        spots[sid] = {"updated": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "rows": rows}
    write_out(out, spots, True)


def ping(cfg_path):
    import re
    cfg = open(cfg_path, encoding="utf8").read()
    url = re.search(r'supabaseUrl:\s*"([^"]*)"', cfg).group(1)
    key = re.search(r'supabaseAnonKey:\s*"([^"]*)"', cfg).group(1)
    if not url or not key:
        print("brak konfiguracji Supabase – pomijam"); return
    req = urllib.request.Request(url.rstrip("/") + "/rest/v1/profiles?select=user_id&limit=1",
                                 headers={"apikey": key, "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        print("supabase", r.status)


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "fetch": fetch(sys.argv[2])
    elif cmd == "build": build(sys.argv[2], sys.argv[3])
    elif cmd == "demo": demo(sys.argv[2])
    elif cmd == "ping": ping(sys.argv[2])
