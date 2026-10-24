// Service worker: guarda o app no aparelho para abrir sem internet.
// Ao publicar uma versão nova, aumente o número de VERSION.
const VERSION = "v1.0.1";
const SHELL = `shell-${VERSION}`;
const RUNTIME = "runtime-v1";
const FILES = [
  "./", "./index.html", "./manifest.webmanifest", "./firebase-config.js",
  "./css/app.css", "./js/app.js", "./js/store.js", "./js/data.js",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("shell-") && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Bibliotecas do Firebase e fontes: cache primeiro (não mudam na mesma versão)
  if ((url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open(RUNTIME).then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      const res = await fetch(req); if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return; // Firestore e login vão direto para a rede
  // Arquivos do app: responde do cache e atualiza em segundo plano
  e.respondWith(caches.open(SHELL).then(async c => {
    const key = req.mode === "navigate" ? "./index.html" : req;
    const hit = await c.match(key, { ignoreSearch: true });
    const net = fetch(req).then(res => { if (res.ok) c.put(key, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
