# Change log

## 0.1.0 — 2026-09-30

Status: **live-site-validation-pending**.

- Implemented strict English amount parsing, KRW-per-USD normalization, full/compact USD display, negative-zero handling, and source-specific freshness policy.
- Added a Manifest V3 worker with consented fixed-endpoint ECB/Frankfurter and currencyapi adapters, shared caches, persisted request/retry timing, bounded transport, and cancellation.
- Added a protected popup with offline manual mode, optional host permissions, session-only/default key storage, explicit remembered keys, deletion/reset, immediate disabling, and sanitized source/status details.
- Added scoped annotation/lifecycle behavior, a separate synthetic demo/test build, and a production adapter based on the supplied local Positions capture. Runtime geometry guards place overlays within unused cell space without changing native row heights.
- Added unit and isolated Chromium tests, a public FX smoke command, build scripts, dependency lockfile, installation/privacy documents, and a live-validation checklist.

The captured route and DOM associations are documented. Live safe mounting, virtualized-grid behavior, native copy/export, and actual Chrome/Brave validation remain pending. The optional IBKR DOM-rate adapter remains unavailable. Private reference materials are excluded from Git.
