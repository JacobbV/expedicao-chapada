// Service worker: guarda o app no aparelho para abrir sem internet.
// A versão vem de js/version.js: ao publicar, aumente o número lá.
importScripts("./js/version.js");
const VERSION = "v" + self.APP_VERSION;
const SHELL = `shell-${VERSION}`;
const RUNTIME = "runtime-v1";
const TILES = "tiles-v1";
const MAX_TILES = 3000;
const FILES = [
  "./", "./index.html", "./manifest.webmanifest", "./firebase-config.js",
  "./css/app.css", "./js/app.js", "./js/store.js", "./js/data.js", "./js/map.js", "./js/version.js",
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
  if ((url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com" || (url.hostname === "unpkg.com" && url.pathname.startsWith("/leaflet@"))) {
    e.respondWith(caches.open(RUNTIME).then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      const res = await fetch(req); if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res;
    }));
    return;
  }
  // Mapa: azulejos do OpenStreetMap ficam guardados para abrir sem sinal as áreas já vistas
  if (url.hostname === "tile.openstreetmap.org") {
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) { c.put(req, res.clone()); c.keys().then(k => { if (k.length > MAX_TILES) k.slice(0, k.length - MAX_TILES).forEach(x => c.delete(x)); }); }
        return res;
      } catch (err) { return new Response("", { status: 504 }); }
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
