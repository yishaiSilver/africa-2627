#!/usr/bin/env python3
"""Render each trip in data/trips.json to plans/<id>.md, and the default trip to PLAN.md."""
import json
import os
from datetime import date

manifest = json.load(open("data/trips.json", encoding="utf-8"))
SITE = "https://yishaisilver.github.io/africa-2627/"


def render(plan):
    out = [f"# {plan['title']}", "", f"> Live, interactive version with feedback: {SITE}?trip={plan['id']}", ""]
    d = plan["dates"]
    home = plan.get("config", {}).get("home", "")
    out += [f"**Depart {home}:** {d['depart']} · **Return {home}:** {d['return']} · "
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
    picks = [l for l in plan["lodging"] if len(l.get("options") or []) > 1]
    if picks:
        out += ["### Hotel options (pick on the website; budget updates)", ""]
        for l in picks:
            out.append(f"**{l['location']}** ({l['nights']}n)")
            for o in l["options"]:
                d = (o["pppn_usd"] - l["pppn_usd"]) * l["nights"]
                delta = "plan" if o is l["options"][0] else ("same" if d == 0 else f"{'+' if d > 0 else '−'}${abs(d):,.0f} pp")
                rating = f", ★ {o['rating']}" if o.get("rating") else ""
                out.append(f"- {o.get('tag', '')}: [{o['name']}]({o.get('url', '')}) ${o['pppn_usd']:,.0f} pp/night{rating} ({delta}). {o.get('why', '')}")
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
    return "\n".join(out) + "\n"


os.makedirs("plans", exist_ok=True)
for t in manifest["trips"]:
    text = render(json.load(open(t["file"], encoding="utf-8")))
    open(f"plans/{t['id']}.md", "w", encoding="utf-8").write(text)
    if t["id"] == manifest["default"]:
        open("PLAN.md", "w", encoding="utf-8").write(text)
    print(f"wrote plans/{t['id']}.md" + (" + PLAN.md" if t["id"] == manifest["default"] else ""))
