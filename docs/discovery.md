# Discovery and evidence

Status: **live-site-validation-pending**. Production selectors are grounded in the user's local September 30 capture. A saved page establishes structure, not current live interaction, virtualization, or account-switch behavior.

## Inputs and privacy

The PRD and handoff establish scope. During implementation the user supplied a local MHTML and screenshot under `=reference_material`. That entire directory is excluded from Git. The archive was parsed offline to inspect only the target headings, table/header structure, amount containers, and currency labels. The saved page was not opened against an authenticated session and no capture scripts or authenticated assets were executed. No raw capture, identifiers, instrument names, real balances, or original financial values were copied into fixtures, logs, documentation, or build output.

`tests/fixtures/captured-positions.html` is manually constructed from the observed structural pattern with entirely fictional values and synthetic CSS. It does not reproduce the user's page/account. `tests/fixtures/site-adapter.ts` remains a separate invented demo contract and is excluded from the production dependency graph.

## Observed structure

| Item | Captured evidence and implementation |
| --- | --- |
| Origin and route | `https://portal.interactivebrokers.com`, pathname `/portal/`, hash `#/dashboard/positions`. Query values are unnecessary and ignored. Other routes do not trigger DOM discovery. |
| View scope | A single `.ptf-models` container contains both supported regions. Replacement of this context or either table invalidates the old generation. |
| Holdings | `.ptf-positions`, a `Your Holdings` heading, and one `table._tb[role="grid"]` inside a `._tbw` wrapper. |
| Header mapping | `thead._tbh` contains one row of `th` cells, with text under `._thc`. Data headers expose `aria-colindex`; body rows contain corresponding direct `td` cells. The target column is located by normalized header text, its current physical index is checked against `aria-colindex`, and body cell counts/spans must match. There is no fixed Market Value ordinal. Decorative `div` children are not counted as cells. |
| Market Value input | The target `td` has one native `span` wrapper containing a `div > span` for the full rendered number and a sibling `div.fs8.fg70` for that same cell's explicit currency label. Both association and exact shape are required. Extension-owned nodes are excluded. |
| Cash | An exact `Cash Holdings` h3, inside `.ib-row.cb` / `.ib-col`, precedes a separate `table._tb[role="grid"]`. Currency and Amount are found from their own headers. The currency cell contains a flag SVG followed by the currency label. The Amount cell contains a single native span. Only exact KRW row evidence is eligible. |
| Cash total | The account-wide `Total Cash (in USD)` presentation is outside the eligible cash rows and is not annotated. |
| Precision | Full rendered English-format numbers are available in the captured target fields. No additional full-precision attribute was established. Abbreviations remain unavailable. |
| Broker rate | No explicit usable USD/KRW rate was established by the narrowly scoped inspection. The broker-rate adapter remains unavailable. No equation from totals, brokerage API, request interception, storage, or framework state is used. |

No instrument IDs, symbol attributes, or account identifiers are used to establish eligibility.

## Presentation decision

The captured holdings already show a number and a smaller currency line; cash rows have a single amount line. Adding a flow line could change row heights, so production uses namespaced shadow presentations positioned over **measured unused space inside the same cell**. Native styles and children are preserved.

For holdings, the first candidate is the unused area beside the existing currency label beneath the number. For cash, a second line is used only if its full height fits; otherwise an inline gap beside the amount is used. The user's placement choice sets preference, not permission to overlap. A fit must remain inside the cell and viewport, clear of native amount/currency text and controls. Hit-testing respects clipping, sticky elements, and covering UI. A transformed ancestor that invalidates fixed-position coordinates causes the annotation to be withheld. If no safe position exists, the region reports `UNSUPPORTED_VIEW`.

Scroll and resize events reposition presentations without reading new financial text; regional mutations use 150 ms batching. A one-second visible watchdog inspects route/anchors for replacement. Ordinary numeric mutations revisit only affected rows and preserve unchanged presentations. When disabled, hidden, or outside the route, observers/timers and field references are cleared. Framework removal of an active presentation stops that view rather than causing repeated reinsertion.

Captured-structure tests establish that this strategy preserves fixture row heights and native text/copy, follows header changes, handles currency reuse and malformed/abbreviated input, leaves native handlers usable, and hides numbers when space is insufficient. They do **not** establish actual IBKR framework compatibility.

## Public provider contracts

- [Frankfurter v2](https://frankfurter.dev/): fixed `https://api.frankfurter.dev/v2/rate/USD/KRW?providers=ecb`. Live HTTP 200 payload includes `date`, `base`, `quote`, and `rate`. Provider attribution comes from the documented fixed ECB filter; conflicting provider metadata is rejected. Date-only precision is preserved.
- [currencyapi latest](https://currencyapi.com/docs/latest/) and [authentication](https://currencyapi.com/docs/authentication/): fixed USD-base/KRW query, header authentication, `data.KRW.code/value`, and `meta.last_updated_at`. [Status codes](https://currencyapi.com/docs/status-codes/) document auth/forbidden access and quota reset information. Only the reset time is used from bounded quota errors; remote messages/actions are never rendered or followed. Real keyed test remains unrun.
- [Chrome storage](https://developer.chrome.com/docs/extensions/reference/api/storage): both local and session areas are restricted to trusted contexts before use.
- [Playwright extensions](https://playwright.dev/docs/chrome-extensions): bundled Chromium and fresh persistent profiles; no user profile or brokerage login is used.

## Remaining user-assisted validation

Load `dist/production`, choose Manual initially or explicitly enable ECB reference, and inspect the actual Positions view. Verify both target fields, safe placement, row heights, native sorting/filtering/copy/export, keyboard behavior, zoom/themes, scrolling/virtualization, account/view replacement, and disable/re-enable. The user controls login and performs only display/navigation checks. Never test orders, transfers, or account changes.

If a layout differs, supply only the affected manually sanitized header/cell excerpt, generic error code, and fictional reproduction steps. No additional page dump is needed. Replace financial values and identifiers with fictional values; exclude scripts, cookies, tokens, keys, HARs, profile files, and application storage.
