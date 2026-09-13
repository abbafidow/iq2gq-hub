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
