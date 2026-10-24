# Mini App

The live Telegram Mini App is **`legacy/miniapp/index.html`**.

This package is the future TypeScript entry. It currently only records where
the production UI lives and how garage maps to Organization.

Do not port the HTML in one shot. Replace `api()` calls with REST from
`@rentmate/api` screen by screen.
