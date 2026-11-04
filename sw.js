/* SC Hoje — recebe as notificações push e abre a matéria ao clicar. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { titulo: e.data ? e.data.text() : '' }; }
  var opc = { body: d.texto || '', icon: '/estatico/img/sc-icone-180-v2.png', badge: '/estatico/img/sc-icone-32-v2.png', data: { url: d.url || '/' }, tag: d.url || 'sc-hoje' };
  if (d.imagem) opc.image = d.imagem;
  e.waitUntil(self.registration.showNotification(d.titulo || 'SC Hoje', opc));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var alvo = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (l) {
    for (var i = 0; i < l.length; i++) { if (l[i].url.indexOf(alvo) !== -1 && 'focus' in l[i]) return l[i].focus(); }
    return self.clients.openWindow(alvo);
  }));
});
