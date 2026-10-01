# Privacy and data boundaries

IBKR USD Lens 0.1.2 is a private, locally installed display extension. Its production adapter supports a layout established from a local user-provided capture. The user confirmed live display in Manual and ECB modes after the 0.1.1 correction. Other routes/layouts fail closed.

## Information handled locally

The content script reads only supported KRW Market Value and cash Amount cells and their explicit currency evidence on the captured Positions route. Amounts and DOM references stay transiently in that tab's memory. They are never sent to the worker, popup, providers, logs, or persistent storage. Field counts and allowlisted error codes are the only view diagnostics returned to the popup. Development fixtures use fictional data exclusively. The supplied raw MHTML and screenshot stay in the ignored `=reference_material` directory and are not part of source or build artifacts.

Preferences, manual rate and confirmation time, public external FX records, cooldowns, and retry metadata use `chrome.storage.local`. A user-supplied currencyapi key defaults to `chrome.storage.session`; remembering it is an explicit choice. Both storage areas are restricted to `TRUSTED_CONTEXTS` before use. There is no browser sync storage. Keys are returned to neither content scripts nor popup state responses. A popup can replace/delete a key but cannot read it back through the worker API.

Ordinary extension storage is not an encrypted credential vault and does not protect against local malware or someone with profile access. Session storage is cleared by browser restart and extension disable/reload/update. Clear saved data removes preferences, keys, rates, and retry state; Chrome-granted host permissions are managed separately.

## External requests

No external source is enabled by default. Once the user enables a source and grants permission, the worker may call only:

- `https://api.frankfurter.dev/v2/rate/USD/KRW?providers=ecb`
- `https://api.currencyapi.com/v3/latest?base_currency=USD&currencies=KRW`

The latter uses the user's key in the `apikey` header. Requests omit cookies/credentials, suppress referrers, disallow redirects, and contain no positions, balances, account IDs, symbols, brokerage URLs, or brokerage authentication data. Providers still receive ordinary network metadata such as IP address, request timing, and browser HTTP metadata. These requests are not described as anonymous.

Normal external requests require visible supported eligible fields. The popup's explicit FX test can also make a request. External rates/retry state are shared across tabs. There are no alarms, continuous worker keepalive messages, overnight polling jobs, or background requests after all consumers stop. An already completed public request can remain cached after a view closes.

## Access and presentation limits

Only the exact extension-owned popup may change settings or credentials. Top-frame content messages are limited to sanitized settings, rate requests, and request release. They cannot supply URLs, headers, keys, or portfolio amounts. Extension messages from other origins or frames are rejected. No externally connectable page API is declared.

The content script is isolated, but Chrome has no special DOM read-only permission here. A host page can observe inserted presentation nodes and may inspect visible annotations. Closed shadow roots protect ordinary native text extraction from contamination; they are not a financial security boundary or secrecy guarantee.

The extension does not access cookies, authenticated network traffic, framework/application state, browser profile data, IBKR APIs, transactions, or account settings. It does not patch fetch/XHR/WebSockets/History, inject into the main world, install clipboard overrides, or modify native value text. There is no telemetry, analytics, advertising, crash upload, remote executable code, or hosted extension backend. Local diagnostics contain only fixed error codes and counts. Debug logging is absent from production source.

## Removal and reporting

Use the popup's off switch to remove annotations immediately. Removing or disabling the extension through Chrome may require reloading an already open page to clear inserted DOM. Uninstallation removes extension storage. Revoke optional host permissions through the popup or browser settings.

Use only manually sanitized, narrowly scoped fictional snippets for support. Never provide credentials, real portfolio data, authenticated HARs, full page HTML, browser profiles, or storage exports. Review applicable provider and IBKR terms before any distribution beyond personal use.
