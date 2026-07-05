# IQ2GQ Hub v1.5 - Decision-Support Redesign

Live GitHub Pages site connected to the IQ2GQ Google Sheets Apps Script API.

## v1.5 changes

- **Presidential Race is fixed to the current season only.** It no longer
  changes when you toggle All-time/Current season or apply any filter
  (Member, Sport group, Bet type, Odds, Result, Search) - it always
  calculates from the full current syndicate year, matching your master
  scoreboard sheet. Verified: applying a Member filter or a Sport group
  filter no longer changes the Presidential Race numbers at all.
- **Removed quick-filter chips entirely** ("Best NRL", "Best NFL", "H2H", "$2+ odds" etc.). The nav, season toggle and filters button now sit in a single sticky row - one less layer of chrome, and one less "layer before the information" per the original brief.
- **High-level grouping for Bet Types**, matching the pattern Sports already used:
  - The **Bet type** filter now offers grouped categories (Head to Head (H2H), Point Starts, Winning Margins, Anytime Scorers, Totals (Over/Under), Multis, Futures/Outrights, plus anything unmatched keeps its own name so nothing is hidden).
  - The **Bet types** page shows the grouped view first, with a **Specific bet types** table underneath for drilling into an exact market (e.g. "9.5 point start").
  - A specific competition or market is still reachable any time via the Search box.
  - This mapping is a first pass based on common naming patterns - if a raw Bet Type value doesn't match any rule, it falls through unchanged as its own category, so nothing gets miscategorised or lost. Send through the actual list of raw Bet Type values whenever convenient and I'll tighten the mapping.
  - Sport grouping already existed in the codebase (grouped Sport group view + Competitions drilldown) and needed no changes; the same "Olympics / Rugby Union / Rugby League" style grouping you asked for was already there.
- **Presidential Race table**, added next to Top Members on the dashboard. Calculated per the rules you provided and verified against your "PRESIDENTIAL RACE - DETAILS" sheet:
  - +0.5 per win, -1 per loss
  - +1.5 for being part of a successful MM (a 3-pick team drop where every leg won)
  - +3 for a successful pick at $2.00+, -3 for an unsuccessful pick at $2.00+
  - Ranked highest to lowest, with **Minor Premier** / **Runner-up** / **Benson** labels on the top two and bottom standings
  - "Successful MM" is worked out by grouping picks that share the same Date and MM-drop/Team value; if every pick in that group won, everyone in that group gets the bonus. This was verified against your spreadsheet: your sheet's "Number of times in a winning MM" is identical across all three members of a team (e.g. SF/LS/TP all showing the same count), which is exactly what this grouping method produces.
  - Respects the current filters and the All-time/Current season toggle, same as Top Members.
  - **Not yet built**: the "Immunity Card" row and the team-level prize-pool/winnings section (Team Winnings, Crashes, Kills, Stand-downs, Prize pool) visible in your spreadsheet. Those looked like a separate, bigger feature involving real money splits and mechanics I don't have rules for yet - happy to build them once you describe how they work.
- Also added a compact **Bet type performance** panel on the dashboard (grouped, next to Sport group performance), since bet-type grouping is now available.
- Fixed a small existing bug: `MM drop` used to be listed as a fallback source for the `Date` field (in case `Date` was blank). Now that we know MM drop actually holds the team number, that fallback has been removed so it can't leak a team number into a date value.

## v1.4 changes (UI/UX redesign)

No calculations, statistics, or data logic changed. This release is a
presentation and navigation redesign of the existing v1.3B codebase.

- **Compact header.** The large hero banner is replaced with a slim single
  row: logo, title, and a small live status line.
- **Retired the separate "Live" tab.** "Current Season" was a full second
  page that duplicated the Dashboard's layout and code with a different
  data slice. It's now an **All-time / Current season** toggle that scopes
  the Dashboard, Smart Insights, and KPIs in place. Same information,
  one page, no duplicate markup or duplicate render logic.
- **Collapsible filters.** The eight-field filter grid that used to sit
  permanently on screen is now a "Filters (N active) ▾" control. It expands
  only when opened and shows a live count of active filters.
- **Quick filters as chips.** The old full-width button row is now a
  compact, horizontally-scrolling chip strip that sits directly under the
  navigation instead of consuming its own full section.
- **Smart Insights promoted.** Insights now render immediately after the
  KPI row on every relevant page (dashboard, current season, member
  profiles) - they were already second in the markup, but the four layers
  of chrome above them pushed them below the fold. With the chrome
  compacted, insights now land inside the first screen.
- **Sticky toolbar.** Navigation, the season toggle, quick filters and the
  filters control stay visible while scrolling; the expanded filter panel
  itself scrolls away when closed so it doesn't eat sticky space.
- **Tighter spacing and typography** throughout panels, KPI cards, and
  tables to reduce vertical space (roughly 40%+ less chrome before reaching
  content, depending on viewport).
- **Mobile**: filters are collapsed by default (no extra work needed - they
  already start closed), quick filters scroll in one line, and layouts
  degrade to single/double column earlier.
- **Code cleanup:**
  - Removed the duplicated `live()` render function; the Dashboard function
    now serves both scopes.
  - De-duplicated repeated filter ID arrays into a single `FILTER_IDS`
    constant used by both the input-binding and reset logic.
  - Removed a duplicate `const year` declaration inside
    `insightScopeLabel()`.
  - Rewrote `styles.css` from a minified single-line file (with several
    appended, overlapping `.footer` and `.smart-insights` rules from
    earlier patches) into one organised, commented stylesheet with a
    single source of truth per component.
- Kept unchanged: Smart Insights logic, Member Intelligence Centre, all
  Google Sheets live data integration, every existing calculation and
  statistic, and all page functionality (Members, Sports, Bet types, Odds,
  Records, Search, sortable tables, mobile card view).

## Summary of UI improvements

| Area | Before | After |
|---|---|---|
| Header | Large banner, ~150px+ tall | Single compact row, ~64px |
| Navigation | 8 tabs incl. a duplicate "Live" page | 7 tabs + a 2-state season toggle |
| Filters | Permanent 8-field grid, always visible | Collapsed by default, opens on demand, shows active count |
| Quick filters | Full-width button row, own section | Compact scrollable chip strip |
| Smart Insights | Present but pushed below the fold by chrome | Visible within the first screen on load |
| Chrome before content | ~4 stacked layers (banner, nav, filters, quick filters) | 2 slim sticky rows + optional expandable panel |

## Recommendations / future considerations

- **Architecture for the future roadmap** (Finals Centre, AI predictions,
  member comparison, notifications, personal dashboards) is easiest to add
  as additional entries in the `nav` tab list plus a new `render()` case,
  following the same `pageName(data) -> html string` pattern already used
  by every existing page. No structural changes are required to support
  this later.
- Consider persisting the season-scope choice and filter state in the URL
  (query string) so members can share a specific filtered view/link with
  each other - a small addition, not implemented in this release to avoid
  scope creep beyond the requested redesign.
- `styles.css` is no longer minified. If a minified production build is
  wanted for GitHub Pages, that can be generated as a build step without
  touching the source file.

## Files

Upload or replace these files at the root of the GitHub repository:

- `index.html`
- `styles.css`
- `app.js`
- `README.md`
- `assets/iq2gq-logo.png`

No Google Sheet or Apps Script changes are required.
