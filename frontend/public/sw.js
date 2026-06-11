self.addEventListener('push', (event) => {
  let data = { title: 'Kryptos Chat', body: 'New message' };
  try {
    if (event.data) data = event.data.json();
  } catch {
    /* ignore */
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Kryptos Chat', {
      body: data.body || 'New message',
      icon: '/kryptos-logo.png',
      badge: '/kryptos-logo.png',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
