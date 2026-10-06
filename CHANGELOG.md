# Change log

## 0.1.5 — 2026-10-06

- Added Cost Basis USD estimates with an independent toggle enabled by default and preserved existing field/source preferences.
- Interpret Cost Basis `M` amounts as millions, including decimals, signs, and accounting parentheses; retain native abbreviations and explain their displayed precision in the tooltip. Full numbers are also supported.
- Retain exact-cell KRW eligibility, USD exclusions, expanded-amount bounds, and column-change handling.
- Hide old overlay positions before checking new positions so a moved Cost Basis estimate cannot temporarily suppress Last's estimate.
- Added numeric, settings-migration, and production-browser tests for Cost Basis, shared rates, native text/layout, invalid values, currency changes, and column movement/hiding/toggles.
- Recorded the user's confirmation that the 0.1.4 Last and column-change fixes and 0.1.5 Cost Basis conversion work live.

## 0.1.4 — 2026-10-06

- Added Last price USD estimates using explicit, agreeing currency labels from the same row. USD rows and rows with missing or conflicting currency evidence are skipped.
- Recognize Last's leading `C` as a previous-close marker, preserve native text, and identify the previous close in the estimate tooltip.
- Removed the requirement that `aria-colindex` equal the current DOM position. Removing Avg Price or moving columns no longer disables subsequent P&L estimates; hidden or absent fields are normal display preferences.
- Added an independent Last toggle enabled by default, preserving existing settings, including disabled Avg Price. Clarified Avg Price as cost basis in the popup.
- Added regressions for the reported removal failure, Last updates/markers, row currency changes, missing/conflicting evidence, reordered/hidden/restored columns, and settings migration.

## 0.1.3 — 2026-10-01

- Changed the icon's currency mark from dollar to Korean won (₩) at every PNG size.
- Added USD estimates for explicitly KRW Avg Price, Daily P&L, and Unrealized P&L at the user's request, using amount/currency structures verified in the existing offline capture.
- Added independent display toggles, enabled by default, with migration preserving existing sources, rates, consent, and field preferences.
- Kept one observer/status per region and one selected FX rate across all fields. Column mapping remains independent and follows header changes; estimates preserve negative values and match native amount colors.
- Added migration and multi-column regression coverage with fictional data, including native text/row-height preservation, toggles, ambiguous input, and desktop zoom/themes.

## 0.1.2

- Removed the live-validation warning and pending status after the user confirmed successful live Manual and ECB display.
- Added an original teal lens icon with a gold dollar mark to the toolbar, extension listing, and popup, including 16/24/32/48/128-pixel PNG assets and editable SVG source.
- Recorded the user's successful checks in the documentation while retaining the detailed coverage limits.

## 0.1.1 — 2026-09-30

- Fixed page detection rejecting the captured holdings grid because it uses one `tbody` per holding. Discovery now accepts multiple body sections and reads each section's direct rows.
- Corrected the fictional captured-structure fixture, reproduced the 0.1.0 failure, and added regression coverage for updates, sorting/reordering, replacement, removal, and regrouping across body sections.
- Fixed the toolbar popup's width by giving its root and body a stable intrinsic width. Added both narrow-viewport and actual toolbar-popup checks.
- Show the installed version in the popup and refresh its field counts while open so asynchronous annotation updates are reflected.

The saved manual rate is preserved. Reload the extension and refresh the Positions page to use this build. Live-site validation remains pending.

## 0.1.0 — 2026-09-30

Status: **live-site-validation-pending**.

- Implemented strict English amount parsing, KRW-per-USD normalization, full/compact USD display, negative-zero handling, and source-specific freshness policy.
- Added a Manifest V3 worker with consented fixed-endpoint ECB/Frankfurter and currencyapi adapters, shared caches, persisted request/retry timing, bounded transport, and cancellation.
- Added a protected popup with offline manual mode, optional host permissions, session-only/default key storage, explicit remembered keys, deletion/reset, immediate disabling, and sanitized source/status details.
- Added scoped annotation/lifecycle behavior, a separate synthetic demo/test build, and a production adapter based on the supplied local Positions capture. Runtime geometry guards place overlays within unused cell space without changing native row heights.
- Added unit and isolated Chromium tests, a public FX smoke command, build scripts, dependency lockfile, installation/privacy documents, and a live-validation checklist.

The captured route and DOM associations are documented. Live safe mounting, virtualized-grid behavior, native copy/export, and actual Chrome/Brave validation remain pending. The optional IBKR DOM-rate adapter remains unavailable. Private reference materials are excluded from Git.
