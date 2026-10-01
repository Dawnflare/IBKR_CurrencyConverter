# IBKR USD Lens
## Product Requirements Document and Codex Implementation Brief

**Version:** 1.0  
**Prepared:** September 30, 2026  
**Status:** Ready for implementation planning; live-site discovery and validation remain required.  
**Product:** A private, display-only Chrome extension that adds estimated USD equivalents to KRW position values and cash balances in IBKR Client Portal.  
**Primary platform:** Windows desktop, Google Chrome. Brave is a secondary compatibility target.  
**Distribution:** Locally installed, unpacked extension. No public store publication in this release.

> **Core rule:** Add helpful USD annotations; never alter the original brokerage values or perform an account action. “Convert” in this document means arithmetic and display only—not an FX transaction.

---

## 1. Product goal and settled decisions

The user holds Korean-listed equities, including SK Hynix and Samsung, and wants to judge position sizes in USD without mentally translating KRW. IBKR's Positions page shows those holdings in their local currency despite the account using USD as its base currency. The user has checked the available native columns and did not find the desired simultaneous USD display.

Build a small extension that augments the existing Positions view rather than creating another portfolio dashboard.

| Decision | Requirement |
|---|---|
| Initial fields | Annotate **Market Value** for explicitly KRW-denominated position rows and **Amount** for the KRW row in **Cash Holdings**. |
| Original figures | Preserve IBKR's original text, currency labels, ordering, and controls. |
| Target currency | USD only in v1. |
| Default presentation | A smaller, readable USD line immediately below the original amount; offer inline and compact formatting options. |
| Default FX policy | **Auto: use a verified, explicit IBKR page rate when available; otherwise use a clearly labeled ECB daily reference rate through Frankfurter, after the user enables that external source.** |
| Intraday alternative | Include an optional currencyapi adapter using a user-supplied API key. Data freshness depends on the user's provider plan and returned timestamps. No purchase or provider registration is required for the keyless mode. |
| Offline alternative | Include a manually entered rate, visibly labeled **Manual**. |
| Safety posture | No brokerage API calls, credentials, network interception, trading automation, or persistent portfolio storage. |
| Architecture | Manifest V3, isolated content script, extension service worker for public FX requests, local settings, and a compact extension popup. |
| Implementation prerequisite | Inspect the actual DOM locally before claiming production selectors work. A screenshot is not DOM evidence. |

**Important scope distinction:** The default keyless fallback is a *daily reference estimate*, not a live FX feed. Intraday conversion requires either a suitably current, verified IBKR page rate or the optional external intraday service. Shipping daily mode must never be described as fulfilling a live-rate guarantee.

Requirements below are mandatory for v1 unless marked **conditional** or **future**. A conditional feature must be honestly unavailable when its prerequisite is absent; it must not be simulated in the production build.

## 2. Evidence, assumptions, and unknowns

### 2.1 Established from the user and supplied screenshot

The relevant page contains **Your Holdings**, a **Market Value** column, and a **Cash Holdings** section with currency and amount columns. KRW and USD values coexist. Some other fields use abbreviated amounts such as millions. The user wants supplementary USD values alongside KRW—not replacement figures and not actual conversion of cash.

The screenshot's account identifiers, holdings quantities, and balances are unnecessary implementation inputs. Do not copy them into source code, fixtures, documentation, logs, or screenshots. Use synthetic amounts throughout development.

### 2.2 Technical facts verified in public documentation

Chrome content scripts can read and change page DOM while running in an isolated JavaScript environment. Cross-origin FX requests can be made from an extension context with appropriate host permissions. Manifest V3 service workers can be suspended, so essential state cannot depend on a permanently running worker. [S1–S4]

IBKR documents currency-ledger API data that includes an exchange-rate field. This does **not** establish that an explicit rate is available in the logged-in page DOM, that a browser session authorizes an API call, or that its freshness is suitable for this feature. Brokerage API integration is outside v1. [S5]

Frankfurter documents daily reference data, provider filtering, a keyless public API, and a single-pair endpoint. ECB reference data is informational rather than an executable quote. currencyapi documents USD-base rates, KRW support, update timestamps, and plan-dependent update frequency. [S6–S10]

### 2.3 Unknown until implementation discovery

The exact Positions URL, DOM selectors, table implementation, row virtualization behavior, availability of full-precision amount attributes, optional IBKR page-rate location, and insertion behavior under the current IBKR framework have **not** been validated.

Public documentation was reviewed for this PRD. A successful live FX endpoint response from the extension and actual Chrome/IBKR integration have **not** been tested. Codex must validate these rather than treating documentation as a completed integration test.

## 3. Scope and exclusions

### 3.1 Required v1 scope

| ID | Capability |
|---|---|
| FR-01 | Recognize the supported Positions view and its two supported data regions. |
| FR-02 | Add a USD equivalent to eligible KRW Market Value cells. |
| FR-03 | Add a USD equivalent to the KRW Cash Holdings amount, including negative balances. |
| FR-04 | Acquire, validate, normalize, and label the selected FX source. |
| FR-05 | Show source, source date/time or unknown-age status, and fetch/observation age separately. |
| FR-06 | Update annotations after native value updates, sorting, filtering, column changes, row reuse, and view navigation. |
| FR-07 | Provide enable/disable, formatting, source configuration, refresh, and reset controls. |
| FR-08 | Handle missing data, stale rates, provider failures, and unsupported layouts without guessing. |
| FR-09 | Restrict permissions, external traffic, storage, and diagnostics as specified below. |
| FR-10 | Deliver automated tests, a synthetic demonstration page, installation instructions, and a live-validation checklist. |

The ECB/Frankfurter and manual adapters are required. The currencyapi adapter is required but activation is optional. The IBKR page-rate adapter is **conditional on verified DOM evidence**; its absence must not block the other adapters.

### 3.2 Explicitly excluded

Do not modify order tickets, transfer screens, margin information, buying power, account summaries, historical reports, tax documents, charts, or statement exports. Do not place orders, perform FX transactions, alter account settings, refresh the brokerage session, or dismiss brokerage dialogs.

Do not convert **Cost Basis**, **Average Price**, **Last**, **Daily P&L**, or **Unrealized P&L** in v1. Do not compute net worth, allocation percentages, margin headroom, or an account-wide USD total. No alerts, trading recommendations, OCR, portfolio exports, telemetry, server, cloud synchronization, or account management.

Do not scope conversion by ticker alone. SK Hynix and Samsung are motivating examples; any eligible KRW row in the supported table should work.

### 3.3 Future candidates—not implied deliverables

Per-share prices, additional currency pairs, other IBKR views, and a user-selected alternative intraday provider may be added later. True USD performance or historical cost calculations require a separately specified methodology. Translating a KRW profit at today's rate is not the same as calculating historical USD investment performance.

## 4. Main user experience

### 4.1 First use

After local installation, the user opens the extension popup on the Positions page. Setup explains the feature and the difference between reference and intraday data. The suggested selection is **Auto: IBKR page rate → ECB daily reference**. Explain the fallback before requesting permission for the Frankfurter API host.

No external FX request occurs before the user enables that external source and grants its host permission. Declining permission leaves manual mode and any verified page-rate mode available. Do not repeatedly prompt on page load.

Setup must not require an IBKR API account, gateway, API key, export, or password. A currencyapi key, when selected, is entered only in the extension-owned popup—not on the brokerage page.

### 4.2 Normal use

The user opens Positions and sees the original KRW value plus its estimated USD equivalent. Native IBKR changes drive local recalculation; FX refreshes independently update all visible supported cells. No user action is needed for each row.

A compact status indicator near the holdings heading identifies the actual rate source. Cash annotations must also have accessible source information even when the holdings heading is scrolled out of view.

### 4.3 Disabled or unsupported

The extension's own off switch removes its annotations and stops its work without reloading the page. Re-enabling performs fresh view discovery. If IBKR's structure is unsupported, the popup explains the problem and original brokerage content remains usable.

Browser-level extension removal or disabling may require a page reload to remove already-inserted elements; the README must distinguish that from the extension's own live off switch. Do not claim that unload cleanup is guaranteed.

## 5. Display and interaction requirements

### 5.1 Amount annotations

Synthetic example at **1 USD = 1,350 KRW**:

| Native value | Default supplementary line |
|---|---|
| `270,000,000.00 KRW` | `≈ US$200,000.00` |
| `135,000,000.00 KRW` | `≈ US$100,000.00` |
| `−67,500,000.00 KRW` | `≈ −US$50,000.00` |

These are test examples, not the user's holdings or a current exchange-rate quotation.

Use `US$` to avoid dollar-currency ambiguity and `≈` to communicate estimation. Preserve the mathematical sign. Use neutral, legible styling; do not make a negative cash balance look like a newly calculated loss. Match native alignment and support both light and dark themes.

**Full** formatting uses grouping and two USD decimal places. **Compact** formatting uses `k`, `M`, or `B`, with up to two decimal places and a full-value tooltip. Both formats use the same unrounded conversion. Normalize rounded negative zero to zero.

Default placement is underneath, within or adjacent to the amount cell's safe presentation container. Inline placement is optional and must not widen or overlap critical controls. Do not create or register a native IBKR table column. Do not change sorting, filtering, row heights required by a virtualized grid, or column configuration to make the extension fit. If neither placement is safe for a discovered layout, mark that layout unsupported pending a presentation fix.

### 5.2 Rate status

Illustrative status strings:

- `USD estimates · IBKR page rate · FX time unavailable`
- `USD estimates · ECB daily reference · Rate date: YYYY-MM-DD`
- `USD estimates · currencyapi · Data as of HH:MM TZ`
- `USD estimates · Manual · Entered HH:MM TZ`
- `USD estimates unavailable · FX permission required`

Actual timestamps must come from the source or user entry; example text must not appear as live data.

The tooltip or keyboard-accessible details must include the full USD estimate, normalized rate (`1 USD = … KRW`), source name, source date/time when available, last successful fetch/observation, and any stale/fallback warning. A source date without a time must remain a date; do not manufacture a midnight quote timestamp.

Always include: **“Display estimate only. Not an executable FX quote or IBKR account valuation.”** A fresh FX rate does not establish that the underlying position valuation is current.

### 5.3 Popup settings

| Setting | Default / behavior |
|---|---|
| Enabled | On after setup; otherwise setup-needed state. |
| Placement | Underneath; optional inline if safe. |
| Formatting | Full; optional compact. |
| Fields | Market Value and KRW cash enabled independently. |
| FX source | Auto, ECB daily reference, currencyapi, or Manual. |
| currencyapi configuration | User key, declared plan cadence: daily, hourly, or minute-level. Do not infer entitlement from the presence of a key. |
| Manual rate | Clearly labeled **KRW per US$1**; finite and strictly positive. |
| Refresh | Refresh FX only, not IBKR; honor provider cooldowns. |
| Clear saved data | Remove preferences, manual rate, external caches, and provider key; return to setup. |

The popup also shows detected-view status, eligible/annotated field counts, and a sanitized error code. It must never display or export the account number or a portfolio snapshot.

## 6. FX sourcing: implementation contract

### 6.1 Source-selection policy

| Mode | Exact behavior |
|---|---|
| **Auto** | Prefer an eligible, explicit IBKR page rate. Otherwise use the enabled ECB/Frankfurter source. Display the actual selected source at all times and a brief source-change notice. Never use an unconfigured external provider. |
| **ECB daily reference** | Always use that reference source. Do not switch to a broker or keyed provider automatically. |
| **currencyapi** | Use this source and its permitted cached data only. A provider error does not silently substitute a daily reference rate. Offer an explicit switch to daily mode instead. |
| **Manual** | Use the user's entered rate exclusively. No FX network requests. |

Within one view, use one selected rate record for both holdings and cash. Do not mix providers cell by cell. Changing source invalidates pending responses from the previously selected source. In Auto, an unavailable broker rate must not be substituted with a guessed rate.

### 6.2 Conditional IBKR page-rate adapter

During discovery, inspect narrowly scoped rendered information and relevant element attributes for an **explicit** USD/KRW rate. A valid candidate must establish the currencies, direction, amount unit, and applicable page context. A documented DOM attribute may be usable even when not visually rendered, but do not search application memory, framework stores, script blobs, or browser storage.

An IBKR rate without a verifiable timestamp may be used only with **“FX time unavailable”** prominently disclosed. Reading it now is not evidence that it was priced now. It must not be labeled live or intraday-current.

The adapter must remain disabled when discovery provides no reliable candidate. Do not call IBKR APIs, inspect session cookies, capture authenticated requests, hook `fetch`/XHR/WebSockets, inject into the main execution world, or create a new brokerage session to obtain a rate.

Do **not** derive the production FX rate by subtracting USD cash from total cash, or by solving an account-total equation. Such methods depend on completeness, timing, currencies, and rounding that this extension cannot establish reliably. Do not spend development time reverse-engineering them for v1.

Keep any broker-derived rate in the current page's memory only. Invalidate it when its source disappears, the view/account context changes, or a supplied timestamp makes it unusable. Never persist it across account views or browser sessions.

### 6.3 Required keyless reference adapter: Frankfurter with ECB attribution

Use Frankfurter v2 and explicitly pin the provider to ECB rather than accepting a blended feed. The documented single-pair request shape is:

`https://api.frankfurter.dev/v2/rate/USD/KRW?providers=ecb`

Documentation establishes this endpoint pattern; Codex must confirm its live payload shape and supported parameter casing before finalizing the adapter. If a documented provider-specific route is needed instead, record that change and keep the same fixed host and provider. Do not migrate to undocumented scraping. [S6]

Normalize the result to **KRW per USD**, retaining its source date. Withhold conversion if the response does not unambiguously represent the requested pair/provider or lacks a usable date. Label it **ECB daily reference via Frankfurter**. ECB reference data is normally published on working days; weekends and holidays must not be described as a feed failure merely because the date is unchanged. [S7]

No API key, brokerage data, converted amount, or position identifier belongs in this request. No alternative reference provider may be silently substituted.

### 6.4 Required optional-activation adapter: currencyapi

Use the documented request:

`https://api.currencyapi.com/v3/latest?base_currency=USD&currencies=KRW`

Authenticate with the `apikey` HTTP header, not a query parameter. Normalize `data.KRW.value` as KRW per USD and retain `meta.last_updated_at`. Validate the returned currency code and schema before use. The provider documents KRW support and plan-dependent daily, hourly, or minute-level updates. Reconfirm those details during implementation; do not bake prices or plan names into application logic. [S8–S10]

The user supplies their own key and selects the expected cadence. Label the actual source timestamp regardless of that setting. A daily plan is not an intraday feed simply because the extension requests it every minute.

No subscription purchase, account signup, embedded shared key, public proxy, or paid service setup is authorized by this PRD. The adapter can be built and tested with synthetic responses. Mark a real keyed smoke test **not run** until a key is supplied directly through the extension UI.

### 6.5 Manual adapter

Accept a positive rate expressed as **KRW per US$1**. Store the entry time separately from market data timestamps. Manual mode is never live. It provides offline operation and deterministic testing, not automatic market-rate discovery.

## 7. Freshness, caching, and failure policy

### 7.1 Keep three concepts separate

**Source time/date** describes the underlying FX data. **Fetch time** describes when the extension successfully obtained it. **Page observation time** describes when the DOM was read. None may be relabeled as another.

Maintain source validity and connection state independently. A provider can be reachable while returning old data; an offline tab can have a recently fetched, still-usable rate. Failures must not advance the source date or last-successful-fetch time.

### 7.2 Default policy values

These are product thresholds, not representations of an exchange calendar or market guarantee.

| Source / configured cadence | Automatic request cadence while needed | Age behavior |
|---|---|---|
| IBKR page, timestamp available | DOM-driven; no brokerage requests | Up to 15 minutes: timestamp shown. Over 15 minutes: **older broker rate**. Over 24 hours: unavailable in Auto. |
| IBKR page, timestamp absent | DOM-driven | **FX time unavailable** throughout; usable only while the verified source remains in the current supported view. |
| ECB daily reference | At entry if cache is over 60 minutes old; otherwise at most once per 60 minutes | Always label daily. Source-date age over 4 calendar days: **older reference**; over 7: no numeric annotation. |
| currencyapi, minute-level | At most once per 5 minutes | Source age over 15 minutes: **stale FX**; over 24 hours: no numeric annotation. |
| currencyapi, hourly | At most once per 60 minutes | Source age over 2 hours: **stale FX**; over 24 hours: no numeric annotation. |
| currencyapi, daily | At most once per 24 hours | Always label daily; same source-date warning/hide thresholds as reference mode. |
| Manual | Never | Entry age over 24 hours: reminder; over 7 days: require reconfirmation before showing numbers. |

For date-only feeds, compare calendar dates consistently; do not fabricate an observation time. For timestamped feeds, reject invalid timestamps or timestamps more than five minutes in the future relative to the local clock, with a clock/data error rather than a quote claim.

Rates inside a warning window remain visible with a local `stale` or `older reference` marker beside each affected annotation. Beyond a hide threshold, show `USD unavailable` in the supported field or omit the annotation with a visible regional status. Do not quietly continue rendering an expired number.

### 7.3 Scheduling and errors

FX requests occur only while an enabled supported view with eligible fields is visible, or after an explicit popup refresh/setup test. No overnight polling after the relevant tabs are closed. Hidden tabs pause polling and reread values/reevaluate freshness before redisplay.

Deduplicate external requests across tabs in the worker and maintain shared external-source caches. Recheck timestamps after worker restart. Do not persist page-rate data, position amounts, or row identities in those caches.

Use a bounded request timeout of 10 seconds. On transient errors, back off to 1, 5, then 15 minutes, but never exceed the source's permitted request cadence or a server `Retry-After`. One in-flight request per source is enough. Persist retry metadata needed to avoid a restart request storm.

Refresh may bypass a normal cache interval, but not rate-limit backoff. Apply a global manual-refresh cooldown of 60 seconds. For currencyapi daily mode, manual refresh must not exceed one successful request per hour; explain that refreshing does not change the provider's daily dataset.

On invalid keys or forbidden access, stop repeated retries until the key/settings are changed or the user explicitly tests again. On quota exhaustion, preserve an eligible cached value with accurate status and wait for the provider's retry window or explicit user action. An invalid response never overwrites the last valid rate.

Settings changes, disable actions, or view changes must cancel requests where possible and discard obsolete responses in every case.

## 8. Parsing and calculation rules

### 8.1 Eligible value identification

Eligibility requires **both field identity and explicit currency evidence**. Use the Market Value cell's own currency label or a locally verified equivalent attribute. For cash, use the currency row label tied to its Amount cell. Do not assume KRW from an exchange, ticker, company name, flag image, or neighboring row.

Column mapping must use verified header identifiers or normalized header text within the identified holdings table, not a fixed ordinal index. A KRW word elsewhere in the page is insufficient evidence. Recognize cash totals separately and leave `Total Cash (in USD)` unchanged.

### 8.2 Supported number grammar

Support the observed English-style formatting: grouped or ungrouped decimal numbers, surrounding whitespace, nonbreaking spaces, ASCII and Unicode minus signs, optional leading plus, and accounting parentheses. Remove known currency labels only after locating the amount's own text node/container.

Reject empty text, placeholders, loading indicators, `NaN`, infinities, malformed separators, percent values, unsupported locale grammar, scientific notation, or more than one candidate amount. Treat `0.00` as valid zero—not missing data.

Abbreviations such as `398M`, `112M`, or `1.5B` are **not** full-precision amounts. Only use a verified, unambiguous full-precision value associated with that exact cell; otherwise skip it and report `AMOUNT_ABBREVIATED`. Do not recover precision by multiplying price by quantity or parsing a broad tooltip belonging to another field.

### 8.3 Formula and rounding

Normalize every adapter to:

**R = number of KRW per 1 USD**  
**USD amount = original KRW amount ÷ R**

Require a finite positive rate and finite parsed amount. Validate pair direction using source semantics, never by trying both directions and choosing a plausible-looking answer. Treat impossible/unsafe numeric magnitudes as unavailable rather than overflowing.

Retain source precision for arithmetic and round only for display. Use a consistent tested rounding policy. Native numeric arithmetic is acceptable for this indicative display if the specified test range meets cent-level checks; otherwise use one small, locally bundled decimal implementation. This is not a financial ledger or tax-basis engine.

Never parse an extension-generated USD label as an IBKR input. A change of source amount, currency, rate record, source setting, or view generation requires recalculation.

## 9. DOM integration and dynamic-page behavior

### 9.1 Discovery gate

Before production selector work, record a short `docs/discovery.md` containing the supported route pattern, holdings and cash anchors, column-to-cell mapping, full-precision amount location, optional rate evidence, and safe annotation mount strategy. Record observations separately from hypotheses.

Inspect only the needed local elements. Do not export an authenticated HAR, full page HTML, cookies, tokens, browser profile, or framework state. Any captured snippet must be manually sanitized before entering the repository or being shared with an implementation assistant.

If Codex lacks interactive access to the logged-in page, it should build the independent components and synthetic fixtures, then request the smallest sanitized DOM snippet needed. Selectors based only on mock markup must be marked **unverified**. A screenshot can guide layout, not prove selectors.

### 9.2 Live update strategy

Use a scoped `MutationObserver` for the supported regions and a lightweight lifecycle detector for region replacement/navigation. MutationObserver is intended for observing DOM changes; this does not establish how IBKR's particular table updates. [S11]

Batch ordinary changes with a roughly 100–250 ms debounce. Ignore extension-owned nodes and attribute changes to avoid feedback loops. Do not repeatedly scan `document.body.innerText` or run a page-wide numeric replacement.

Handle direct page load, entering Positions through in-app navigation, browser back/forward, route/hash changes, table remount, column reordering, filtering, scrolling/virtualization, and account-view replacement. Use isolated-world observation and standard browser events; do not patch the site's History API or application internals.

A bounded, low-cost visible-tab watchdog is acceptable for shell replacement detection if needed. It must inspect anchors, not all account text, and must not drive a constant worker keepalive or FX polling loop.

### 9.3 Annotation lifecycle

Associate each annotation with its current live cell and input fingerprint, not just a row number or ticker. Revalidate before updating because an existing row element may be reused. Remove obsolete annotations when a row becomes USD, a value disappears, a column is hidden, or a node is detached.

Assign a view-generation token to async work. Discard results for an old generation even when a recycled DOM element is still connected. Observe account-selector/view replacement structurally if necessary without reading or saving account identifiers.

Prefer inserting a namespaced presentation node without replacing native children or setting `innerHTML`. If the framework repeatedly removes it, first verify a safe mounting strategy; do not fight the framework with a high-frequency reinsertion loop.

The extension must not intercept clicks on native rows, change keyboard behavior, modify editable elements, or alter native sorting/filtering/export behavior. Verify that added text does not pollute DOM-based sort or copy behavior; use a safer presentation boundary when necessary. Never install a global clipboard override as a workaround.

When disabled, leaving the supported view, or losing valid context, disconnect regional observers, clear sensitive in-memory references, remove owned nodes, and stop relevant timers. Minimal lifecycle detection may remain to support later navigation; it must not parse account values while disabled.

## 10. Architecture and data boundaries

### 10.1 Suggested implementation stack

Use TypeScript with strict checking, vanilla DOM/CSS, a small bundler such as esbuild, unit tests such as Vitest, and Playwright for browser fixtures. These are implementation preferences, not a reason to add a UI framework or server. Pin compatible dependency versions and document the required Node version after checking the current tool requirements. [S12–S14]

No runtime network dependency is allowed except approved FX requests. Bundle all scripts and assets. Prefer zero production dependencies; justify any added dependency. Keep site selectors separate from numeric and provider logic so a layout repair does not require rewriting the extension.

### 10.2 Components

| Component | Responsibility | May receive portfolio values? |
|---|---|---|
| Content script / site adapter | Identify fields, parse visible amounts, calculate, annotate, manage view lifecycle. | Yes, transiently in that tab only. |
| FX service worker | Fetch approved rate data, validate adapters, cache public rates, manage provider settings and errors. | **No.** It receives rate requests, not position amounts or account IDs. |
| Popup | Settings, source selection, API-key entry, sanitized status. | No portfolio snapshot; counts only. |
| Pure calculation/formatting module | Deterministic normalization and display. | Called locally by the content script. |
| Test fixtures | Synthetic pages and synthetic FX responses. | Synthetic data only. |

The data flow is: **public rate → worker → content script; native KRW amount → local calculation → page annotation**. Holdings never need to travel in the opposite direction.

### 10.3 Internal records

A normalized rate record needs the source identifier, base `USD`, quote `KRW`, rate, source date or timestamp, timestamp precision, fetch/observation time, quality classification, and cache/failure state. Include a schema version for persisted external rate records.

A transient field record needs a DOM reference, region/field type, explicit currency evidence, parsed amount, input fingerprint, and view generation. Do not serialize these records to storage, the worker, or diagnostics.

Messages must have explicit types and validated payloads. The worker constructs allowed URLs itself. No `fetch arbitrary URL`, generic method invocation, or page-supplied request headers. Only extension-owned popup messages may change provider credentials or settings; content-script messages must never retrieve a key.

## 11. Permissions, privacy, and security

### 11.1 Minimal permissions

| Permission / access | Rule |
|---|---|
| Static content-script match | Start with `https://portal.interactivebrokers.com/*`, top frame only, isolated world, `document_idle`. Narrow known routes where reliable without breaking in-app entry. |
| Runtime activation | Only on the verified Positions view and eligible data regions. The origin match alone does not authorize arbitrary DOM inspection. |
| `storage` | Required for local preferences, external rate cache, and optional provider-key handling. |
| FX host access | Use optional host permissions for `https://api.frankfurter.dev/*` and `https://api.currencyapi.com/*`, requested when that source is enabled. |
| Other IBKR hosts / frames | Not included by default. Add only after concrete discovery and explicit permission review. |

Do not request `<all_urls>`, broad IBKR subdomains, cookies, debugger, webRequest, native messaging, clipboard, downloads, history, or persistent all-tab read access. Do not add `scripting`, `activeTab`, `tabs`, `webNavigation`, or `alarms` merely for convenience. Any genuine additional requirement needs a documented rationale before expanding scope.

Host permission is not an endpoint-level security boundary: Chrome ignores paths for host permissions. Restrict requests to fixed allowlisted endpoints in code as well. [S2]

### 11.2 External traffic

Use HTTPS. Omit cookies/credentials, suppress brokerage referrer information, send no identifiers or financial values, and disallow redirects to unapproved endpoints. Never embed an IBKR URL or account context in an FX request. A currencyapi request includes its provider key in the approved header only.

Set a small response-size bound appropriate to one FX pair and validate JSON before use. Render remote strings as text, never executable HTML. No remote JavaScript, remote configuration that changes executable behavior, analytics, crash uploads, or advertising. Manifest V3 documentation distinguishes remote data from remotely hosted executable code. [S15]

The provider can necessarily receive ordinary network metadata such as the connecting IP and request timing. Do not describe an external API request as anonymous or claim that no metadata leaves the computer. The privacy promise is **no portfolio or brokerage authentication data is sent by this extension**.

### 11.3 Storage and keys

Store settings and public external-rate caches locally, not in browser sync. No account identifiers, positions, raw DOM, balances, transaction history, or authentication material may be stored.

Restrict extension storage containing credentials to trusted extension contexts using the documented storage access controls. The content script receives only a sanitized settings/rate subset through validated messages. Chrome's storage documentation distinguishes local/session storage and their content-script exposure. [S4]

For a currencyapi key, default to session-only storage. Offer **Remember on this device** only with a clear explanation that ordinary extension storage is not a credential vault or protection against local malware/profile access. Do not claim encryption at rest provided by the extension. Never put keys in source, logs, tests, URLs, screenshots, or returned error text. Provide an explicit delete-key control.

### 11.4 Honest limits of “display-only”

The extension has no account-action features, but Chrome does not provide a special DOM read-only permission for this design. Content scripts can modify page DOM, and the host page can observe inserted DOM. Isolation is not a financial security boundary. Reviewable code, limited access, local calculations, and strict testing are therefore mandatory. [S1]

The product is independent of IBKR and must not imply broker endorsement or accuracy guarantees. Evaluate applicable terms and data-provider attribution requirements before any distribution beyond personal use; public publication is not authorized here.

## 12. Diagnostics, accessibility, and performance

### 12.1 Diagnostics

Use a small allowlist of error codes, such as `UNSUPPORTED_VIEW`, `MARKET_VALUE_COLUMN_MISSING`, `CURRENCY_AMBIGUOUS`, `AMOUNT_ABBREVIATED`, `RATE_UNAVAILABLE`, `RATE_STALE`, `RATE_PERMISSION_REQUIRED`, `PROVIDER_AUTH_FAILED`, and `PROVIDER_RATE_LIMITED`.

Show short explanations and recovery actions in the popup. Local diagnostics may include extension version, adapter name, field counts, generic HTTP status, and timings. They may not include raw responses, account text, balances, symbols paired with amounts, URLs containing secrets, or HTML. Debug logging is off by default and remains sanitized when enabled.

### 12.2 Accessibility

Use readable contrast, browser zoom compatibility, accessible labels, and keyboard-accessible FX details. Avoid announcing every quote update through an ARIA live region. Do not rely solely on color for stale/error states. Preserve the original table's accessibility semantics and tab order.

Test at 100%, 125%, and 150% zoom and at desktop widths around 1280, 1440, and 1920 pixels. These are test targets, not guaranteed compatibility with every possible IBKR layout.

### 12.3 Performance acceptance targets

With a cached rate, initial annotations should appear within one second after supported regions become stable. Ordinary visible value changes should update within one second after the native value settles. Network latency is measured separately.

Use a synthetic 200-row fixture to check for duplicate nodes, observer loops, growing detached-node retention, and avoidable long tasks. Target no extension-attributable continuous scanning and no repeated full-table rewrite for a single-cell update. Report measured browser/hardware context rather than inventing performance results.

## 13. Test plan and acceptance criteria

### 13.1 Synthetic golden fixture

Use **1 USD = 1,350 KRW** and these fictional values:

| Field | Input | Expected full USD display |
|---|---:|---|
| KRW equity A, market value | 270,000,000.00 | `≈ US$200,000.00` |
| KRW equity B, market value | 135,000,000.00 | `≈ US$100,000.00` |
| KRW cash | −67,500,000.00 | `≈ −US$50,000.00` |
| KRW amount | 1,350.00 | `≈ US$1.00` |
| KRW amount | 0.00 | `≈ US$0.00` |
| Already-USD position | 500.00 USD | No annotation |
| Share quantity | 200 | No annotation |
| Abbreviated KRW amount with no verified full value | 270M | No numeric conversion; diagnostic only |

Changing the rate to **1 USD = 1,500 KRW** must change the first market-value annotation to **US$180,000.00** without changing its original KRW text.

### 13.2 Acceptance matrix

| Test | Requirement | Pass condition |
|---|---|---|
| AT-01 | FR-01 | Direct load and in-app entry activate only the supported view; login, orders, transfers, and unrelated pages are untouched. |
| AT-02 | FR-02/03 | Golden fixture annotations exactly match expected values; original native text remains unchanged. |
| AT-03 | FR-02/03 | Both Unicode minus and accounting-parentheses cash values convert with the correct sign. |
| AT-04 | FR-02/03 | USD rows, cash totals in USD, quantities, percentages, and out-of-scope monetary columns remain untouched. |
| AT-05 | FR-02/08 | Unsupported locale, invalid number, unknown currency, missing value, or ambiguous amount produces no guessed conversion. |
| AT-06 | FR-02/08 | Abbreviated amounts are skipped unless an exact-cell full-precision source is verified and tested. |
| AT-07 | FR-04 | Correct normalization is tested for each source; reversed/mismatched pair metadata, zero, infinity, and malformed data are rejected. |
| AT-08 | FR-04 | Auto chooses verified page data when available and the explicitly enabled daily source otherwise; actual source is visible. |
| AT-09 | FR-04/08 | No DOM evidence means broker-rate adapter is unavailable; no hidden API or inferred-account-total fallback appears. |
| AT-10 | FR-04/05 | Daily or manual data is never labeled live. A fresh download of old data retains its original source age. |
| AT-11 | FR-05/08 | Warning and hide thresholds work at boundary times, including weekends, date-only data, and invalid/future timestamps. |
| AT-12 | FR-06 | Native amount change and rate change both recalculate all affected visible fields without duplicates. |
| AT-13 | FR-06 | Sorting, column reorder, hide/show, filtering, and row virtualization preserve correct cell association. |
| AT-14 | FR-06 | A reused KRW row becoming USD loses its annotation immediately; detached nodes do not retain active work. |
| AT-15 | FR-06 | Rapid navigation/account-view replacement discards obsolete async responses and page-derived rates. |
| AT-16 | FR-07 | Own off switch removes all annotations and stops polling; re-enable performs fresh discovery. |
| AT-17 | FR-07 | Full/compact and safe placement choices render correctly in light/dark themes and tested zoom levels. |
| AT-18 | FR-07/09 | Setup, permission decline/revocation, reset, and key deletion work without repeated unsolicited prompts. |
| AT-19 | FR-08 | Timeout, offline mode, HTTP error, invalid JSON, oversized payload, and quota errors preserve accurate status and valid cache rules. |
| AT-20 | FR-08 | currencyapi failure does not silently switch to daily; switching sources invalidates the old request. |
| AT-21 | FR-04/09 | Multiple tabs share external requests/caches; hidden or closed views do not keep polling. |
| AT-22 | FR-04 | Worker restart retains essential external cache/backoff state without depending on persistent global variables. |
| AT-23 | FR-09 | Only approved FX hosts/paths are contacted by extension code; requests contain no portfolio/account information. |
| AT-24 | FR-09 | No credential appears in page DOM, content-script messages, logs, URLs, fixtures, or exported diagnostics. |
| AT-25 | FR-09 | Content-script requests cannot fetch arbitrary URLs, obtain keys, or modify privileged configuration. |
| AT-26 | FR-06/09 | Native sort, keyboard navigation, row actions, and copy/export behavior are not polluted by annotations. Test actions on fixtures only. |
| AT-27 | FR-09 | Production manifest has no test/local hosts, unnecessary permissions, remote code, or enabled telemetry. |
| AT-28 | FR-10 | Build/typecheck/unit/browser tests pass; measured performance and remaining manual checks are recorded truthfully. |

All P0 correctness/security failures block use on the live brokerage page. Do not mark tests passing solely because screenshots look plausible.

### 13.3 Browser-test strategy

Use isolated synthetic fixtures and mocked FX responses. Playwright's current documentation recommends its bundled Chromium and a persistent context for extension tests; do not assume branded Chrome can be launched with the same extension-loading flags. Perform separate manual Chrome and Brave smoke checks. [S12]

Keep any fixture-only host permissions in a separate test manifest/build. Production must not include localhost access, mock-rate switches, broad network permissions, or a fixture bypass. Automated tests must never use the user's real browser profile, credentials, or brokerage account. Disable network or allow only mocked endpoints in fixture runs.

For live validation, the user logs in manually. Verify values and navigation only; do not test trade or transfer actions on a live account. Report which parts were automated, manually verified, or not run.

## 14. Implementation sequence and decision gates

| Stage | Work | Exit condition |
|---|---|---|
| 0. Discovery and repository plan | Read this PRD, inspect repository state, document available DOM evidence, confirm public provider contracts, and propose file structure. | Concrete known/unknown list; no invented selectors or brokerage access. |
| 1. Pure logic and fixtures | Implement parsing, normalization, formatting, source records, timestamps, and synthetic pages/tests. | Golden values and failure cases pass independently of IBKR. |
| 2. Site adapter and annotations | Implement scoped detection, mounting, lifecycle, row reuse handling, settings, and manual mode. | Fixture DOM tests pass; production selector evidence documented or explicitly pending. |
| 3. External FX adapters | Add Frankfurter/ECB, optional currencyapi, cache/backoff, permission flows, and protected key handling. | Provider-contract tests pass; public endpoint smoke test recorded; keyed live test may remain explicitly unrun. |
| 4. Conditional broker rate | Implement only the explicit DOM rate proven during discovery. Otherwise keep unavailable. | Evidence and tests support it, or docs clearly record it as unavailable. |
| 5. Hardening and handoff | Audit permissions/traffic/storage, run tests, perform user-assisted live checks, package deliverables. | Definition of done met, or remaining blockers plainly identified. |

**Do not let optional broker-rate discovery turn into indefinite reverse engineering.** After a focused DOM inspection, either document a reliable source or proceed without it. Do not broaden access to make that feature work.

**Do not block independent work on missing live access.** Build and validate the reusable components, then ask for the precise sanitized snippet required. Lack of a live keyed provider test is not a reason to fabricate a successful test.

## 15. Deliverables and definition of done

Codex should deliver a source repository with an unpacked production build, dependency lockfile, synthetic demo, unit and browser tests, and these documents: `README.md`, `PRIVACY.md`, `docs/discovery.md`, `docs/testing.md`, and a short change log.

The README must cover prerequisites, reproducible build/test commands, loading and updating the unpacked extension in Chrome, a Brave compatibility note, source-mode setup, cadence limitations, permissions, key removal, disabling/uninstalling, known unsupported layouts, and how to report a sanitized failure.

The final implementation report must identify the actual verified route/layout, whether an explicit IBKR page rate was found, which source is active by default, how external permission works, all tests executed and results, unrun manual/keyed tests, and any deviation from this PRD.

**Done** means the supported live Positions view has been user-validated, core calculations and lifecycle tests pass, original brokerage content is preserved, privacy/network checks pass, and source freshness is honestly presented. A fixture-only build is a useful intermediate deliverable but must be labeled **live-site validation pending** rather than production-ready.

No GitHub publishing, store submission, provider signup, paid subscription, account changes, or real financial transactions are authorized by this document.

## 16. Outstanding discovery questions and predetermined responses

| Question | Required response |
|---|---|
| Is there an explicit usable IBKR page rate? | Verify locally. If absent or ambiguous, disable that adapter and use an enabled external/manual mode. |
| Does the page expose native amount/currency attributes? | Use only exact-cell attributes with verified semantics; otherwise use supported rendered text. |
| Does the table safely permit an inline/underneath mount? | Verify no framework, sort, or virtualization regression. If unsafe, solve presentation within scope or flag unsupported; do not replace the grid. |
| Does the page use another origin or frame? | Document evidence and request permission-scope review before expansion. |
| Is intraday FX worth a provider subscription? | Leave the choice to the user. Do not purchase anything. Ship the clearly labeled keyless/manual modes and optional keyed adapter. |
| Are selectors untestable without a logged-in session? | Deliver fixtures and independent work; request minimal sanitized evidence and keep live validation pending. |

## 17. Reference sources

The requirements are product decisions. Sources below support platform/provider facts; they do not establish that an IBKR DOM selector or live integration has been tested. Documentation and service offerings may change; recheck relevant contracts at implementation time.

**[S1] Chrome: Content scripts** — DOM capabilities, isolated worlds, injection scope.  
`https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts`

**[S2] Chrome: Cross-origin network requests** — extension-origin requests, host permissions, endpoint and message-handler security.  
`https://developer.chrome.com/docs/extensions/develop/concepts/network-requests`

**[S3] Chrome: Extension service worker lifecycle** — suspension and state persistence.  
`https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle`

**[S4] Chrome: Storage API** — local/session storage, access levels, trusted contexts.  
`https://developer.chrome.com/docs/extensions/reference/api/storage`

**[S5] IBKR: Trading Web API documentation** — documented currency ledger and authentication/session distinctions; not evidence of page DOM access.  
`https://www.interactivebrokers.com/campus/ibkr-api-page/web-api-trading/`

**[S6] Frankfurter v2 documentation** — pair endpoints, provider filtering, daily data and keyless access.  
`https://frankfurter.dev/`

**[S7] ECB: Euro foreign exchange reference rates** — publication cadence and informational purpose.  
`https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html`

**[S8] currencyapi: Latest exchange rates** — USD base, currency filter, value and timestamp fields, cadence dependence.  
`https://currencyapi.com/docs/latest/`

**[S9] currencyapi: Authentication** — API-key header and query-string exposure warning.  
`https://currencyapi.com/docs/authentication/`

**[S10] currencyapi: Currency list and plan documentation** — KRW support and available update-frequency categories.  
`https://currencyapi.com/docs/currency-list/`  
`https://currencyapi.com/pricing/`

**[S11] MDN: MutationObserver** — DOM mutation observation.  
`https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver`

**[S12] Playwright: Chrome extensions** — persistent Chromium contexts and extension testing.  
`https://playwright.dev/docs/chrome-extensions`

**[S13] Vitest: Getting started** — test tooling and current runtime requirements.  
`https://vitest.dev/guide/`

**[S14] esbuild: Getting started** — proposed build tooling.  
`https://esbuild.github.io/getting-started/`

**[S15] Chrome: Remotely hosted code** — local executable code versus externally retrieved data.  
`https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code`
