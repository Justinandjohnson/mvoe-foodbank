# MVOE handoff — 2026-09-22

## What this is
- Live app: **https://mvoe.pages.dev** (Cloudflare Pages). NOT Vercel. The Vercel copy is to be archived.
- This folder is a clone of GitHub `Justinandjohnson/mvoe-foodbank`, which is OLDER than the live build. The live build's source is on JJ's other machine; JJ will drop it at `C:\Users\lyoko\Downloads\mvoe-live` (suggested path).
- Old local copy, do not use: `C:\Users\lyoko\ship\work\_ARCHIVED-OLD-mvoe-foodbank-DO-NOT-USE`.
- Working rules for this project are at the bottom of `CLAUDE.md`:
  - Main Claude only orchestrates; Sonnet subagents do all the work.
  - No sleeping or polling; 3-min ceiling on any one thing; fetch in parallel.
  - Try alternate routes before skipping a source; up to 1M tokens per agent.
  - Geocode with one US Census batch call.
- **New rule, not yet in CLAUDE.md:** agents must read PDFs and images, not just page text. That means church bulletins, flyers, calendar PDFs and social-post images. Extract PDF text with pymupdf (local, offline). For scans, render pages to PNG and read them visually.

## Food index (Travis / Williamson / Hays)
- Data files are in `frontend/src/data/austin/`:
  - Base lists: `pantries.json`, `programs.json`, `events.json`.
  - Extra lists: `extra-*.json`.
  - Source lists: `sources-*.json`.
- `npm --prefix frontend run index:merge` does the following:
  - Globs all the entry files above.
  - Validates each entry and drops any without lat/lng.
  - Dedupes by id, or by the same name within 150m, keeping the record with more fields filled in.
  - Drops past events and applies the bbox (29.6–31.0 N, -98.4 – -97.1 W).
  - Writes `frontend/src/data/austinFoodIndex.json`.
- `npm --prefix frontend run index:refresh` is the weekly check: it hashes each source, writes `CHANGES.md`, then runs the merge.
- Both scripts have a `--selftest` mode, and both pass.
- Entry schema: `{id,name,type(food_bank|pantry|community_fridge|meal|program|event),address,lat,lng,phone,website,hours,eligibility,event_date,source_url,last_verified}`.

**Freshness tracking — DONE across every entry file (2026-09-22).** Each entry now carries `status` (active|stale|closed|unverified), `status_note` (the evidence + check date) and `info_date`. Note: the implemented schema is those three fields — no `checked_at` was written (the one file completed earlier, north-hispanic, established that shape; everything else matches it). The merge now drops `status: "closed"` and prints counts by status; entries with no status are kept and counted as `unknown`.

### Counts by file (after the 2026-09-22 audit)
| file | entries | active / stale / unverified |
|---|---|---|
| pantries.json | 249 | 249 / 0 / 0 — CTFB find-food-now locator, fully scraped |
| programs.json | 41 | 30 / 0 / 11 |
| events.json | 12 | 12 / 0 / 0 — dated 2026-09-26 → 10-24 |
| extra-churches-central.json | 15 | 4 / 3 / 8 |
| extra-churches-hays-west.json | 38 | 18 / 3 / 17 |
| extra-churches-north.json | 38 | 21 / 1 / 16 |
| extra-churches-north-hispanic.json | 16 | 4 / 2 / 10 |
| extra-community.json | 48 | 43 / 1 / 3 (+1 closed) |
| extra-diocese-svdp.json | — | never landed; not in the data dir |

**Merged total: 408 entries** (`austinFoodIndex.json`) — up from 75 before the 249 pantries landed. Merge status line: `active=354 stale=9 unverified=45 unknown=0 closed_dropped=1`.

**Where the data lives (important):** `frontend/src/data/` is **untracked in git** — it is NOT on GitHub, even though the app code is. Backups taken 2026-09-22: `C:\Users\lyoko\mvoe-data-backup\<timestamp>\` and the matching `.zip` in that folder.

### Known gaps / next steps
1. **Places that couldn't be mapped — 17 remain** (the merge drops 16 for no lat/lng + 4 for no address; two files share a few ids, so the raw count is 17 unique rows):
   - hays-west (5, no lat): `hays-food-bank-client-choice-market`, `heavens-harvest-holland-street-kyle`, `fig-tree-outreach-wimberley`, `caldwell-county-christian-ministries-lockhart`, `st-mary-visitation-svdp-lockhart`
   - north (4, no lat): `central-church-of-christ-pflugerville-pantry`, `hutto-community-church-pantry`, `city-of-taylor-community-connection`, `circle-of-hope-pflugerville`
   - north-hispanic (1, no lat): `city-of-taylor-community-connection`
   - extra-community (2 no lat + 4 no address): `neighborhood-center-dove-springs`, `travis-county-cc-jonestown`; `mrc-new-leaf-food-access`, `bgcaa-summer-meals`, `food-not-bombs-austin`, `austin-parks-congregate-meals`
   - programs (1): `wic-georgetown`
   These are genuinely hard: either the org publishes no street address (city/zip, PO Box, or rotating multi-site) or the geocoder has no TIGER match for a valid address. **Do not invent coordinates.**
   Geocoder lesson (2026-09-22): the US Census `onelineaddress` endpoint silently returns **no match** for many valid Austin-area addresses (e.g. 500 Immanuel Rd, 1101 W New Hope Dr, 1100 N Main St Buda) and only some match via the structured `address` endpoint. **OpenStreetMap Nominatim with a real `User-Agent` matched all of those** — use it first, Census as a fallback. Nominatim name searches (`"<org>, <city>, TX"`) resolve many orgs directly.
2. **Pantry cross-check not run** against foodpantries.org `/li/` pages, 211texas, findhelp and freefood.
3. **Events:** the current CTFB mobile-pantry PDF was not found. A third-pass events agent was running on Caritas, Salvation Army, MLF, Keep Austin Fed, Hays Food Bank, Round Rock Serving Center, Caring Place, Thanksgiving 2026 meals and Eventbrite. Holiday dates get posted around early November, so re-run then.
4. **Summer meals** (summerfeeding.squaremeals.org API) are off-season. Re-run in May–Aug 2026. The endpoint is documented in `sources-programs.json`.
5. **Weekly scheduling** of `index:refresh` plus re-scrape agents was proposed; JJ hasn't decided.
6. **Data is not in git.** Decide whether `frontend/src/data/` should be committed/pushed (it currently is not) or kept as a local artifact + backup.

## Map UI (`frontend/src/components/FoodBankMap.js`, `MapScreen.js`)
- A map agent is working on:
  - Bigger 3D-style icons.
  - An Esri World_Street_Map basemap. OSM tiles return 403 and Carto needs a key.
  - Zoom to the user's location.
  - Tap-to-collapse text panel.
  - Mobile overlay fixes on every page, and zoom performance.
- It was then asked to add a **"Help heatmap" toggle** using leaflet.heat, weighted by entry type, counting events only within the next 14 days.
- Screenshots go to `verify/`. The final verification report has not been reviewed yet.

## Pending decisions for JJ
- Heatmap follow-ons, which JJ hasn't picked:
  - A gap map of areas with no help nearby.
  - Surplus → shortage routing between food-rich places and thin areas.
  - A public JSON/CSV feed of the index.
- True "real-time" help levels would need a backend feature where pantries post open, out-of-food or line-length status.

## When JJ drops the live source
1. Port the map agent's changes onto it.
2. Copy in the rules section from `CLAUDE.md`, plus the PDF/image rule above.
3. Copy `frontend/src/data/austin/`, the two scripts and the package.json scripts `index:merge` and `index:refresh`.
4. Launch the backend agent. It owns `frontend/src/api`, config, services and `backend/`. The backend is Fastify + Prisma/Postgres + Redis; see `backend/.env.example`.
