#!/usr/bin/env python3
"""Sanity-check trip files: required keys, contiguous dates, budget arithmetic, place references.

Usage: check_plan.py [trip.json ...]   (no args = every trip listed in data/trips.json)
"""
import json
import os
import sys
from datetime import date, timedelta

KINDS = {"home", "abroad", "city", "transit", "nature"}


def check(path):
    plan = json.load(open(path))
    errors = []
    for key in ["id", "title", "overview", "dates", "itinerary", "lodging", "budget", "budget_total_per_person_usd"]:
        if key not in plan:
            errors.append(f"missing key: {key}")

    days = [date.fromisoformat(d["date"]) for d in plan.get("itinerary", [])]
    for a, b in zip(days, days[1:]):
        if b - a != timedelta(days=1):
            errors.append(f"itinerary gap/duplicate between {a} and {b}")

    total = sum(b["per_person_usd"] for b in plan.get("budget", []))
    if abs(total - plan.get("budget_total_per_person_usd", 0)) > 1:
        errors.append(f"budget total {plan.get('budget_total_per_person_usd')} != sum of lines {total}")

    for b in plan.get("budget", []):
        if not (b["low_usd"] <= b["per_person_usd"] <= b["high_usd"]):
            errors.append(f"budget line out of its own range: {b['item']}")

    places = plan.get("places", {})
    for l in plan.get("legs", []):
        for k in ("from", "to"):
            if l[k] not in places:
                errors.append(f"leg {l['date']} references unknown place {l[k]}")
    for s in plan.get("stays", []):
        if s["place"] not in places:
            errors.append(f"stay {s['from']} references unknown place {s['place']}")

    if plan.get("dates", {}).get("depart") != (plan["itinerary"][0]["date"] if plan.get("itinerary") else None):
        errors.append("dates.depart does not match first itinerary day")
    if plan.get("dates", {}).get("return") != (plan["itinerary"][-1]["date"] if plan.get("itinerary") else None):
        errors.append("dates.return does not match last itinerary day")
    for code, p in places.items():
        if p.get("kind") not in KINDS:
            errors.append(f"place {code} has kind {p.get('kind')!r}; expected one of {sorted(KINDS)}")
    ids = [a.get("id") for a in plan.get("alternatives", [])]
    if None in ids or len(ids) != len(set(ids)):
        errors.append(f"alternatives need unique ids: {ids}")
    for l in plan.get("legs", []):
        aid = (l.get("choice") or {}).get("alt_id")
        if aid and aid not in ids:
            errors.append(f"leg {l['date']} choice links to unknown option {aid}")

    if errors:
        print(f"{path}:\n  " + "\n  ".join(errors))
        return False
    print(f"OK {path}: {len(days)} days ({days[0]} → {days[-1]}), ${total:,.0f} per person")
    return True


if __name__ == "__main__":
    paths = sys.argv[1:]
    if not paths:
        manifest = json.load(open("data/trips.json"))
        paths = [t["file"] for t in manifest["trips"]]
        assert manifest["default"] in [t["id"] for t in manifest["trips"]], "default trip not in list"
        for t in manifest["trips"]:
            assert os.path.exists(t["file"]), f"missing {t['file']}"
            assert json.load(open(t["file"])).get("id") == t["id"], f"{t['file']} id does not match manifest"
    ok = all([check(p) for p in paths])
    sys.exit(0 if ok else 1)
