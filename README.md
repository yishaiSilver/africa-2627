# Kenya & Istanbul — Dec 2026 / Jan 2027

Trip planning repo for a mid-range Kenya safari (Ol Pejeta Conservancy + a Masai Mara private conservancy) with an Istanbul stopover, flying from LAX.

- **Interactive plan (GitHub Pages):** https://yishaisilver.github.io/africa-2627/
- **Readable plan:** [PLAN.md](PLAN.md) (current trip) · other versions in [`plans/`](plans/)
- **Compare versions side by side:** https://yishaisilver.github.io/africa-2627/?view=compare
- **Source of truth:** [`data/trips.json`](data/trips.json) lists the trips; each trip is one file in [`data/trips/`](data/trips/).

## Giving feedback

On the site, use 💬 and 👍 / 🤔 / 👎 on any day, lodge, or section, answer the open questions, toggle options in the budget, then press **Open as GitHub issue**. Notes are kept in your browser until you send them.

## Editing / adding a trip

1. Copy a file in `data/trips/` (e.g. `wild-loop.json`), give it a new `id`, and add it to `data/trips.json`.
   It gets its own tab at `?trip=<id>` and a column in Compare.
2. Per-trip settings live in its `config` block: `home` airport, `region` (label + country for the map's zoom button),
   `budget_target` (low/high per person; omit for no target).
3. Each place has a `kind` (`home`, `abroad`, `city`, `transit`, `nature`) and a `country`; colors, map pins and
   "nights in …" stats come from those, not from hard-coded names.
4. `python3 scripts/check_plan.py` validates every trip; `python3 scripts/build_md.py` regenerates `plans/*.md` + `PLAN.md`.
5. Push to `main`; the **Publish site** action deploys to `gh-pages`.

Preview locally: `python3 -m http.server` and open http://localhost:8000.
