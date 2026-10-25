// Mapa com pins (Leaflet + OpenStreetMap). Carregado só quando a tela Mapa é aberta.
const LEAFLET = "https://unpkg.com/leaflet@1.9.4/dist/";

let loading = null;
export function ensureLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (loading) return loading;
  loading = new Promise((ok, fail) => {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = LEAFLET + "leaflet.css";
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = LEAFLET + "leaflet.js";
    js.onload = () => ok(window.L);
    js.onerror = () => { loading = null; fail(new Error("Não consegui carregar o mapa. Abra esta tela uma vez com internet.")); };
    document.head.appendChild(js);
  });
  return loading;
}

// Ícones 16×16, traço branco, desenhados dentro da gota
const ICONS = {
  pousada:   '<path d="M2 8l6-5 6 5v6H2z"/><path d="M7 14v-4h2v4"/>',
  cachoeira: '<path d="M8 2C8 2 3 8 3 10.5a5 5 0 0 0 10 0C13 8 8 2 8 2z"/>',
  mirante:   '<path d="M1 14l5-8 3 4 2-3 4 7z"/>',
  gruta:     '<path d="M2 14V9a6 6 0 0 1 12 0v5"/><path d="M6 14v-3a2 2 0 0 1 4 0v3"/>',
  canoa:     '<path d="M1 9h14l-2 4H3z"/><path d="M10 2L7 9"/>',
  cidade:    '<path d="M2 14V7l4-3 4 3v7"/><path d="M10 14V9h4v5"/><path d="M5 14v-3h2v3"/>',
  posto:     '<path d="M3 14V3h6v11"/><path d="M3 7h6"/><path d="M9 6l3 2v5a1 1 0 0 0 2 0V7"/>',
  ponto:     '<circle cx="8" cy="8" r="3"/>',
};

export function pinHTML(color, type, order) {
  return `<div class="pin" style="--c:${color}">
    <svg viewBox="0 0 32 42" width="32" height="42" aria-hidden="true">
      <path d="M16 41S30 26 30 15A14 14 0 0 0 2 15C2 26 16 41 16 41Z" style="fill:var(--c)" stroke="#fff" stroke-width="2"/>
      <g transform="translate(8 7)" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[type] || ICONS.ponto}</g>
    </svg>${order ? `<span class="pin-n">${order}</span>` : ""}</div>`;
}

export function distKm(a, b) {
  const R = 6371, toR = x => x * Math.PI / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export class MapView {
  constructor(L, el, opts) {
    const { onPin, onPlace } = opts;
    this.L = L; this.el = el; this.onPin = onPin; this.onPlace = onPlace;
    this.markers = new Map(); this.placing = null; this.dragId = null; this.lastFitKey = "";
    this.map = L.map(el, { zoomControl: true, tap: true }).setView([-12.5, -41.43], 10);
    this.tiles = null; this.setStyle(opts.style || "padrao");
    this.map.on("click", e => { if (this.placing) { const fn = this.placing; this.placing = null; this.el.classList.remove("placing"); fn(e.latlng); } });
    this.map.on("contextmenu", e => { if (!this.placing && !this.dragId) this.onPlace(e.latlng); });
  }
  // Estilos de mapa, todos grátis e sem chave:
  // padrao = OpenStreetMap; relevo = OpenTopoMap (curvas de nível, bom para serra e chapada); escuro = OpenStreetMap com filtro escuro
  setStyle(style) {
    const L = this.L, OSM = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
    const def = style === "relevo"
      ? ["https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 17, subdomains: "abc", attribution: `Mapa: ${OSM}, <a href="http://viewfinderpanoramas.org" target="_blank" rel="noopener">SRTM</a> · Estilo: &copy; <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener">CC-BY-SA</a>)` }]
      : ["https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: OSM }];
    if (this.tiles) this.map.removeLayer(this.tiles);
    this.tiles = L.tileLayer(def[0], def[1]).addTo(this.map);
    this.el.classList.toggle("map-dark", style === "escuro");
    this.style = style;
  }
  alive() { return document.body.contains(this.el); }
  // pts: [{id, lat, lng, color, type, order, name}]
  setPoints(pts, fitKey) {
    const L = this.L, seen = new Set();
    for (const p of pts) {
      if (p.lat == null || p.lng == null) continue;
      seen.add(p.id);
      const html = pinHTML(p.color, p.type, p.order);
      const icon = L.divIcon({ html, className: "pin-wrap", iconSize: [32, 42], iconAnchor: [16, 41] });
      let m = this.markers.get(p.id);
      if (!m) {
        m = L.marker([p.lat, p.lng], { icon, title: p.name, keyboard: true, riseOnHover: true }).addTo(this.map);
        m.on("click", () => { if (!this.dragId) this.onPin(m._pid); });
        this.markers.set(p.id, m);
      } else if (this.dragId !== p.id) {
        m.setLatLng([p.lat, p.lng]);
        if (m._html !== html) m.setIcon(icon);
      }
      m._pid = p.id; m._html = html;
    }
    for (const [id, m] of this.markers) if (!seen.has(id)) { m.remove(); this.markers.delete(id); }
    if (fitKey !== this.lastFitKey) { this.lastFitKey = fitKey; this.fit(pts); }
  }
  fit(pts) {
    const ll = pts.filter(p => p.lat != null).map(p => [p.lat, p.lng]);
    if (ll.length === 1) this.map.setView(ll[0], 14);
    else if (ll.length) this.map.fitBounds(ll, { padding: [36, 36], maxZoom: 15 });
  }
  focus(id) { const m = this.markers.get(id); if (m) this.map.setView(m.getLatLng(), Math.max(this.map.getZoom(), 14)); }
  startPlacing(fn) { this.placing = fn; this.el.classList.add("placing"); }
  cancelPlacing() { this.placing = null; this.el.classList.remove("placing"); }
  startDrag(id, done) {
    const m = this.markers.get(id); if (!m) return false;
    this.dragId = id; m.dragging.enable(); this.focus(id);
    m.once("dragend", () => { m.dragging.disable(); this.dragId = null; const ll = m.getLatLng(); done(ll); });
    return true;
  }
  // routes: [{ latlngs: [[lat,lng],…], color: "#hex", dashed: bool }]
  setRoutes(routes) {
    if (this.routeLayer) { this.routeLayer.remove(); this.routeLayer = null; }
    if (!routes || !routes.length) return;
    const L = this.L;
    this.routeLayer = L.layerGroup(routes.map(r => L.polyline(r.latlngs, {
      color: r.color, weight: r.dashed ? 3 : 5, opacity: .85, dashArray: r.dashed ? "6 8" : null, interactive: false,
    }))).addTo(this.map);
  }
  invalidate() { setTimeout(() => this.map.invalidateSize(), 60); }
}
