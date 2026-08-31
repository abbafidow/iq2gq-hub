## v2.0 changes

**Stats tab**
- **Members, Sports, Bet types and Odds combined into a single "Stats" tab.** Nav bar now has one Stats button instead of four separate ones.
- **New rugby-ball wedge selector.** First visit to Stats shows "What are you interested in?" with a rugby-ball shape split into four pressable wedges (Members / Sports / Bet types / Odds), seams and lacing styled to look like a real ball, plus a small star badge in the centre. Picking a wedge opens that section; a pill sub-nav then handles switching between sections for the rest of the session, so you're not forced back through the ball every time.
- **Stats is now always all-time.** The All-time/Current season toggle is hidden while on this tab (and on Records) since everything there already shows both scopes explicitly - it no longer has any effect on data shown, everywhere else it still works as before.
- **STAND DOWN removed from Sports, Bet types and Odds.** These admin/non-pick rows were showing up as a fake "sport" or "bet type" category with a 0% success rate. Same fix extended to Records (was quietly deflating win/loss streaks and the general records pool too).
- **Odds page:** reordered (Odds bands table first, then a new **Top 5 most successful (high confidence)** panel below it, by *specific* odds value rather than a whole band - e.g. "1.20" rather than "1.20-1.39"). Fixed the "Under 1.20" band's lower bound, which was 0 - letting blank/zero odds rows drag its average down towards $1.00 instead of reflecting genuine low-odds picks.

**Records page**
- **Best winning streaks and Highest winning odds** each split into explicit **All-time** and **Current season** pairs (four panels total) instead of one toggle-dependent table, since the toggle is no longer shown on this page.
- **Record tiles restyled** as shield/medal shapes (matching the trophy-case feel of the page), colour-coded by scope: **bronze for current season, gold for all-time**.
- **Fixed: "Perfect Round" was checking against the current 12-member roster**, which wrongly excluded genuine early-era Perfect Rounds from when the syndicate only had ~6 members. Now derives the active roster per season instead of hardcoding it.
- **Fixed: ties were being silently dropped.** "Most wins" and "Highest winning percentage" only ever showed the first name after sorting - if two members were tied, the second was invisible. Both now list every tied member.
- **Fixed: a Stand Down week was breaking win streaks**, since it was being treated like a loss (resetting the streak to 0) rather than being skipped entirely.
- **Fixed: "This season" streaks were being truncated at the season boundary.** A live streak that started at the end of last season and carried into this one now correctly shows its full length, instead of resetting to 0 on the season flip.
- **Empty syndicate-event tiles (Tier Crashers, Perfect Rounds, Member with a losing season, etc.) no longer render at all until they've actually occurred**, instead of cluttering the shield grid with "Not enough data yet." placeholders.

**Under the hood - the big one**
- **The entire "Winning MM" / MM-success mechanism was silently broken, every season, since it was built.** It relied on grouping picks by an `MM drop` column - which doesn't exist on the Sheet, and never has. This meant the Presidential Race's +1.5 MM bonus, the "Winning MMs YTD" tile, and Team success rate were all quietly wrong for everyone, every season. Replaced with the real rule: a team's weekly MM is *dropped* when all three team members have a real pick recorded for the same date, and *successful* when all three won - derived purely from team membership + date, with no dependent column at all.
- Separately (Sheet-side, not a Hub bug): a broken master-cell reference (`Dashboard!J12`) was causing TP's Presidency Race row to read the wrong data entirely. Fixed on the Sheet by re-entering TP in the master cell.

**Housekeeping**
- Cache-busting version markers (`?v=X.X`) added to `styles.css`, `app.js` and `pickAssistant.js` in `index.html` - bump this number on every future update, or browsers may keep serving a stale cached copy.
- Two stray duplicate files (`app (2).js`, `app (4).js`) that had accumulated from upload conflicts have been deleted.
