# Codex handoff: IBKR USD Lens

Place `IBKR_USD_Lens_PRD.md` in the project directory, then give Codex the following instruction.

---

Read `IBKR_USD_Lens_PRD.md` completely and implement the private Chrome extension it specifies. Treat its scope, privacy boundaries, acceptance tests, and no-account-action rules as requirements.

Start by examining the repository, identifying available evidence about the real IBKR Positions DOM, and writing a short staged implementation plan. State the decisions that are established by the PRD and the site details that remain unverified. Do not guess production selectors from the screenshot or treat mock markup as live-site evidence.

Use the specified staged approach: independently testable parsing/conversion logic and synthetic fixtures first; scoped annotation and lifecycle behavior next; then public FX adapters, permission flows, protected settings, and hardening. Keep dependencies and permissions minimal, and keep selectors separate from provider and numeric logic.

The primary fields are KRW Market Value and KRW Cash Holdings Amount. Preserve native brokerage values. Do not implement actual FX conversion, order actions, account changes, P&L translation, margin calculations, or brokerage API integration.

For FX, implement the clearly labeled ECB/Frankfurter reference mode, manual mode, and optional user-key currencyapi adapter. Auto may prefer an explicit IBKR page rate only if a narrow local DOM inspection proves it exists and establishes its meaning. Otherwise leave that adapter unavailable. Never infer a rate from account totals, intercept authenticated traffic, extract session tokens, or reverse-engineer the application's internal state.

A daily reference rate is not a live feed. Keep source date/time, fetch time, and observation time distinct, and implement the PRD's cache, stale-data, source-change, and failure behavior.

Do not request my IBKR credentials, API credentials, full browser profile, authenticated HAR, or unredacted page dump. When a site detail blocks progress, complete independent work first and ask for the smallest sanitized DOM snippet that resolves the specific issue. A third-party FX key must be entered by me directly into the extension UI, not pasted into chat, source, or logs.

Use synthetic data for automated tests and do not automate against my real brokerage account. No paid subscriptions, registrations, publishing, or account actions are authorized. Live validation is user-assisted and limited to display behavior.

Deliver the production unpacked build, source and lockfile, synthetic demo, tests, README, privacy documentation, discovery notes, and test report. In the final report, distinguish tests actually run from tests not run, and label the build live-site-validation-pending until the real Positions view has been verified. Report deviations and blockers explicitly rather than claiming completion based only on fixture tests.
