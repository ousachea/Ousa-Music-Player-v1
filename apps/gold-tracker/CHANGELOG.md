# O-Gold Tracker

## 0.3.3

The app is called **O-Gold Tracker** now, on the store card, on the device and in the tab it opens
in. Nothing else about it changes: same id, same settings, same data, so an installed copy updates
in place and simply reads O-Gold Tracker afterwards.

## 0.3.2

An icon of its own for the store and the launcher.

## 0.3.1

Every time on screen now comes from the daemon's zone rather than the browser's. The kiosk's
chromium reports UTC whatever the device's own clock says, so the header clock and the observed
time were running hours behind the device sitting under them.

## 0.3.0

The spot screen quotes both units that matter: per troy ounce, which is how the market prices gold,
and per damlung, which is how it is actually bought. The purity selector is gone from this screen,
so spot is now the plain market quote; purity still sets the valuation used by the converter, the
ledger and the reference table, from the settings panel or the companion app.

Pressing the wheel asks the provider again. A light runs the width of the screen while the request
is out, and the new price lands carrying the colour of the step that brought it.

The app is finally the colour of its subject. The quote is struck in metal over a warm ground, the
chips, tabs and controls carry the same gold, and green and red are left to mean only what they
have always meant here: which way the price went.

A move that rounds away to nothing no longer prints a sign it cannot justify.

## 0.2.1

The purchases screen no longer deletes. A stray tap on a touchscreen is how a whole holding
disappears, and there is no undo on the device, so removing a position is now a companion-app job
where it takes a deliberate save.

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
