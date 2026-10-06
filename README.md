# IBKR USD Lens

**See the USD equivalent of your Korea Exchange holdings directly in IBKR.**

IBKR USD Lens is a Chrome extension for investors who hold Korean stocks and think in US dollars. It adds estimated USD values beside the Korean won (KRW) amounts on **Interactive Brokers Client Portal → Positions**, so you can read your Korea Exchange (KRX) holdings' prices, value, cost basis, and profit or loss in dollars while keeping the original KRW figures visible.

- **Prices and holdings:** USD estimates for Last, Market Value, Cost Basis, Avg Price, Daily P&L, and Unrealized P&L, plus KRW cash balances.
- **Flexible exchange rates:** use the keyless ECB daily reference, enter a manual rate, or connect your own currencyapi key.
- **Fits your view:** choose which fields to annotate, use full or compact USD amounts, and hide or reorder IBKR columns.
- **Display only:** original values stay intact. The extension does not trade, exchange currency, or change account settings. Portfolio amounts stay in your browser.

For example, at an illustrative rate of **₩1,350 per US$1**, a KRW market value of **₩270,000,000** gets an additional **≈ US$200,000.00** estimate. All supported fields use the same selected FX rate.

Supports the [IBKR Client Portal Positions page](https://portal.interactivebrokers.com/portal/#/dashboard/positions). Live display has been user-validated in Manual and ECB modes, including Last and Cost Basis. Estimates reflect the displayed KRW amounts and the selected FX source; the ECB source is a daily reference, not a live quote.

[Install](#build-and-install) · [Choose an FX source](#rate-setup) · [Supported fields](#supported-fields) · [Privacy](PRIVACY.md) · [MIT license](LICENSE)

## Build and install

**Updating:** version **0.1.5** adds Cost Basis estimates, including `M` amounts interpreted as millions. Cost Basis defaults to enabled; saved sources, rates, consent, and existing field preferences (including disabled Avg Price) are preserved. Reload USD Lens in `chrome://extensions`, refresh Positions, and check that the popup header shows **v0.1.5**.

Use Node **22.12 or later in the 22.x line**, or Node **24+**, and npm. Development was checked with Node 22.22.2 and npm 10.9.7 on Windows. Exact tool versions are pinned in `package.json` and `package-lock.json`. There are zero production dependencies.

```powershell
git clone https://github.com/Dawnflare/IBKR_CurrencyConverter.git
cd IBKR_CurrencyConverter
npm ci
npm run build
```

The unpacked production extension is generated in **`dist/production`**. Node/npm are needed to rebuild, not to run the resulting extension.

1. In Chrome, open `chrome://extensions` and enable Developer mode.
2. Choose **Load unpacked** and select `dist/production`.
3. Pin USD Lens if desired, then open its popup.
4. Choose an FX source and save settings. For keyless rates, expand **External sources & provider key**, click **Enable ECB**, and select **ECB daily reference**. For offline use, choose **Manual** and enter KRW per US$1.
5. Open **Client Portal → Positions**. USD estimates appear beside eligible KRW amounts; the popup shows how many fields are annotated.

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

## Supported fields

**Display preferences** provides an independent toggle for Market Value, Last price, Cost Basis, Avg Price (cost basis), Daily P&L, Unrealized P&L, and Cash Holdings Amount. All seven are enabled by default. Missing, hidden, ambiguous, or disabled columns do not block other supported columns. Mapping follows current table header order, without requiring accessibility indexes to be renumbered after a column change.

Last has no currency label of its own, so the extension reads explicit labels in known monetary columns on the same row, even when conversion for those columns is disabled. The labels must agree on KRW; USD rows and missing or conflicting evidence are skipped. A leading `C` is treated as a previous-market-close marker only for Last. The original marker stays visible, and the estimate's tooltip identifies the previous close.

Cost Basis reads its own KRW label and expands the displayed `M` suffix by 1,000,000 before conversion (for example, `250M` means 250,000,000 KRW and `34.5M` means 34,500,000 KRW). Full amounts also work. The native abbreviation stays visible; the tooltip explains that IBKR may have rounded it. This converts the displayed amount without recovering undisplayed precision.

Every estimate divides its displayed KRW amount by the same selected KRW-per-USD rate. Last represents the displayed market price; Avg Price represents average cost basis per unit. P&L annotations translate the native displayed P&L amount at the selected FX rate; they do not calculate a separate historical USD investment return. Native values, signs, and colors remain intact, and estimates match their native amount's text color.

The extension currently converts KRW to USD only. USD rows are left unchanged. If currency evidence is missing or conflicting, or an estimate cannot fit safely inside its cell, that estimate is withheld. Unsupported routes or layouts are reported as `UNSUPPORTED_VIEW`.

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

## Try the demo

The demo uses fictional holdings and a manual exchange rate, with no IBKR login or external requests. From the repository directory, run:

```powershell
npm ci
npm run demo
```

Open `http://127.0.0.1:4173/positions.html#/positions`. Try changing the FX rate, switching full/compact display, updating values, reordering columns, and loading 200 fictional rows. Stop the server with Ctrl+C. You can also open the generated `dist/demo/index.html` directly in a browser.

## Development and checks

The extension uses Manifest V3 with no production dependencies. Its production adapter is based on a locally inspected IBKR layout; the demo and browser tests use separate fictional fixtures. Private reference captures are excluded from Git and build output. See [discovery.md](docs/discovery.md) for implementation evidence and layout limits.

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

The original vector icon is `src/assets/icon.svg`. Committed PNGs at 16, 24, 32, 48, and 128 pixels are copied into builds for the toolbar, extension listing, and popup. To regenerate them after editing the SVG, run `npm run icons` (requires the development Chromium installed above). Normal builds use the committed files and require no browser.

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

The parser supports English grouped or ungrouped decimals, Unicode/ASCII minus, plus, parentheses, and surrounding nonbreaking spaces. Cost Basis accepts `M`/`m` as million under the user's explicit interpretation; other fields still skip abbreviations because no verified exact-cell precision attribute exists. Expanded amounts and converted results are bounded to an absolute 10¹²; rates to 10⁻⁹–10⁹. Arithmetic uses the displayed numeric precision; `Intl.NumberFormat('en-US')` rounds half away from zero for display, normalizing rounded negative zero. This is an indicative display, not ledger arithmetic.

Annotations use namespaced closed shadow roots so native cell `textContent` remains unchanged. The adapter reads every direct table-body section, including the captured one-section-per-holding layout. Production overlays fit entirely inside measured unused cell space without changing native styles or row heights. Underneath is preferred; a safe inline position is used when a second line would not fit (notably cash). If neither position fits, the number is withheld and the region reports an unsupported layout. Scrolling/resizing repositions overlays; clipped or covered positions are hidden. The captured-structure fixture verifies unchanged row heights and native copy text, but actual IBKR export, keyboard, virtualization, and mounting still need live validation. A framework removing an active mount stops that view's annotations rather than causing an insertion loop.

## Permissions and reporting

The production manifest requests only `storage`, an isolated top-frame content script on `https://portal.interactivebrokers.com/*`, and optional host permissions for Frankfurter and currencyapi. It has no remote code, telemetry, sync storage, cookies, account-action integration, or additional IBKR hosts. See [PRIVACY.md](PRIVACY.md).

For a failure report, include the extension version, source mode, generic error code, and fictional reproduction steps. Supply only the small, manually sanitized snippets described in [discovery.md](docs/discovery.md). Never send real holdings, identifiers, raw responses, full DOM/HTML, HARs, cookies, browser storage/profile data, screenshots containing balances, or provider keys.

## License

[MIT](LICENSE). Copyright © 2026 Dawnflare.

IBKR USD Lens is an independent project and is not affiliated with or endorsed by Interactive Brokers. Estimates are for display only, not executable FX quotes or official IBKR account valuations. Install the extension locally using the steps above; this repository does not provide a browser-store release.
