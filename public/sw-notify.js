/*
 * Imported into the generated service worker (vite.config.ts → workbox.importScripts).
 * A device notification raised by the app (useAppStore deviceNotifyIfHidden) carries
 * data.route; clicking it focuses an open SAMANVAY window on that route, or opens one.
 * Nothing here receives push messages — notifications are only raised by the open app.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const route = (event.notification.data && event.notification.data.route) || '/';
  const target = new URL(route, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin && 'focus' in w) {
          return w.focus().then((c) => (c && 'navigate' in c ? c.navigate(target) : c));
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
    }),
  );
});
