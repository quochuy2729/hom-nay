// Đổi VERSION mỗi khi sửa code để điện thoại tải bản mới.
const VERSION = "hn-v14";
const SHELL = [
  "./", "index.html", "styles.css", "app.js", "quick.js", "lunar.js", "config.js", "manifest.webmanifest",
  "icon-192.png", "icon-512.png", "apple-touch-icon.png",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"
];

// File của app phải tải đủ (addAll), thiếu một file là hủy cả lần cài: SW và cache cũ vẫn chạy, lần sau thử lại.
// Thư viện trên CDN thì cố gắng, lỗi cũng bỏ qua (đã có bản cũ trong cache hoặc tải lại khi có mạng).
const LOCAL = SHELL.filter(u => !/^https?:/.test(u)), REMOTE = SHELL.filter(u => /^https?:/.test(u));
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(LOCAL.map(u => new Request(u, { cache: "reload" })))
      .then(() => Promise.all(REMOTE.map(u => c.add(new Request(u, { cache: "reload" })).catch(() => {})))))
    .then(() => self.skipWaiting())
    .catch(err => caches.delete(VERSION).then(() => { throw err; })));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname.endsWith("supabase.co") || url.hostname.endsWith("supabase.in")) return; // dữ liệu luôn đi mạng
  const sameOrigin = url.origin === location.origin;
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  const isLib = url.hostname === "cdn.jsdelivr.net";
  if (!sameOrigin && !isFont && !isLib) return;
  // app shell: dùng bản cache ngay, cập nhật ngầm
  e.respondWith(caches.open(VERSION).then(async cache => {
    let hit = (await cache.match(req, { ignoreSearch: sameOrigin })) || (await caches.match(req, { ignoreSearch: sameOrigin }));
    // supabase-js giờ tải bằng CORS (có SRI): bản opaque cũ trong cache không dùng được, phải lấy lại từ mạng
    if (hit && hit.type === "opaque" && req.mode === "cors") hit = null;
    const net = fetch(req).then(res => { if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    if (res) return res;
    if (req.mode === "navigate") return (await cache.match("index.html")) || Response.error();
    return Response.error();
  }));
});

// Thông báo nhắc hạn từ máy chủ
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: "Hôm Nay", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Hôm Nay", {
    body: d.body || "", tag: d.tag || undefined, renotify: !!d.tag, icon: "icon-192.png", badge: "icon-192.png",
    data: { url: d.url || "./" }, vibrate: [120, 60, 120], timestamp: Date.now()
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url.startsWith(self.registration.scope)) { c.postMessage({ openUrl: url }); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
