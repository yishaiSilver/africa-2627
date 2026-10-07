#!/usr/bin/env python3
"""Sanity-check data/plan.json: required keys, contiguous dates, budget arithmetic."""
import json
import sys
from datetime import date, timedelta

path = sys.argv[1] if len(sys.argv) > 1 else "data/plan.json"
plan = json.load(open(path))
errors = []

for key in ["title", "overview", "dates", "itinerary", "lodging", "budget", "budget_total_per_person_usd"]:
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

if errors:
    print("\n".join(errors))
    sys.exit(1)
print(f"OK: {len(days)} days ({days[0]} → {days[-1]}), ${total:,.0f} per person")
