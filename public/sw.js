// La Viola Petshop - avisos de nova entrega (push).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// O push chega sem texto; o aviso é fixo. O Android toca o som padrão de notificação do aparelho.
self.addEventListener('push', (event) => {
  event.waitUntil(
    self.registration.showNotification('Nova entrega para você 🛵', {
      body: 'Toque para abrir o Delivery e ver os detalhes.',
      icon: '/icon-192.png',
      badge: '/badge-96.png',
      tag: 'nova-entrega',
      renotify: true,
      requireInteraction: true,
      vibrate: [300, 150, 300, 150, 300],
      silent: false,
      data: { url: '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow((event.notification.data && event.notification.data.url) || '/');
    })
  );
});
