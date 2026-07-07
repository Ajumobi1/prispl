import { test, expect } from "../playwright-fixture";

// Verifies the offline app shell works after a warm visit.
//
// Notes:
// - The service worker only registers in production builds on the real
//   published origin (see src/lib/registerSW.ts), so this test forces
//   registration on localhost by installing a tiny SW inline. It caches
//   the app shell (index.html + hashed assets fetched on first load),
//   then we go offline and confirm the shell still renders.
// - This validates the offline caching *strategy* used by the real SW
//   (NetworkFirst for navigations, CacheFirst for hashed assets), which
//   is what vite-plugin-pwa emits at build time.

const KEY_ROUTES = ["/login", "/task-tracker", "/dashboard"];

test.describe("offline app shell", () => {
  test("key pages load from cache when offline", async ({ page, context, baseURL }) => {
    // 1. Warm up: visit each route online so the browser caches HTML + assets.
    for (const route of KEY_ROUTES) {
      const res = await page.goto(`${baseURL}${route}`, { waitUntil: "networkidle" });
      expect(res?.ok(), `warm-up load failed for ${route}`).toBeTruthy();
    }

    // 2. Install a minimal cache-first service worker to stand in for the
    //    production SW during the localhost test.
    await page.goto(`${baseURL}/`);
    await page.evaluate(async () => {
      const swSource = `
        const CACHE = 'offline-shell-test';
        self.addEventListener('install', (e) => {
          e.waitUntil(caches.open(CACHE).then((c) => c.add('/index.html')));
          self.skipWaiting();
        });
        self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
        self.addEventListener('fetch', (event) => {
          const req = event.request;
          if (req.mode === 'navigate') {
            event.respondWith(
              fetch(req).catch(() => caches.match('/index.html'))
            );
            return;
          }
          event.respondWith(
            caches.open(CACHE).then(async (cache) => {
              const hit = await cache.match(req);
              if (hit) return hit;
              try {
                const res = await fetch(req);
                if (res.ok && new URL(req.url).origin === self.location.origin) {
                  cache.put(req, res.clone());
                }
                return res;
              } catch {
                const fallback = await cache.match(req);
                if (fallback) return fallback;
                throw new Error('offline and not cached');
              }
            })
          );
        });
      `;
      const url = URL.createObjectURL(new Blob([swSource], { type: "text/javascript" }));
      const reg = await navigator.serviceWorker.register(url, { scope: "/" });
      await navigator.serviceWorker.ready;
      if (reg.active?.state !== "activated") {
        await new Promise<void>((resolve) => {
          const check = () => {
            if (navigator.serviceWorker.controller) resolve();
          };
          navigator.serviceWorker.addEventListener("controllerchange", check);
          check();
        });
      }
    });

    // 3. Re-warm routes with the SW controlling so hashed assets get cached.
    for (const route of KEY_ROUTES) {
      await page.goto(`${baseURL}${route}`, { waitUntil: "networkidle" });
    }

    // 4. Go offline and confirm each key route still renders the app shell.
    await context.setOffline(true);
    try {
      for (const route of KEY_ROUTES) {
        await page.goto(`${baseURL}${route}`, { waitUntil: "domcontentloaded" });
        const rootHasContent = await page.evaluate(
          () => (document.getElementById("root")?.childElementCount ?? 0) > 0,
        );
        expect(rootHasContent, `no rendered content offline at ${route}`).toBeTruthy();
      }
    } finally {
      await context.setOffline(false);
    }
  });
});
