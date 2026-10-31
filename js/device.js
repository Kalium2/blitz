/*
 * Football Blitz '26 — device detection.
 *
 * Works out what the game is running on (iPhone/iPad Safari, Android
 * Chrome/Samsung Internet/Firefox, desktop) so the rest of the game can adapt:
 * iOS has no fullscreen API for pages and needs "Add to Home Screen" instead,
 * Android can go fullscreen, lock to landscape and offer an install prompt.
 * Uses User-Agent Client Hints where the browser has them (Chromium), and the
 * user-agent string otherwise. Loaded before everything else.
 */
(function () {
  var FB = (window.FB = window.FB || {});
  var ua = navigator.userAgent || '', hints = navigator.userAgentData || null;
  var touchPoints = navigator.maxTouchPoints || 0;

  // iPadOS 13+ reports itself as a Mac; a Mac with a multi-touch screen is an iPad
  var ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
  var iphone = /iPhone|iPod/.test(ua);
  var ios = iphone || ipad;
  var android = /Android/i.test(ua) || !!(hints && /Android/i.test(hints.platform || ''));

  // On iOS every browser is WebKit underneath; the others only rename themselves.
  var browser = 'other';
  if (ios) browser = /CriOS/.test(ua) ? 'chrome' : /FxiOS/.test(ua) ? 'firefox' : /EdgiOS/.test(ua) ? 'edge' : /Safari/.test(ua) ? 'safari' : 'webview';
  else if (/SamsungBrowser/.test(ua)) browser = 'samsung';
  else if (/Firefox\//.test(ua)) browser = 'firefox';
  else if (/Edg\//.test(ua)) browser = 'edge';
  else if (/Chrome\//.test(ua)) browser = 'chrome';
  else if (/Safari\//.test(ua)) browser = 'safari';

  var mobile = ios || android || !!(hints && hints.mobile);
  var standalone = (window.matchMedia && (window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches)) || navigator.standalone === true;
  // a home-screen app on iOS drops "Safari" from its user agent
  if (ios && standalone && browser === 'webview') browser = 'safari';
  var canFullscreen = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen) && !iphone;

  var Device = {
    ios: ios, iphone: iphone, ipad: ipad, android: android, mobile: mobile,
    tablet: ipad || (android && !/Mobile/.test(ua)),
    browser: browser, standalone: standalone, canFullscreen: canFullscreen,
    canVibrate: !!navigator.vibrate,
    installPrompt: null,

    os: function () { return iphone ? 'iPhone' : ipad ? 'iPad' : android ? (this.tablet ? 'Android tablet' : 'Android phone') : 'Desktop'; },
    browserName: function () { return { safari: 'Safari', chrome: 'Chrome', firefox: 'Firefox', edge: 'Edge', samsung: 'Samsung Internet', webview: 'in-app browser' }[browser] || 'browser'; },
    describe: function () { return this.os() + ' • ' + this.browserName() + (standalone ? ' • home-screen app' : ''); },

    // Tag <body> so CSS can adapt (body.mobile, body.ios, body.android, ...).
    tagBody: function () {
      var c = document.body.classList;
      if (mobile) c.add('mobile');
      if (ios) c.add('ios');
      if (android) c.add('android');
      if (standalone) c.add('standalone');
      c.add('browser-' + browser);
    }
  };

  // Android Chrome / Samsung Internet offer to install the game as an app.
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    Device.installPrompt = e;
    if (Device.onInstallable) Device.onInstallable();
  });

  // Safari ignores user-scalable=no: stop pinch zoom here (double-tap zoom is
  // off through touch-action: manipulation in the stylesheet)
  if (ios) document.addEventListener('gesturestart', function (e) { e.preventDefault(); }, { passive: false });

  FB.Device = Device;
})();
