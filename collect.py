#!/usr/bin/env python3
"""兵庫県南部の釣り情報を集めて docs/data.json を作る。

標準ライブラリのみで動く。各サイトへの負荷を抑えるため、
同じホストへのリクエストの間は待ち時間を入れている。
取得に失敗した情報源は、前回の data.json の内容をそのまま使う。
"""
from __future__ import annotations

import html
import json
import math
import re
import sys
import time
import traceback
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "docs" / "data.json"
SPOTS = json.loads((ROOT / "config" / "spots.json").read_text(encoding="utf-8"))
JST = timezone(timedelta(hours=9))
NOW = datetime.now(JST)
UA = "hyogo-fishing-personal/1.0 (personal use aggregator)"
WAIT_SEC = 1.5

TIDE_STATIONS = {"KB": "神戸", "AK": "明石", "K1": "姫路（飾磨）", "ST": "洲本", "AM": "尼崎", "J5": "西宮"}

# ---------------------------------------------------------------- HTTP
_last_hit: dict[str, float] = {}


def fetch(url: str, data: bytes | None = None, timeout: int = 30) -> str:
    host = urllib.parse.urlsplit(url).netloc
    wait = WAIT_SEC - (time.time() - _last_hit.get(host, 0))
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, "Accept-Language": "ja"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            charset = r.headers.get_content_charset() or "utf-8"
    finally:
        _last_hit[host] = time.time()
    return raw.decode(charset, errors="replace")


def strip_tags(s: str) -> str:
    s = re.sub(r"<(script|style)[\s\S]*?</\1>", "", s or "")
    s = re.sub(r"<br\s*/?>|</p>", "\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s).replace("\xa0", " ").replace("　", " ")
    return re.sub(r"[ \t]+", " ", re.sub(r"\n\s*\n+", "\n", s)).strip()


def match_spot(*texts: str) -> str | None:
    """キーワードから釣り場IDを推定する。先に渡したテキスト（タイトルなど）を優先する。"""
    for text in texts:
        if not text:
            continue
        hits = [(text.find(k), s["id"]) for s in SPOTS for k in s["keywords"] if k in text]
        if hits:
            return min(hits)[1]  # テキスト中で最初に出てくる地名
    return None


def iso(dt: datetime) -> str:
    return dt.astimezone(JST).isoformat(timespec="minutes")


# ---------------------------------------------------------------- 釣果: フィッシングマックス
def src_fishingmax(pages: int = 5) -> list[dict]:
    ns = {"dc": "http://purl.org/dc/elements/1.1/"}
    items, seen = [], set()
    for p in range(1, pages + 1):
        url = "https://fishingmax.co.jp/fishingpost/feed" + (f"?paged={p}" if p > 1 else "")
        root = ET.fromstring(fetch(url).encode("utf-8"))
        for it in root.iter("item"):
            link = it.findtext("link") or ""
            if link in seen:
                continue
            seen.add(link)
            title = (it.findtext("title") or "").strip()
            desc = strip_tags(it.findtext("description") or "")
            shop = ""
            m = re.match(r"\[([^\]]+)\]\s*", desc)
            if m:
                shop, desc = m.group(1), desc[m.end():]
            spot = match_spot(title, desc[:120])
            if not spot:  # 兵庫南部以外（大阪・和歌山など）は除外
                continue
            items.append({
                "source": "フィッシングマックス", "spot": spot, "title": title,
                "text": desc.replace(" [&#8230;]", "…").replace("[…]", "…")[:200],
                "shop": shop, "url": link,
                "date": iso(parsedate_to_datetime(it.findtext("pubDate"))),
            })
    return items


# ---------------------------------------------------------------- 釣果: 釣りビジョン
FV_AREAS = {60: "大阪湾（兵庫）", 61: "播磨灘", 62: "淡路"}


def src_fishingv() -> list[dict]:
    blocks = []
    for area in FV_AREAS:
        blocks += re.split(r'<div class="choka[ "]', fetch(f"https://www.fishing-v.jp/choka/detail.php?area={area}"))[1:]
    items, seen = [], set()
    for b in blocks:
        name = re.search(r'class="shop_name02">([^<]+)<', b)
        crumbs = [strip_tags(x) for x in re.findall(r'id="(?:area|point)_link\d*">([\s\S]*?)</a>', b)]
        d = re.search(r'class="date">(\d{4})年(\d{1,2})月(\d{1,2})日', b)
        link = re.search(r'href="(/choka/choka_detail\.php\?s=\d+)"', b)
        if not (name and d):
            continue
        fish = []
        for row in re.findall(r"<tr>([\s\S]*?)</tr>", b):
            cells = [strip_tags(c) for c in re.findall(r"<td[^>]*>([\s\S]*?)</td>", row)]
            if len(cells) >= 7 and cells[1]:
                fish.append({"fish": cells[1], "count": cells[2], "size": re.sub(r"\s+", " ", cells[3]),
                             "point": cells[6]})
        shop = name.group(1).strip()
        if (shop, d.group(0)) in seen:
            continue
        seen.add((shop, d.group(0)))
        spot = match_spot(shop, *crumbs, *(f["point"] for f in fish))
        items.append({
            "source": "釣りビジョン", "spot": spot, "title": f"{shop}（{' / '.join(crumbs)}）",
            "shop": shop, "fish": fish[:12],
            "url": "https://www.fishing-v.jp" + link.group(1) if link else "https://www.fishing-v.jp/choka/detail.php?pref=28",
            "date": date(int(d[1]), int(d[2]), int(d[3])).isoformat(),
        })
    return items


# ---------------------------------------------------------------- 釣果+イベント: 尼崎市立魚つり公園
AMA = "https://amagasaki-uoturikouen.com"


def src_amagasaki(days: int = 4, events: int = 6) -> tuple[list[dict], list[dict]]:
    locs = re.findall(r"<loc>([^<]+)</loc>", fetch(AMA + "/sitemap.xml"))
    locs = [l.replace("http://", "https://") for l in locs]
    fishing = sorted({l for l in locs if "/fishing/" in l and re.search(r"/\d{8}", l)}, reverse=True)[:days]
    catches = []
    for url in fishing:
        t = fetch(url)
        ymd = re.search(r"/(\d{4})(\d{2})(\d{2})", url)
        fish = []
        table = re.search(r"<table[\s\S]*?</table>", t)
        if table:
            for row in re.findall(r"<tr>([\s\S]*?)</tr>", table.group(0)):
                th = re.search(r"<th>([\s\S]*?)</th>", row)
                tds = [strip_tags(c) for c in re.findall(r"<td>([\s\S]*?)</td>", row)]
                if th and len(tds) >= 3 and strip_tags(th.group(1)) != "魚種":
                    cnt = tds[1].replace("合計", "")
                    if cnt in ("0匹", ""):
                        continue
                    fish.append({"fish": strip_tags(th.group(1)), "size": tds[0], "count": cnt, "point": tds[2]})
        body = strip_tags(t[table.end():] if table else "")
        comment = body.split("\n")[0:6]
        flat = re.sub(r"\s+", "", re.sub(r"<[^>]+>", "", t))

        def val(label: str) -> str:
            m = re.search(label + r"[：:](-?[\d.]+)", flat)
            return m.group(1) if m else ""
        catches.append({
            "source": "尼崎市立魚つり公園", "spot": "amagasaki",
            "title": f"尼崎市立魚つり公園 {int(ymd[2])}月{int(ymd[3])}日の釣果",
            "fish": fish, "text": " ".join(comment)[:220],
            "meta": {"水温": val("水温") and val("水温") + "℃", "気温": val("気温") and val("気温") + "℃"},
            "url": url, "date": f"{ymd[1]}-{ymd[2]}-{ymd[3]}",
        })
    evs = []
    for url in sorted({l for l in locs if "/news/event/" in l}, reverse=True)[:events]:
        t = fetch(url)
        title = re.search(r"<title>([^<]+)</title>", t)
        ymd = re.search(r"/(\d{4})(\d{2})(\d{2})", url)
        evs.append({
            "source": "尼崎市立魚つり公園", "spot": "amagasaki",
            "title": strip_tags(title.group(1))[:80] if title else "イベント",
            "url": url, "date": f"{ymd[1]}-{ymd[2]}-{ymd[3]}" if ymd else "",
        })
    return catches, evs


# ---------------------------------------------------------------- イベント・ニュース: Googleニュース
NEWS_QUERIES = [
    "兵庫 釣り 大会", "兵庫 釣り イベント", "神戸 釣り 体験 OR 教室 OR 大会",
    "明石 釣り イベント OR 大会", "淡路島 釣り 大会 OR イベント", "姫路 釣り 大会 OR イベント",
    "海づり公園 イベント",
]
SAFETY_RE = re.compile(r"転落|死亡|事故|行方不明|救助|心肺停止|遭難|けが|負傷|注意|禁止|立入")
EVENT_RE = re.compile(r"大会|イベント|教室|体験|フェス|ダービー|講習|募集|開催|フェア|セール|トーナメント|コンテスト|フォトコン")
HYOGO_RE = re.compile(r"兵庫|神戸|明石|淡路|姫路|尼崎|西宮|芦屋|加古川|高砂|赤穂|相生|洲本|垂水|須磨|家島|播磨")


def src_news() -> tuple[list[dict], list[dict]]:
    events, safety, seen = [], [], set()
    for q in NEWS_QUERIES:
        url = ("https://news.google.com/rss/search?q=" + urllib.parse.quote(q + " when:90d")
               + "&hl=ja&gl=JP&ceid=JP:ja")
        root = ET.fromstring(fetch(url).encode("utf-8"))
        for it in root.iter("item"):
            full = (it.findtext("title") or "").strip()
            title, _, media = full.rpartition(" - ")
            title = title or full
            if title in seen or "釣" not in title or re.search(r"ボートレース|競艇|ＳＧ|SG|釣り銭|釣銭", title):
                continue
            seen.add(title)
            src_el = it.find("source")
            entry = {
                "source": (src_el.text if src_el is not None else media) or "ニュース",
                "title": title, "url": it.findtext("link"),
                "date": iso(parsedate_to_datetime(it.findtext("pubDate"))),
                "spot": match_spot(title),
            }
            if SAFETY_RE.search(title) and HYOGO_RE.search(title):
                safety.append(entry)
            elif EVENT_RE.search(title) and (HYOGO_RE.search(title) or entry["spot"]):
                events.append(entry)
    key = lambda e: e["date"]
    return sorted(events, key=key, reverse=True)[:40], sorted(safety, key=key, reverse=True)[:15]


def src_fishingmax_events(catch_items: list[dict]) -> list[dict]:
    """フィッシングマックスの記事のうち大会・イベント告知っぽいもの。"""
    ev = re.compile(r"大会|イベント|教室|講習|開催|募集|フェア|セール")
    noise = re.compile(r"釣果|エントリー|持ち?込み|ガチャ|ダービー|リアルタイム")
    return [{**c, "text": ""} for c in catch_items if ev.search(c["title"]) and not noise.search(c["title"])]


# ---------------------------------------------------------------- 潮見表: 気象庁
def _new_moon_jd(k: int) -> float:
    """k番目の新月のユリウス日（Meeus『天体計算』49章の主要項。誤差は数分程度）。"""
    T = k / 1236.85
    E = 1 - 0.002516 * T - 0.0000074 * T * T
    r = math.radians
    M = r(2.5534 + 29.10535670 * k - 0.0000014 * T * T)
    Mp = r(201.5643 + 385.81693528 * k + 0.0107582 * T * T)
    F = r(160.7108 + 390.67050284 * k - 0.0016118 * T * T)
    Om = r(124.7746 - 1.56375588 * k + 0.0020672 * T * T)
    s = math.sin
    corr = (-0.40720 * s(Mp) + 0.17241 * E * s(M) + 0.01608 * s(2 * Mp) + 0.01039 * s(2 * F)
            + 0.00739 * E * s(Mp - M) - 0.00514 * E * s(Mp + M) + 0.00208 * E * E * s(2 * M)
            - 0.00111 * s(Mp - 2 * F) - 0.00057 * s(Mp + 2 * F) + 0.00056 * E * s(2 * Mp + M)
            - 0.00042 * s(3 * Mp) + 0.00042 * E * s(M + 2 * F) + 0.00038 * E * s(M - 2 * F)
            - 0.00024 * E * s(2 * Mp - M) - 0.00017 * s(Om))
    return 2451550.09766 + 29.530588861 * k + 0.00015437 * T * T + corr


def _moon_age(d: date) -> float:
    """JST正午時点の月齢。"""
    jd = datetime(d.year, d.month, d.day, 3, tzinfo=timezone.utc).timestamp() / 86400 + 2440587.5
    k = math.floor((jd - 2451550.09766) / 29.530588861) + 1
    while _new_moon_jd(k) > jd:
        k -= 1
    return jd - _new_moon_jd(k)


def tide_name(d: date) -> str:
    """月齢から潮名を求める（旧暦日の慣用ルールによる目安）。"""
    names = ["大潮"] * 3 + ["中潮"] * 3 + ["小潮"] * 3 + ["長潮", "若潮"] + ["中潮"] * 2 + ["大潮"] * 4 \
        + ["中潮"] * 3 + ["小潮"] * 3 + ["長潮", "若潮"] + ["中潮"] * 3 + ["大潮"] * 2
    return names[int(_moon_age(d)) % 30]


def _parse_events(seg: str, d: date) -> list[dict]:
    out = []
    for i in range(4):
        hhmm, lvl = seg[i * 7:i * 7 + 4], seg[i * 7 + 4:i * 7 + 7]
        if hhmm.strip() in ("9999", "") or lvl.strip() == "999":
            continue
        out.append({"time": f"{int(hhmm[:2] or 0):02d}:{int(hhmm[2:] or 0):02d}", "cm": int(lvl)})
    return out


def src_tide(days: int = 10) -> dict:
    today = NOW.date()
    want = {today + timedelta(days=i) for i in range(days)}
    result = {}
    for code, name in TIDE_STATIONS.items():
        rows = []
        for year in sorted({d.year for d in want}):
            txt = fetch(f"https://www.data.jma.go.jp/kaiyou/data/db/tide/suisan/txt/{year}/{code}.txt")
            for line in txt.splitlines():
                if len(line) < 136:
                    continue
                try:
                    d = date(2000 + int(line[72:74]), int(line[74:76]), int(line[76:78]))
                except ValueError:
                    continue
                if d not in want:
                    continue
                rows.append({
                    "date": d.isoformat(), "name": tide_name(d),
                    "hourly": [int(line[i * 3:i * 3 + 3]) for i in range(24)],
                    "high": _parse_events(line[80:108], d), "low": _parse_events(line[108:136], d),
                })
        result[code] = {"name": name, "days": sorted(rows, key=lambda r: r["date"])}
    return result


# ---------------------------------------------------------------- 釣具屋: OpenStreetMap
def _dist_km(a_lat, a_lon, b_lat, b_lon) -> float:
    p = math.pi / 180
    h = (math.sin((b_lat - a_lat) * p / 2) ** 2
         + math.cos(a_lat * p) * math.cos(b_lat * p) * math.sin((b_lon - a_lon) * p / 2) ** 2)
    return 12742 * math.asin(math.sqrt(h))


OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter",
            "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]


def src_shops(per_spot: int = 6, max_km: float = 15) -> dict:
    q = ('[out:json][timeout:60];('
         'nwr["shop"="fishing"](34.10,134.20,34.95,135.50);'
         'nwr["shop"~"outdoor|sports"]["name"~"釣|フィッシング|キャスティング|上州屋|タックル"](34.10,134.20,34.95,135.50);'
         ');out center tags;')
    for endpoint in OVERPASS:  # 混雑で落ちることがあるのでミラーを順に試す
        try:
            data = json.loads(fetch(endpoint, data=urllib.parse.urlencode({"data": q}).encode(), timeout=90))
            break
        except Exception as e:
            print(f"overpass {endpoint}: {e}", file=sys.stderr)
    else:
        raise RuntimeError("Overpass API に接続できませんでした")
    shops = []
    for e in data["elements"]:
        tags = e.get("tags", {})
        lat, lon = e.get("lat", e.get("center", {}).get("lat")), e.get("lon", e.get("center", {}).get("lon"))
        if lat is None or not tags.get("name"):
            continue
        addr = "".join(tags.get(k, "") for k in ("addr:province", "addr:city", "addr:suburb", "addr:quarter",
                                                   "addr:neighbourhood", "addr:block_number", "addr:housenumber"))
        shops.append({"name": tags["name"], "lat": lat, "lon": lon, "addr": addr,
                      "hours": tags.get("opening_hours", ""), "phone": tags.get("phone", tags.get("contact:phone", "")),
                      "web": tags.get("website", tags.get("contact:website", ""))})
    out = {}
    for s in SPOTS:
        near = sorted(({**sh, "km": round(_dist_km(s["lat"], s["lon"], sh["lat"], sh["lon"]), 1)} for sh in shops),
                      key=lambda x: x["km"])
        out[s["id"]] = [x for x in near if x["km"] <= max_km][:per_spot]
    return out


# ---------------------------------------------------------------- main
def main() -> int:
    prev = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    status, data = {}, {}

    def run(key, fn, fallback):
        t0 = time.time()
        try:
            data[key] = fn()
            status[key] = {"ok": True, "at": iso(NOW), "sec": round(time.time() - t0, 1)}
        except Exception as e:  # 1つの情報源が落ちても他は続行
            traceback.print_exc()
            data[key] = fallback
            status[key] = {"ok": False, "at": prev.get("status", {}).get(key, {}).get("at"), "error": str(e)[:200]}
        print(f"[{'OK' if status[key]['ok'] else 'NG'}] {key}", file=sys.stderr)

    pc = prev.get("catches_by_source", {})
    run("fishingmax", src_fishingmax, pc.get("fishingmax", []))
    run("fishingv", src_fishingv, pc.get("fishingv", []))
    run("amagasaki", src_amagasaki, (pc.get("amagasaki", []), prev.get("events_by_source", {}).get("amagasaki", [])))
    run("news", src_news, (prev.get("events_by_source", {}).get("news", []), prev.get("safety", [])))
    run("tide", src_tide, prev.get("tide", {}))

    # 釣具屋はあまり変わらないので1日1回だけ取り直す
    shops_at = prev.get("status", {}).get("shops", {}).get("at")
    if prev.get("shops") and shops_at and NOW - datetime.fromisoformat(shops_at) < timedelta(hours=23):
        data["shops"], status["shops"] = prev["shops"], prev["status"]["shops"]
    else:
        run("shops", src_shops, prev.get("shops", {}))

    ama_catch, ama_ev = data["amagasaki"]
    news_ev, safety = data["news"]
    by_src = {"fishingmax": data["fishingmax"], "fishingv": data["fishingv"], "amagasaki": ama_catch}
    catches = sorted((c for v in by_src.values() for c in v), key=lambda c: c["date"], reverse=True)
    ev_src = {"amagasaki": ama_ev, "news": news_ev, "fishingmax": src_fishingmax_events(data["fishingmax"])}
    events = sorted((e for v in ev_src.values() for e in v), key=lambda e: e["date"], reverse=True)

    # 外部サイト・OpenStreetMap 由来のURLは http(s) 以外を捨てる（javascript: リンク対策）
    ok_url = lambda u: isinstance(u, str) and re.match(r"https?://", u) is not None
    catches = [c for c in catches if ok_url(c.get("url"))]
    events = [e for e in events if ok_url(e.get("url"))]
    safety = [e for e in safety if ok_url(e.get("url"))]
    for lst in (data["shops"] or {}).values():
        for sh in lst:
            if sh.get("web") and not ok_url(sh["web"]):
                sh["web"] = ""

    out = {
        "generated": iso(NOW), "spots": SPOTS, "tide_stations": TIDE_STATIONS,
        "catches": catches, "catches_by_source": by_src,
        "events": events, "events_by_source": {k: v for k, v in ev_src.items() if k != "fishingmax"},
        "safety": safety, "tide": data["tide"], "shops": data["shops"], "status": status,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB): catches={len(catches)} events={len(events)}", file=sys.stderr)
    return 0 if any(s["ok"] for s in status.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
