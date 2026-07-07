# Offline QA — Installed App Shell

Manual verification that the installed PWA loads key pages without a network
connection. Complements the automated Playwright check in
`src/test/offline-shell.spec.ts`.

## Prerequisites

- Test against the **published** app (`https://prsunitplatform.lovable.app`).
  The service worker intentionally does not register in dev or preview.
- Use a real browser profile (Chrome, Edge, Safari, or Android Chrome).

## Automated check

```bash
bunx playwright test src/test/offline-shell.spec.ts
```

The test warms the app shell online, installs a cache-first worker, goes
offline via Playwright's `context.setOffline(true)`, and confirms `/login`,
`/task-tracker`, and `/dashboard` still render.

## Manual desktop QA (Chrome / Edge)

1. Open the published URL and sign in.
2. Visit each key page once while online:
   - `/login`
   - `/task-tracker`
   - `/dashboard`
3. Open DevTools → **Application → Service Workers** and confirm `sw.js`
   status is **activated and running**.
4. In **Application → Cache Storage**, confirm entries under
   `html-navigations`, `static-assets`, and `images`.
5. Install the app (address bar install icon or ⋮ → *Install PR&S Platform*).
6. In DevTools → **Network**, tick **Offline**.
7. Reload each key page. Expected: the page renders (may show cached data,
   no full-page error). Live data fetches will fail gracefully — that's
   expected; only the app shell is offline-capable.
8. Untick **Offline** and confirm data reloads normally.

## Manual mobile QA (iOS / Android)

1. Open the published URL in Safari (iOS) or Chrome (Android) and sign in.
2. Visit `/login`, `/task-tracker`, `/dashboard` once.
3. Add to Home Screen / Install app.
4. Enable **Airplane Mode**.
5. Launch the installed app from the home-screen icon.
6. Navigate to each key page. Expected: shell renders offline.
7. Disable Airplane Mode; confirm data refreshes.

## Reset if the SW gets stuck

Append `?sw=off` to any URL (e.g. `https://prsunitplatform.lovable.app/?sw=off`).
The guarded registration in `src/lib/registerSW.ts` will unregister `/sw.js`
on that load.
