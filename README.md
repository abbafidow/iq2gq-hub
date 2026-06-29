# IQ2GQ Hub v1.3A - Smart Insights

## Release focus

This release upgrades Smart Insights so they respond more intelligently to the active filters.

## Included

- Smart Insights now adapt to member, sport group, bet type, odds band, year, result and search filters.
- Added confidence ratings based on sample size.
- Added member-specific insights when a member is selected.
- Added sport-specific and bet-type insights when those filters are selected.
- Added current-form insight based on the latest picks in the filtered dataset.
- Added stronger current-season handling so equivalent season labels are treated consistently.
- Current season page now includes current ladder and latest current-season picks.
- Footer updated to v1.3A.

## Upload files

Upload these files to GitHub:

- index.html
- styles.css
- app.js
- README.md
- assets/iq2gq-logo.png

No Google Sheet or Apps Script changes are required.

## Test checklist

- Home page loads.
- Smart Insights display with no filters.
- Select a member; Smart Insights become member-specific.
- Select sport group; Smart Insights become sport-specific.
- Select member + sport group; Smart Insights reflect the filtered data.
- 2025/26 Live page still shows the latest 2025/26 rows.
- Mobile Smart Insight cards remain readable.
