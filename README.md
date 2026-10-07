# Kenya & Istanbul — Dec 2026 / Jan 2027

Trip planning repo for a mid-range Kenya safari (Ol Pejeta Conservancy + a Masai Mara private conservancy) with an Istanbul stopover, flying from LAX.

- **Interactive plan (GitHub Pages):** https://yishaisilver.github.io/africa-2627/
- **Readable plan:** [PLAN.md](PLAN.md)
- **Source of truth:** [`data/plan.json`](data/plan.json) — the page and PLAN.md are both generated from it.

## Giving feedback

On the site, use 💬 and 👍 / 🤔 / 👎 on any day, lodge, or section, answer the open questions, toggle options in the budget, then press **Open as GitHub issue**. Notes are kept in your browser until you send them.

## Editing

1. Edit `data/plan.json`.
2. `python3 scripts/check_plan.py` — checks dates are contiguous and the budget adds up.
3. `python3 scripts/build_md.py` — regenerates `PLAN.md`.
4. Push to `main`; the **Publish site** action deploys to the `gh-pages` branch.

Preview locally: `python3 -m http.server` and open http://localhost:8000.
