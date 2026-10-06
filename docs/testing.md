# Test report and coverage

Version: **0.1.5**. Status: **user-validated Positions display, including Last, Cost Basis, and the 0.1.4 column-change fix**. Automated test data is fictional. No brokerage session, real account, personal browser profile, or real currencyapi key was used by automation.

## User-confirmed live checks

After installing 0.1.1, the user confirmed that Manual mode works on the live Positions page. The user then enabled ECB daily reference and confirmed that it also works. The supplied popup screenshot shows ECB selected and 3/3 fields annotated. Version 0.1.2 removes the validation banner at the user's request and adds the extension icon. This records the user's live display confirmation; it does not imply that every detailed scenario below was individually exercised.

On October 6 the user confirmed that the 0.1.4 Last and column-change update works, then requested Cost Basis conversion with `M` interpreted as million. After installing 0.1.5, the user also confirmed that Cost Basis conversion works.

## Environment

- Windows x64, Intel Core i7-13700K.
- Node 22.22.2, npm 10.9.7.
- TypeScript 7.0.2, esbuild 0.28.2, Vitest 5.0.3, Playwright 1.63.0.
- Bundled Chromium 153.0.8010.12 in disposable persistent contexts.
- Latest full run: October 6, 2026 (user's Pacific date). Historical 0.1.0 smoke evidence is dated separately below.

## Executed checks

| Check | Result / scope |
| --- | --- |
| `npm run typecheck` | Passed strict checking. |
| `npm test` | 136 tests passed across 5 files, including Cost Basis million parsing, schema-1/schema-2/schema-3 migration, and preservation of disabled fields. |
| `npm run build` / `npm run build:test` | Passed. Production and fixture bundles are separate; the production dependency graph excludes the fixture adapter. |
| Chromium browser tests | 34 tests passed: 18 using the production build with reconstructed captured structure, and 16 using the separate synthetic build. Coverage includes all six holding columns and Cost Basis million expansion, independent mappings/toggles, Last's previous-close marker and row currency evidence, unchanged/missing accessibility indexes, multiple body sections, golden annotations, native text/copy preservation, row geometry, value changes, accounting signs, row reuse/detachment, sort/reorder/hide, navigation/remount, popup off/setup/reset, actual toolbar-popup sizing/status, storage isolation, message rejection, shared caches, and migration across browser restart. |
| Production manifest/bundle inspection | Only storage and the specified origins; no localhost, fixture selectors, remote scripts, or convenience permissions in production. PNG signatures/dimensions and toolbar icon registration checked for all five sizes. Popup image loading and removal of the pending warning passed. |
| Public FX smoke | Passed on 0.1.0 at `2026-10-01T05:46:38Z`: production worker code in a disposable Chromium profile fetched the fixed ECB-filtered endpoint, returning source date `2026-09-30` and KRW-per-USD rate `1355.4`. This is historical test evidence, not a current quote. Not repeated after 0.1.0; provider code is unchanged. The user subsequently confirmed live ECB operation on 0.1.1. |
| Install audit | npm reported 0 known vulnerabilities at initial dependency installation. This is not a security guarantee. |

The FX smoke uses a temporary copy of the production manifest with **only ECB permission pregranted** for that test. It verifies actual extension-worker network transport, normalization, and persistence. The production artifact retains optional permissions. It does not verify the native Chrome permission dialog.

Automated provider failures include timeout, offline/network errors, authentication, quota windows, Retry-After, invalid JSON, wrong content type, oversized responses, redirects, mismatched pairs/providers, invalid/future source dates/times, and stale cache handling. Unit tests recreate the service to verify persisted cache/retry/lease restoration. Source changes reject obsolete provider responses. No currencyapi request silently falls back to ECB.

## Performance and presentation

A 200-row synthetic holdings table plus cash was tested with a cached/manual rate. The 0.1.5 full run showed **251 ms** to annotate 200 rows and **259 ms** for a single-cell update. This timing fixture enables Market Value and cash only. DevTools observed **2 inserted text nodes** for that update. Four successive 200-row view replacements maintained the expected 201 estimate nodes without duplicates. These are local synthetic timings, not IBKR performance guarantees. Detached field references are cleared by lifecycle teardown; this run is not a comprehensive heap-leak proof or a hardware-independent benchmark.

Browser zoom was set through `chrome.tabs.setZoom` at 100%, 125%, and 150%, with viewport widths 1280, 1440, and 1920 respectively. Light and dark screenshots are in `output/playwright/`. Assertions check page overflow and rendered amounts. Closed shadow-root text is inspected through DevTools in the disposable fixture browser, without adding production test hooks. The golden fixture verifies unchanged native `textContent` and selected-copy text. Live IBKR export/sort behavior is still unverified.

The visibility test explicitly simulates document visibility in the isolated content context, verifies teardown, and advances that context's clock to verify expired numbers do not reappear. Permission decline/grant/revocation responses are simulated around the real popup/worker message flow. Neither simulation establishes behavior of every browser's native UI. A full browser restart in a disposable profile also verifies that a newly created worker restores the prior external cache.

An initial browser failure exposed header mutations being treated as data-row mutations in the synthetic adapter; its header mapping now refreshes the region correctly. Another harness issue blocked extension-owned scripts when blocking external requests; the allowlist now includes extension assets and the local fixture. Direct DevTools termination and extension-reload event handling were unreliable in this harness; the lifecycle check instead restarts the whole isolated browser with its temporary profile. Chrome resolves its zoom command before delivering the resize event; the production geometry assertion now waits for that event and the scheduled layout frame.

Production-selector tests fulfill every portal navigation from `tests/fixtures/captured-positions.html` and block other network traffic. They use the real production manifest and adapter, with fictional values and synthetic CSS. No actual portal request or authenticated page is involved. The adapter is grounded in the offline capture; these tests verify that implementation against the reconstructed structure, including unchanged row dimensions, header-driven mapping, unsupported routes, cell-space guards, scrolling, native handlers, occlusion, and zoom. Live framework behavior remains a separate user-assisted check.

### 0.1.1 regression evidence

The user reported that 0.1.0 showed `UNSUPPORTED_VIEW` with zero fields on the live page. The existing capture has one holdings `tbody` per position; the original fixture incorrectly put every holding into one body. After correcting only the fixture, the original 0.1.0 bundle failed its golden annotation test. The fixed production adapter passes the same test and a new sequence covering updates, body reordering, replacement, removal, and regrouping.

The popup's root/body now have a stable 390-pixel intrinsic width. A narrow initial viewport regression and an actual toolbar popup opened through [Chrome's action API](https://developer.chrome.com/docs/extensions/reference/api/action#method-openPopup) both pass in disposable Chromium. The toolbar test verifies no horizontal overflow and correct active fixture field counts. It does not validate the user's OS scaling or branded Chrome configuration.

## Acceptance coverage

Version 0.1.5 adds Cost Basis under the user's explicit request to interpret `M` as million. Numeric tests cover whole/fractional millions, signs, parentheses, separators, unabridged amounts, invalid suffixes, and bounds after expansion. Settings tests migrate schema 3 while preserving disabled Last/Avg Price and source choices. Three new production-browser cases cover shared rates, native text/copy/layout preservation, exact-cell KRW/USD changes, invalid/unsafe input, moved/removed/hidden columns, and a saved independent toggle. The reorder test caught old overlay positions occluding another field during fit checks; the fix hides all old positions before measuring new ones. The fictional screenshot `output/playwright/cost-basis-millions.png` was visually inspected. The user subsequently confirmed live Cost Basis operation.

Version 0.1.4 adds Last under the user's October 6 request. A regression against the old production code reproduced P&L estimates disappearing when Avg Price was removed without changing later headers' `aria-colindex`. The same test passes after mapping by current header order. New browser cases cover Last with plain/nested spans, split or spaced `C` markers, updates from close to ordinary price, rate changes, same-row currency changes, disabled evidence columns, missing/conflicting labels, malformed/abbreviated prices, removal/reorder/hide/restore, absent accessibility indexes, independent Last toggles, and preserved native text/geometry. Last's marker is rejected in P&L input. The fictional Last/no-Avg screenshot is saved as `output/playwright/last-price-no-avg.png` and was visually inspected. The user subsequently confirmed live operation of this update.

The user's 0.1.3 request expands the original PRD to Avg Price, Daily P&L, and Unrealized P&L. The production fixture now exercises nine estimates across two KRW holdings and KRW cash, with all four holding columns enabled. Tests cover shared-rate updates, negative and accounting signs, zero, skipped abbreviations, exact-cell currency ambiguity, native text/copy and row-height preservation, inherited amount colors, moved/removed/hidden headers, independent popup toggles, and all target zoom levels in light/dark themes. The worker restart test migrates a schema-1 configuration while preserving its ECB source and cache; unit cases also preserve a manual rate's entry time. These added columns have not yet received a separate live user confirmation.

| PRD acceptance IDs | Automated evidence | Remaining live/manual evidence |
| --- | --- | --- |
| AT-01, AT-09 | Captured Positions route/anchors; production adapter tested against fictional captured structure; unsupported routes rejected; no broker-rate adapter. | Live framework behavior. |
| AT-02–07 | Golden values, strict grammar, Cost Basis millions, other abbreviations skipped, pair/provider/date validation, unsafe bounds. | Verified exact-cell currency/precision attributes if needed. |
| AT-08, AT-10–11 | Explicit ECB consent in Auto; labeled sources; freshness/date/weekend boundaries and expired-number hiding. | Optional explicit IBKR rate only if evidence exists. |
| AT-12–16 | Synthetic value/rate changes, sorting/reorder/hide, recycled rows, structural replacement, obsolete-response rejection, disabling. | Actual virtualization, account-view boundaries, framework mounting. |
| AT-17 | Full/compact/inline fixture UI; desktop widths and browser zoom; light/dark screenshots. | Manual Chrome and Brave on the actual view. |
| AT-18 | Setup/reset/key deletion; simulated permission decline/revocation; trusted storage access. | Native permission dialog and browser site-access controls. |
| AT-19–22 | Bounded transport failures, cache/backoff/lease persistence, source isolation, cross-tab sharing, visibility teardown, extension-worker recreation. | Long-duration real-browser suspension/visibility behavior. |
| AT-23–25 | Fixed URLs, header-only synthetic key, omitted credentials/referrer, source/sender validation, content storage denial. | Real keyed smoke test entered directly through UI. |
| AT-26 | Synthetic DOM sorting, native text/selected-copy preservation; keyboard-accessible shadow notes and regional details. | Native IBKR keyboard, copy/export, and row actions (display behavior only). |
| AT-27–28 | Production manifest/bundle audit, strict typing, build, unit and browser tests, measured 200-row fixture. | Basic live Manual and ECB display confirmed by the user; additional scenarios below are not individually reported. |

## Not run / unresolved

- Detailed live IBKR behavior: the user confirmed basic Manual and ECB display. Rapid live updates, account/context switching, and native interactions were not individually reported.
- Real currencyapi keyed request, subscription cadence, quota behavior against an actual key.
- Native permission decline/revocation UI and manual Brave smoke tests.
- Actual IBKR grid virtualization, native export/keyboard behavior, account switches, safe mounting, and layout at the target zoom levels.
- Optional broker DOM-rate discovery. No data source is invented or inferred from totals.
- Extended heap-retention profiling and long-duration browser suspension testing.

## Additional user-assisted coverage checklist

1. Review the captured route and structural evidence in [discovery.md](discovery.md). The production adapter uses those selectors; other layouts remain unsupported.
2. Start with the production build and Manual mode for deterministic comparisons, or explicitly enable the keyless ECB reference. Never activate the invented fixture adapter on IBKR.
3. Load the reviewed production build in Chrome. The user signs in manually. Verify only display/navigation behavior, never place a trade, transfer money, or change account settings.
4. Compare both target fields against hand calculations; verify untouched native values and all out-of-scope columns/rows.
5. Check sorting, filtering, column movement/hiding, scrolling/reuse, in-app/back/forward navigation, context replacement, and enable/disable.
6. Check safe placement, keyboard focus, copy and exports at 100/125/150% and light/dark. If the table cannot safely host estimates, leave it unsupported.
7. Grant/decline/revoke optional source permissions manually. Verify manual offline mode, source labels, error messages, key deletion, reset, hidden tabs, and stale data.
8. Repeat a manual Brave smoke check if that browser is required. Record individual check results to make future regressions easier to diagnose.

Use `npm run check` to reproduce local checks. Use `npm run smoke:fx` only when explicitly intending a public keyless FX request. Test artifacts live in ignored `output/playwright/`; they contain synthetic data and public rates only.
