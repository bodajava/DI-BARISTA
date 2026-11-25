/** Service worker for staff web push; config comes from the public Firebase env vars */
export function GET() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  const body = `
importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js');
firebase.initializeApp(${JSON.stringify(config)});
const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  const d = payload.data || {};
  self.registration.showNotification(d.title || 'DI BARISTA', {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { link: d.link || '/admin' },
    tag: d.kind || 'dib',
  });
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/admin';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { c.navigate(link); return c.focus(); } }
    return clients.openWindow(link);
  }));
});`;
  return new Response(body, {
    headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'Service-Worker-Allowed': '/' },
  });
}
