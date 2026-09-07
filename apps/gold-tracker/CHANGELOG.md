# gold-tracker

## 0.2.0

The purchases screen now fits a real holding. Past six positions the rows go compact and the whole
ledger sits on one screen instead of paging, and the gain column is wide enough that a loss and its
percentage stay on one line.

The companion app reads and writes CSV: `Weight,Unit,Paid,Date`, one purchase per line, which is
what a spreadsheet exports.

## 0.1.0

Live gold spot from a real provider, defaulting to gold-api.com's XAU/USD feed, with the request
racing the phone's proxy against the webview's own so whichever link is up answers.

Four screens: the spot price with a purity selector and the ranges the app has watched itself, a
converter for li, hun, chi, damlung, grams and troy ounces, a private purchase ledger valued against
live spot, and a quick reference table.

Ranges and the chart are built only from observations this app has actually made. No provider here
offers free intraday history, so rather than showing numbers it cannot verify, a short history is a
short line.
