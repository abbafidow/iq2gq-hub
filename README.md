## v7.6 changes

**AGM Report - auto-written text**
- **Any written section left empty in the AGM Report tab now writes itself from the data.** Your own text in the tab always takes priority; clear a cell to switch that item back to automatic. In the #agm-preview view, automatic text carries an "Auto-written" tag; members never see the tag.
- **A season in four acts = the four quarters** of the syndicate year, using the Sheet's Quarter column (Q1 Aug-Oct, Q2 Nov-Jan, Q3 Feb-Apr, Q4 May-Jul). Each act covers the quarter's strike rate (and change on the quarter before), the standout member, the leading MM team, the best and worst rounds, $2+ winners, and the Presidency race at the end of the quarter. The title follows the race: "sets the pace", "holds on" or "takes control". A quarter still in progress is written as "so far".
- **Moments that shaped the race** are picked from the data: the biggest MM return, the highest-priced winner, the costliest $2+ miss, the shortest odds to fail, and the biggest single-round climb in the Presidency race.
- **Also automatic:** State of IQ2GQ, Season highlights, the Teams and Financial review comments, and each member's "why" line (this season's strike rate and odds against their career, favourite pick record, MM Killers, streaks and $2+ record).
- Nicknames and the season title stay yours to write.

**Housekeeping**
- Footer version updated to v7.6.

## v7.5 changes

**AGM Report - a temporary report section for AGM week**
- **Replaces the PDF Annual Performance Report.** A full report inside the Hub: cover, Season at a glance, State of IQ2GQ, Season highlights, strike rate history, A season in four acts, Presidency standings with key moments, Teams, Member profiles (nickname, stats and the reason for the nickname), Financial review with prize rules, Matters arising from the last AGM, and Syndicate records.
- **Every figure is calculated live from the Sheet** using the Hub's own functions (Presidential race, teams, fines, records), so the report updates itself each week and always matches the rest of the Hub. Comparisons are against the same point last season.
- **Your writing lives in a new "AGM Report" tab** in the Spreadsheet (Type | Key | Title | Text | Who | Status): AGM date, venue, season, President, season title, narratives, highlights, moments, member nicknames and reasons, matters arising and prize rules. Read by the new AgmReport.gs in the Drop a Pick Apps Script project (one line added at the top of doGet); Code.gs untouched.
- **Hidden from members until AGM week.** A gold banner appears on the Dashboard from the agm_start date for agm_days days (default 7), then disappears. Before that, the Hub address + `#agm-preview` opens a private preview, where anything not yet written shows in red.
- **Present mode** shows one section per screen for the AGM (arrow keys, swipe, Esc to close). **Download PDF** prints the report one section per page via the device's Save as PDF.
- **Powder blue, navy and sunshine gold** - used only for the AGM report; the rest of the Hub keeps its own colours.

**Fines - Spreadsheet payments now show in the Hub**
- **Header names are tidied before they're read.** A stray space in the "Date MM / Fine Paid" header made every fine read as unpaid (tested: $460 across 36 fines shown as owing instead of the real $60 across 6). The fines columns are also found by a looser match, and amounts like "$10" read correctly.
- **The Hub re-reads the Sheet quietly** whenever a member comes back to it and whenever Acknowledge payment is opened, so fines paid straight into the Spreadsheet show up without a reload.
- **Fines with no amount in the Sheet yet** are labelled "amount not in the Sheet yet" (the Hub shows the escalation rule's amount) so they aren't mistaken for errors.

**Housekeeping**
- Footer version updated to v7.5.

## v7.4 changes

**Faster, more reliable opening**
- **Opens instantly after the first visit.** The Hub now saves the last Sheet data it loaded on each member's own device. Next time, it opens straight away with that copy (the status line shows how old it is, e.g. "Showing data from 2 hours ago - updating...") and quietly swaps in fresh data once Google answers.
- **No more "Could not load Google Sheet data" on a slow first open.** The Sheet feed comes from Google Apps Script, which can take 10-20 seconds to wake up after a quiet spell and sometimes fails on that first wake-up. Each attempt now has a 25-second time limit and is retried automatically (up to 3 attempts), with "Google Sheets is waking up - still loading..." shown on the loading screen meanwhile.
- **If Google still can't be reached,** members keep seeing the saved copy with its age shown, or - on a first visit with nothing saved - get a Try again button instead of a dead end.
- **Fresh data never interrupts someone mid-task.** If new data arrives while a member is dropping a pick, acknowledging a fine or typing in Search, the page isn't redrawn under them; it picks up the new data on the next screen.
- **Real-world sports files (about 10MB) are no longer re-downloaded on every visit.** The browser now checks with GitHub and only downloads files that have actually changed (they update once a day).
- Code.gs is untouched - all changes are in app.js.

**Housekeeping**
- Footer version updated to v7.4.

## v7.3 changes

**Cleaner phone layout - same content, phones only**
- **Bottom navigation bar on phones.** All six sections (Home, Drop pick, Assistant, Stats, Records, Search) sit in a bar at the bottom of the screen with icons, instead of a tab row that scrolled sideways and hid Records and Search off-screen.
- **Tighter tiles.** The Dashboard's top tiles stay three across, with less padding and better-sized text. Insights this year and Financial position tiles now sit three across instead of one per row; tapping one flips it and opens it to full width so the detail is readable.
- **Records award tiles two across** instead of one per row.
- **Tap a section heading to fold it.** Every Dashboard section with a heading (Presidential race, Teams competition, Recent picks, etc.) folds and unfolds with a tap. All sections start open, so nothing is hidden by default.
- **Lighter styling.** Slimmer header, less padding, and tables sized to fit the screen.
- **Desktop is unchanged.** Every change sits inside a phone-only (640px and narrower) style block, plus a small `applyPhoneLayout()` helper in app.js that adds the nav icons and fold headers.

**Housekeeping**
- Footer version updated to v7.3.

## v7.2 changes

**Acknowledge payment - new button on the Outstanding fines tile**
- **Members can now mark their fines as paid directly in the Hub**, instead of editing the Spreadsheet. Flip the Outstanding fines tile on the Dashboard, tap Acknowledge payment, tap your own 2-letter code (same team-coloured tiles as Drop a Pick), tick the fines you've paid and confirm.
- **The member grid shows who owes what** - each tile shows that member's total owing, or "All square". Members with nothing owing are dimmed but still tappable, so a mistaken payment can still be reached and undone.
- **What it writes to Raw_Live:** today's date into "Date MM / Fine Paid" and, only if that cell is empty, the fine amount into "Fines". An amount already entered by hand is never overwritten, and a fine already marked as paid is left alone.
- **Undo in the Hub.** Every fine paid this season has an Undo button, which clears "Date MM / Fine Paid" only - the amount stays as the record of what was owed.
- **Tiles update straight away.** Outstanding fines, Gross revenue and YTD position all refresh the moment a payment is recorded or undone, without reloading the Sheet data.
- **Phone back button works through the flow** - back from a member's fines returns to the member grid, then to the Dashboard, same as Drop a Pick.
- **Backend is a new file, FineAck.gs, in the existing Drop a Pick Apps Script project** - Code.gs is untouched. PickEntry.gs gains two lines at the top of doPost that hand fine payments to FineAck.gs and leave Drop a Pick submissions exactly as before. Rows are found by member code + round date, matching columns by header name rather than position, and writes are locked so two payments at the same moment can't clash. `testFineAckSetup()` can be run from the editor as a read-only check that every column is found.
- **Identity:** anyone can currently select any member, the same trust model as Drop a Pick. Once the Hub moves behind Cloudflare Access, the member grid can be skipped so each member only sees and acknowledges their own fines.

**Housekeeping**
- Footer version updated to v7.2.

## v5.0 changes

**Drop a Pick - new tab**
- **Members can now enter their own picks directly in the Hub**, instead of the previous manual process. Tap your own 2-letter code (tiles grouped and colour-coded by team) to identify yourself - no login.
- **Sport auto-suggests, but only when it's genuinely safe to guess.** If a Pick's own history has always been tagged the same Sport, it pre-fills (still editable). If that Pick's history is split across more than one Sport - or it's never been picked before - it's left blank for you to choose, rather than risk a wrong guess.
- **Search-select for Pick, Bet type and Sport**, ranked by how often each option has actually been picked before (not alphabetically) - so a constantly-picked team like NZ Warriors surfaces before a rarely-used, alphabetically-earlier entry. Pick and Bet type let you add something new if it's not on the list yet; Sport doesn't, since it has to match a valid value for the rest of the Hub to make sense of it.
- **"Change your mind" flow.** If you already have a pick recorded for the current round, the Hub shows it to you and asks for explicit confirmation before letting you replace it - it will never silently overwrite an existing pick.
- **Backend is a genuinely new, separate Apps Script Web App** (not part of the existing Code.gs API), writing directly into Raw_Live by finding your existing pre-populated row for the current round - it never creates new rows. Fixed a real partial-write bug during testing (the four fields were being written as four separate commands; if anything interrupted execution between them, some fields would land and others wouldn't) by switching to a single atomic write.
- **Date is worked out automatically** - defaults to the current week's Friday round, rolling forward the moment it becomes Saturday.

**Real-world sports data**
- **EPL, NFL, NRL and Super Rugby now refresh automatically every day**, instead of relying on manually re-downloading a spreadsheet whenever someone remembered to. A scheduled job pulls fresh results from a live sports-data API and merges in anything new.
- **AFL and NPC have real-world data for the first time ever** - previously Worth Watching and Rate Your Pick could only use the syndicate's own pick history for these two sports, with no actual match data behind them at all. Both now feed into Worth Watching's patterns and Rate Your Pick's signals exactly like the other four sports.
- **Fixed: NRL and Super Rugby team names were silently split across multiple spellings** (e.g. "Cronulla Sharks" vs "Cronulla-Sutherland Sharks"), fragmenting a team's real history across two names that never matched each other. Cleaned up in the existing data and prevented going forward.
- **Fixed: overlapping automation runs could double-write the same games as duplicates.** A concurrency guard now stops two runs from ever executing at the same time.

**Pick Assistant**
- **Fixed: pending picks (no result yet) were quietly dragging down success rates**, since they were counted the same as a loss until they resolved. Genuinely strong patterns could get filtered out or under-ranked while a pick was still open. Now excluded until resolved.
- **Fixed: a negative point start ("-6.5") and a positive one ("6.5") were being treated as the same bet.** The two are opposite situations (favourite vs underdog) - fixed the parsing and corrected the pooling direction so "or lower" and "or higher" now mean the right thing for each.
- **Rate Your Pick now compares against the same bet type at a similar price**, not just any bet in the same sport - previously a Point Starts bet could get compared against unrelated Totals or H2H bets just because the odds happened to match.
- **Rate Your Pick now shows a real-world winning-margin signal for point-start bets** - "how often has this team actually won by enough to cover this line", computed from real scorelines, separate from whether the syndicate has personally bet this exact line before.
- **Worth Watching options now rotate weekly among near-tied patterns**, instead of the single highest-rated pattern permanently crowding out everything else - seeded by calendar week, so it changes on a fixed schedule rather than randomly.

**Records / List of Honour**
- **Presidents & Benson redesigned as a swipeable year dial**, spanning every syndicate term - president, honorific, Benson (last place), and AGM venue/activity/immunity winner where known.
- **Records reworked as an actual award system** - ribbon medals for odds and streak records, laurel medals (green for achievements, red for records nobody wants) for individual member records, and seals for whole-syndicate events. All-time flips to gold on the back, tone carried through as colour rather than background.
- **New "Highest earning team" record**, using gross MM earnings (not the same figure as the Team Winnings Tally table, which nets out stake) - current season plus the single best team-in-a-season since 2021/22, since teams reshuffle every year and a cumulative total across different rosters would be misleading.
- **Fixed: the Dashboard's President line was pulling rank 1 off the Presidential Race table** - President is a fixed role for the whole term, unrelated to leaderboard standing. Now reads from the same president data as the year dial.
- **Fixed: a real losing-streak bug** - the season face of Longest Losing/Winning Streak could surface a stale streak from a member who hadn't picked in years, since it wasn't checking whether their last pick was actually recent.
- Renamed "Tier Crashers" to "Tier Killers" to match the syndicate's actual terminology.

**Housekeeping**
- Cache-busting for `styles.css` and `app.js` is already fully automatic (`Date.now()` in `index.html`, not a manually-bumped number) - nothing to do there. The footer version label itself is the one thing that's still manual; updated to v5.0 alongside this release.
