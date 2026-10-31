/* Football Blitz '26 service worker: network first, cache fallback for offline play. */
var CACHE = 'fb26-v9';
var FILES = [
  './', './index.html', './css/style.css', './manifest.webmanifest',
  './js/vendor/three.bundle.js', './js/render3d.js',
  './js/data/template.js', './js/data/teams.js', './js/plays.js', './js/ai.js', './js/engine.js',
  './js/device.js', './js/render.js', './js/aim.js', './js/audio.js', './js/input.js', './js/ui.js', './js/main.js',
  './assets/icon.svg',
  './assets/audio/ball_catch_01.wav', './assets/audio/ball_catch_02.wav', './assets/audio/ball_catch_03.wav', './assets/audio/cleat_step_01.wav', './assets/audio/cleat_step_02.wav', './assets/audio/cleat_step_03.wav', './assets/audio/cleat_step_04.wav', './assets/audio/crowd_swell.wav', './assets/audio/jersey_rustle_01.wav', './assets/audio/jersey_rustle_02.wav', './assets/audio/pad_impact_01.wav', './assets/audio/pad_impact_02.wav', './assets/audio/pad_impact_03.wav', './assets/audio/stadium_bed.wav', './assets/audio/whistle_long.wav', './assets/audio/whistle_short.wav', './assets/icon-192.png', './assets/icon-512.png'
];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(function (res) {
    if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); }
    return res;
  }).catch(function () { return caches.match(e.request); }));
});
