#!/usr/bin/env python3
"""Render data/plan.json into PLAN.md for reading on GitHub."""
import json
from datetime import date

plan = json.load(open("data/plan.json"))
out = [f"# {plan['title']}", "", "> Live, interactive version with feedback: https://yishaisilver.github.io/africa-2627/", ""]
d = plan["dates"]
out += [f"**Depart LAX:** {d['depart_lax']} · **Return LAX:** {d['return_lax']} · "
        f"**Planned cost:** ${plan['budget_total_per_person_usd']:,.0f} per person", "", "## Overview", "", plan["overview"], ""]

if plan.get("legs"):
    pl = plan.get("places", {})
    out += ["## Travel legs", "", "| Date | Leg | Mode | Time | Notes |", "|---|---|---|---|---|"]
    for l in plan["legs"]:
        out.append(f"| {l['date']} | {pl.get(l['from'], {}).get('name', l['from'])} → {pl.get(l['to'], {}).get('name', l['to'])} | {l['mode']} | {l['duration']} | {l.get('detail', '')} |")
    out.append("")

out += ["## Itinerary", ""]
for day in plan["itinerary"]:
    dt = date.fromisoformat(day["date"]).strftime("%a %b %d")
    out += [f"### {dt} — {day['title']} ({day['location']})", "", day["details"], "",
            f"*Overnight:* {day['overnight']}" + (f" · *Meals:* {day['meals']}" if day.get("meals") else ""), ""]

out += ["## Lodging", "", "| Property | Where | Nights | $/pp/night | Includes |", "|---|---|---|---|---|"]
for l in plan["lodging"]:
    out.append(f"| {l['name']} | {l['location']} | {l['nights']} | ${l['pppn_usd']:,.0f} | {l['includes']} |")
out.append("")

out += ["## Budget (per person, USD)", "", "| Category | Item | Planned | Range | Notes |", "|---|---|---|---|---|"]
for b in plan["budget"]:
    out.append(f"| {b['category']} | {b['item']} | ${b['per_person_usd']:,.0f} | ${b['low_usd']:,.0f}–${b['high_usd']:,.0f} | {b.get('notes','')} |")
out += [f"| **Total** | | **${plan['budget_total_per_person_usd']:,.0f}** | | ≈ ${plan['budget_total_per_person_usd']*2:,.0f} for two |", ""]

out += ["## Options & swaps", ""]
for a in plan["alternatives"]:
    sign = "+" if a["cost_delta_per_person_usd"] >= 0 else "−"
    out.append(f"- **{a['name']}** ({sign}${abs(a['cost_delta_per_person_usd']):,.0f} pp): {a['description']}")
out += ["", "## Booking timeline", ""]
out += [f"- **{b['when']}:** {b['task']}" for b in plan["booking_timeline"]]
out += ["", "## Practical", "", plan["practical"], "", "## Open questions", ""]
out += [f"{i}. {q}" for i, q in enumerate(plan["open_questions"], 1)]
out += ["", "## Sources", ""] + [f"- {s}" for s in plan["sources"]]
open("PLAN.md", "w").write("\n".join(out) + "\n")
print("wrote PLAN.md")
