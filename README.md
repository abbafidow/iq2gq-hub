v1.6 changes
Dashboard redesign. Top-row KPIs are now 12 tiles grouped into three colour-coded sections:
Wins & losses - Success rate, Successful picks, Winning MMs YTD
Money & people - Winnings to date, Highest success rate (ties shown together), Most MM kills
Odds - Avg winning odds, Highest winning odds, Lowest losing odds
Every tile compares against the same number of completed rounds last year (distinct dates, not elapsed calendar time), so a comparison after 3 rounds this season is measured against the first 3 rounds last season, not a date-matched window.
Teams competition, new. Team One-Four (captain listed first) shown side by side with Presidential Race, with Win $ and team success rate. Team membership is currently hardcoded in app.js - the agreed long-term home is a Member -> Team lookup on the Lists tab once that's added.
Team form this quarter, new panel nested under Teams competition. Compares all four teams' Win $ and success rate within the current calendar quarter (independent of each team's own AC captaincy cycle), best/worst highlighted.
"Insights this year" strip, new. Top sport / top bet option / top pick option by success rate, with a minimum-picks confidence floor so early-season noise doesn't surface as a "top" result.
Smart Insights moved from Dashboard to Pick Assistant. Same panel (Member performance, Current form, Best sport/bet type, Odds performance), just relocated - it's syndicate-wide info, not really a "dashboard KPI."
Removed the duplicate Sport group performance / Bet type performance tables from the Dashboard. Both already exist in full (plus a drilldown) on the Sports and Bet types tabs - the dashboard copies were pure duplication.
Fixed: "Winning MMs" and the Presidential Race's +1.5 MM bonus were silently broken all along, not just this season. The original logic grouped picks by a MM drop column - but that column doesn't exist on the Sheet, so it was silently matching nothing, for every season, since it was built. The README previously claimed this was "verified against your spreadsheet"; that verification was wrong, or against something that's since changed.
Real rule, now implemented correctly: a team's weekly MM is dropped when all three of that team's members have a real pick recorded for the same date, and successful when all three of those picks won. No dedicated flag column involved - it's derived purely from team membership + date, confirmed against your actual week-two data (Teams One, Two and Four each landing a paying MM; Team Three landing none).
This fixes three things at once: the Winning MMs YTD tile, the Team success rate in Teams competition, and the Presidential Race +1.5 MM bonus (this was quietly wrong for every member, every season, until now).
Stand Down and other admin rows are explicitly excluded from counting as part of a team's drop, so a standing-down member doesn't get silently treated as part of a completed multi.
MM Return is now parsed into the data model. It previously wasn't read into any pick's data at all - "Winnings to date" and Teams competition's "Win $" both depend on it.
Known separate issue, not yet fixed: TP's Presidential Race points are currently ~3.5 too high compared to the sheet - the opposite direction from the MM bonus bug, so it's a different problem (likely a duplicate row or a stray $2.00+ win somewhere in TP's picks this season). Still needs the raw data checked.
Housekeeping: two stray duplicate files (app (2).js, app (4).js) that had accumulated in the repo from upload conflicts have been deleted - app.js is the only file the site actually loads.

- `index.html`
- `styles.css`
- `app.js`
- `README.md`
- `assets/iq2gq-logo.png`

No Google Sheet or Apps Script changes are required.
