# IBKR USD Lens

**Status: live-site-validation-pending.** A private Manifest V3 extension for supplementary USD estimates of explicitly KRW Market Value and KRW Cash Holdings Amount. Conversion means local arithmetic and display. There are no trading, transfer, brokerage API, or account-management features.

The calculation, provider worker, protected settings popup, annotation engine, synthetic demo, and production site adapter are implemented. **The production adapter supports the captured `https://portal.interactivebrokers.com/portal/#/dashboard/positions` layout.** Its selectors and amount/currency associations come from the user-provided local MHTML capture. Unrecognized routes/layouts and cells without safe presentation space return `UNSUPPORTED_VIEW`. Actual browser interaction still needs the user-assisted checks in [discovery.md](docs/discovery.md). The private reference capture is excluded from Git; only manually constructed fictional fixtures are included. No IBKR page rate has been verified, so that source is unavailable.

## Try the synthetic demo

The generated `dist/demo/index.html` can be opened directly in a browser. It uses fictional amounts and a manual rate, without external requests. To build and serve it locally:

```powershell
npm ci
npm run demo
```

Open `http://127.0.0.1:4173/positions.html#/positions`. Change 1,350 to 1,500 KRW per USD, switch full/compact display, disable estimates, update values, recycle rows, reorder columns, replace the view, and load 200 fictional rows. Stop the local server with Ctrl+C.

## Build and install

**Updating from 0.1.0:** version **0.1.1** fixes `UNSUPPORTED_VIEW` on the captured grid, which contains a separate table body for each holding. Reload USD Lens in `chrome://extensions`, refresh Positions, and check that the popup header shows **v0.1.1**. Your saved Manual settings are preserved.

Use Node **22.12 or later in the 22.x line**, or Node **24+**, and npm. Development was checked with Node 22.22.2 and npm 10.9.7 on Windows. Exact tool versions are pinned in `package.json` and `package-lock.json`. There are zero production dependencies.

```powershell
npm ci
npm run build
```

The unpacked production extension is generated in **`dist/production`**. Node/npm are needed to rebuild, not to run the resulting extension.

1. In Chrome, open `chrome://extensions` and enable Developer mode.
2. Choose **Load unpacked** and select `dist/production`.
3. Pin USD Lens if desired, then open its popup.
4. Configure a source and save settings. The popup explains the pending live validation. Open the captured Positions view, then perform the display-only checklist in `docs/testing.md`. You can test public FX separately from the popup.

After rebuilding, click the extension's **Reload** button and reload any test page to retire its previous content script. Do not run two copies of the extension on one page. Chrome 114 is the declared minimum for the selected APIs; automated browser validation used bundled Chromium 153. Brave can load the same unpacked build at `brave://extensions`, but a manual Brave smoke test is still required.

The separate **`dist/test`** build matches only `http://127.0.0.1:4173/*` and uses the invented fixture contract. Load it only for synthetic testing; use `?extension=1#/positions` in the demo URL so the standalone demo engine stays off. It is not an IBKR build.

## Rate setup

The initial choice is **Auto**, in a setup-needed state. Estimates and external sources remain disabled until configured. Enabling an external source is a separate explicit action that requests its optional host permission. Save settings to complete setup. Declining permission leaves Manual available.

| Source | Setup and behavior |
| --- | --- |
| Auto | Prefer a verified IBKR DOM rate when one exists. This build has no verified broker adapter, so Auto uses the enabled ECB reference source or reports permission required. |
| ECB daily reference | Expand **External sources & provider key**, enable ECB, then save this source. The fixed Frankfurter v2 request pins `providers=ecb`; it is a daily reference, never a live quote. |
| currencyapi | Enable its source permission, enter your own key directly in the popup, and select your actual daily/hourly/minute-level plan cadence. Errors retain eligible provider cache; they do not silently switch to ECB. |
| Manual | Enter **KRW per US$1**, enable estimates, and save. Saving Manual mode explicitly reconfirms its entry time. This mode makes no FX requests. |

Keys default to **session-only storage** and disappear on browser restart or extension reload/update/disable. **Remember on this device** uses ordinary local extension storage, not an encrypted credential vault. Use **Delete key** to remove either saved key and its provider cache. **Clear all saved data** removes preferences, manual rate, external caches/retry state, and keys, and returns to setup. Browser-granted host permissions can be revoked using the source buttons or Chrome's extension settings.

The **Show USD estimates** switch takes effect immediately after setup. It removes annotations and stops relevant work. Browser-level disabling/removal can leave previously inserted DOM until the page is reloaded; reload the page after uninstalling or disabling through Chrome.

## Freshness and failures

One selected rate serves both regions in a view. Source dates/times, successful fetch time, and a possible future DOM observation time remain distinct. Every estimate includes source details and the display-only disclaimer. Native valuation freshness is unknown.

| Source | Automatic request interval while a visible supported view needs it | Warning / hide policy |
| --- | --- | --- |
| ECB | 60 minutes | Over 4 UTC calendar days: older reference; over 7: hide numbers. |
| currencyapi minute-level | 5 minutes | Over 15 minutes: stale FX; over 24 hours: hide numbers. |
| currencyapi hourly | 60 minutes | Over 2 hours: stale FX; over 24 hours: hide numbers. |
| currencyapi daily | 24 hours | Always daily; over 4 calendar days: warning; over 7: hide numbers. |
| Manual | None | Over 24 hours: reminder; over 7 days: require reconfirmation. |

Dates use UTC calendar-day comparisons; a date-only quote is never assigned an artificial time. Invalid or excessively future timestamps are rejected. Weekends and holidays do not themselves indicate connection failure.

Requests time out after 10 seconds and responses are limited to 16 KiB. Requests are shared across tabs. Retry state and in-flight request leases survive worker recreation. Transient backoff uses 1/5/15 minutes **subject to the longer source interval and server retry window**. HTTP 401/403 stops automatic retries until settings/key changes or an explicit test. HTTP 429 honors `Retry-After` or a documented quota reset; an unknown quota window stops automatic retries until an explicit test. Invalid responses never replace the last valid cache.

**Refresh / test FX** is an explicit provider test. It may bypass a normal cache interval but not rate-limit backoff, has a global 60-second cooldown, and allows at most one successful currencyapi daily request per hour. It refreshes only FX. Normal polling requires visible eligible fields; hidden/closed tabs do not keep a worker polling loop alive.

## Development and checks

```powershell
npm run typecheck
npm test
npx playwright install chromium
npm run test:browser
# All required local checks:
npm run check
# Explicit real request to the public, keyless ECB endpoint:
npm run smoke:fx
```

Browser tests use new temporary profiles, synthetic data, mocked FX, and blocked unrelated network traffic. `smoke:fx` uses a disposable copy of the production build with ECB permission pregranted solely for that test. It never opens IBKR. Neither test command requires or accepts a real provider key.

See [testing.md](docs/testing.md) for actual results, coverage limits, and the remaining manual checklist. Generated artifacts and screenshots are ignored by Git and can be reproduced with the commands above.

## Source map

| Path | Responsibility |
| --- | --- |
| `src/core/` | Number grammar, conversion, rounding, normalized records, freshness, settings/message validation. |
| `src/worker/` | Fixed FX requests, protected local/session storage, shared cache and retry scheduling, sender authorization. |
| `src/content/` | Local amount processing, scoped observers, generation cancellation, presentation and teardown. |
| `src/site/production.ts` | Captured Positions route, table/header mapping, strict amount/currency associations. |
| `src/popup/` | Setup, immediate on/off, optional permissions, credentials, source selection, sanitized status. |
| `tests/fixtures/`, `demo/` | Invented layout and fictional data, excluded from production. |
| `docs/discovery.md` | Evidence ledger and exact live-integration prerequisites. |

The parser supports English grouped or ungrouped decimals, Unicode/ASCII minus, plus, parentheses, and surrounding nonbreaking spaces. Abbreviated values such as `270M` are skipped because no verified exact-cell precision attribute exists. Amounts and converted results are bounded to an absolute 10¹²; rates to 10⁻⁹–10⁹. Arithmetic retains native numeric precision; `Intl.NumberFormat('en-US')` rounds half away from zero for display, normalizing rounded negative zero. This is an indicative display, not ledger arithmetic.

Annotations use namespaced closed shadow roots so native cell `textContent` remains unchanged. The adapter reads every direct table-body section, including the captured one-section-per-holding layout. Production overlays fit entirely inside measured unused cell space without changing native styles or row heights. Underneath is preferred; a safe inline position is used when a second line would not fit (notably cash). If neither position fits, the number is withheld and the region reports an unsupported layout. Scrolling/resizing repositions overlays; clipped or covered positions are hidden. The captured-structure fixture verifies unchanged row heights and native copy text, but actual IBKR export, keyboard, virtualization, and mounting still need live validation. A framework removing an active mount stops that view's annotations rather than causing an insertion loop.

## Permissions and reporting

The production manifest requests only `storage`, an isolated top-frame content script on `https://portal.interactivebrokers.com/*`, and optional host permissions for Frankfurter and currencyapi. It has no remote code, telemetry, sync storage, cookies, account-action integration, or additional IBKR hosts. See [PRIVACY.md](PRIVACY.md).

For a failure report, include the extension version, source mode, generic error code, and fictional reproduction steps. Supply only the small, manually sanitized snippets described in [discovery.md](docs/discovery.md). Never send real holdings, identifiers, raw responses, full DOM/HTML, HARs, cookies, browser storage/profile data, screenshots containing balances, or provider keys.

Display estimate only. Not an executable FX quote or IBKR account valuation. Independent of IBKR. This release is for personal unpacked use; no public distribution or broker endorsement is implied.
