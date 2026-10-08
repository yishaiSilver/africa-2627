#!/usr/bin/env python3
"""Prepend a pre-Kenya stopover to the base trip.

Reads data/preludes/<key>.json (stopover research: Dec 19–27) and the base trip
(data/trips/wild-loop.json, Kenya from Dec 28), writes data/trips/pre-<key>.json.

Usage: build_prelude.py [key ...]   (no args = every file in data/preludes/ except screen.json)
"""
import json
import os
import sys
from datetime import date

BASE = "data/trips/wild-loop.json"
JOIN = "2026-12-28"  # first Kenya day kept from the base trip


def usd(n):
    return f"${n:,.0f}"


def build(key):
    pre = json.load(open(f"data/preludes/{key}.json"))
    base = json.load(open(BASE))
    country = pre["country"]

    days = [d for d in pre["itinerary"] if d["date"] < JOIN] + [d for d in base["itinerary"] if d["date"] >= JOIN]
    for i, d in enumerate(days):
        d["day_label"] = f"Day {i + 1} – {date.fromisoformat(d['date']).strftime('%a')}"

    places = dict(base["places"])
    photos = dict(base.get("photos", {}))
    for p in pre["places"]:
        code = p["code"]
        if code in ("LAX", "NBO", "KAR") and code in places:
            continue
        places[code] = {k: p[k] for k in ("name", "lat", "lng", "kind", "country")}
        if p.get("wiki") and p["kind"] != "transit":
            photos[code] = {"name": p["name"], "wiki": p["wiki"]}

    pre_legs = [l for l in pre["legs"] if l["date"] < JOIN or l["to"] == "NBO"]
    legs = pre_legs + [l for l in base["legs"] if l["date"] >= JOIN]
    legs.sort(key=lambda l: l["date"])  # stable: keeps order within a day

    stays = [s for s in pre["stays"] if s["from"] < JOIN]
    base_stays = [dict(s) for s in base["stays"]]
    # Arriving Dec 27 → the Nairobi guesthouse (already held from Dec 27 in the base plan) covers that night too.
    if stays and stays[-1]["place"] == "KAR":
        stays.pop()
        base_stays[0]["from"], base_stays[0]["nights"] = "2026-12-27", base_stays[0]["nights"] + 1
    stays += base_stays

    base_flight = next(b for b in base["budget"] if b["category"] == "International flights")
    pre_budget = [dict(b) for b in pre["budget"]]
    for b in pre_budget:
        if b["category"] != "International flights":
            b["item"] = f"{country}: {b['item']}"
    budget = pre_budget + [b for b in base["budget"] if b is not base_flight]
    for b in budget:
        b["low_usd"] = min(b["low_usd"], b["per_person_usd"])
        b["high_usd"] = max(b["high_usd"], b["per_person_usd"])
    total = round(sum(b["per_person_usd"] for b in budget))
    extra = total - base["budget_total_per_person_usd"]

    lodging = [l for l in pre["lodging"] if l["place"] != "KAR"] + base["lodging"]
    for l in lodging:
        l.setdefault("alternatives", "")

    safety = pre["safety"]
    overview = "\n".join([
        f"- **Dates:** LAX **Sat Dec 19** → {country} → Nairobi → LAX **Sat Jan 16**. Christmas in {country}; Kenya from Dec 28 is the Wild loop unchanged.",
        f"- **Stopover:** {pre['summary']}",
        f"- **Verdict:** {pre['verdict']}",
        f"- **Safety:** {safety['advisory_level']}. {safety['summary']}",
        f"- **Cost:** {usd(total)} pp, **+{usd(extra)}** vs the Wild loop alone ({usd(base['budget_total_per_person_usd'])}).",
        "",
        "**Highlights:** " + " · ".join(pre["highlights"]),
        "",
        "**Drawbacks:** " + " · ".join(pre["drawbacks"]),
        "",
        "### Then Kenya (Wild loop)",
    ] + [l for l in base["overview"].split("\n") if not l.startswith("- **Dates:**")])

    practical = "\n".join([
        f"## {country} stopover",
        f"- **Visa (US passport):** {pre['visa']}",
        f"- **Safety — {safety['advisory_level']}:** {safety['summary']}",
    ] + [f"  - {x}" for x in safety["precautions"]] + [
        f"- **Weather in late Dec:** {pre['weather_dec']}",
        "",
        base["practical"],
    ])

    fatigue = f"**{country} stopover (Dec 19–28):**\n{pre['fatigue']}\n\n**Kenya (from Dec 28):**\n" + base.get("fatigue_check", "")

    wl = [w for w in pre["wildlife"]] + base.get("wildlife", [])
    seen, wildlife = set(), []
    for w in wl:
        if w["name"].lower() not in seen:
            seen.add(w["name"].lower())
            wildlife.append(w)

    nature = [p for p in pre["places"] if p["kind"] == "nature" and p.get("wiki")]
    trip = dict(base)
    trip.update({
        "id": f"pre-{key}",
        "label": pre["label"],
        "summary": f"{pre['summary']} Then the Wild loop.",
        "hero_photo": nature[0]["wiki"][0] if nature else base.get("hero_photo"),
        "title": f"{country} first, then Kenya's Wild Loop",
        "overview": overview,
        "dates": {"depart": days[0]["date"], "return": days[-1]["date"]},
        "itinerary": days,
        "places": places,
        "photos": photos,
        "legs": legs,
        "stays": stays,
        "lodging": lodging,
        "budget": budget,
        "budget_total_per_person_usd": total,
        "practical": practical,
        "fatigue_check": fatigue,
        "wildlife": wildlife,
        "booking_timeline": [{"when": b["when"], "task": f"{country}: {b['task']}"} for b in pre["booking"]] + base["booking_timeline"],
        "sources": pre["sources"] + base.get("sources", []),
        "open_questions": [f"{country} stopover adds {usd(extra)} pp and a week. Worth it vs. Christmas at home?"] + base.get("open_questions", []),
        "prelude": {
            "country": country,
            "advisory_level": safety["advisory_level"],
            "safety": safety["summary"],
            "visa": pre["visa"],
            "weather": pre["weather_dec"],
            "verdict": pre["verdict"],
            "extra_usd": extra,
            "base": "wild-loop",
        },
    })
    out = f"data/trips/pre-{key}.json"
    json.dump(trip, open(out, "w"), indent=2, ensure_ascii=False)
    print(f"wrote {out}: {len(days)} days, {usd(total)} pp (+{usd(extra)})")


if __name__ == "__main__":
    keys = sys.argv[1:] or sorted(f[:-5] for f in os.listdir("data/preludes") if f.endswith(".json") and f != "screen.json")
    for k in keys:
        build(k)
