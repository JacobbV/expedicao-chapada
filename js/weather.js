// Tempo por dia (Open-Meteo, grátis e sem chave).
// - Até 15 dias à frente: previsão com hora a hora, chance de chuva, vento, rajadas e UV.
// - Mais longe que isso: clima típico (o mesmo dia nos últimos 5 anos) + o dia do ano passado hora a hora.
// - Dias que já passaram: como estava o tempo.
// Tudo fica guardado no celular: sem sinal, aparece o último resultado baixado.
const FORECAST = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";
const GEO = "https://geocoding-api.open-meteo.com/v1/search";
const TZ = "America%2FBahia";
const D_BASE = "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,sunrise,sunset";
const H_BASE = "temperature_2m,weather_code,precipitation,wind_speed_10m,wind_gusts_10m,is_day";
const mem = new Map();
const pending = new Map();

const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
const r2 = v => Math.round(v * 100) / 100;

// limpa o cache da versão antiga (uma vez)
try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith("wx:")) localStorage.removeItem(k); } } catch (e) {}

export function wxInfo(code, night) {
  if (code == null) return { icon: "·", text: "—" };
  if (code === 0) return { icon: night ? "🌙" : "☀️", text: "Céu limpo" };
  if (code <= 2) return { icon: night ? "☁️" : "🌤️", text: "Poucas nuvens" };
  if (code === 3) return { icon: "☁️", text: "Nublado" };
  if (code === 45 || code === 48) return { icon: "🌫️", text: "Neblina" };
  if (code >= 51 && code <= 57) return { icon: "🌦️", text: "Garoa" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { icon: "🌧️", text: code >= 80 ? "Pancadas de chuva" : "Chuva" };
  if (code >= 71 && code <= 77) return { icon: "🌨️", text: "Neve" };
  if (code >= 95) return { icon: "⛈️", text: "Tempestade" };
  return { icon: "🌥️", text: "Variável" };
}

const DIRS = ["norte", "nordeste", "leste", "sudeste", "sul", "sudoeste", "oeste", "noroeste"];
export const windFrom = deg => deg == null ? "" : DIRS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];

// Qual consulta vale para essa data, vista de hoje
export function wxPlan(date, today) {
  const ahead = daysBetween(today, date);
  if (ahead >= 0 && ahead <= 15) return { kind: "forecast", date };
  if (ahead < 0) return { kind: "past", date, recent: ahead >= -60 };
  const d = parse(date); d.setFullYear(d.getFullYear() - 1);
  return { kind: "ref", date: iso(d), target: date, availableFrom: iso(new Date(parse(date).getTime() - 15 * 864e5)) };
}

/* ---------- cache ---------- */
function getC(k, maxAge) {
  const ok = r => r && (!maxAge || Date.now() - r.at < maxAge);
  if (mem.has(k) && ok(mem.get(k))) return mem.get(k).v;
  try { const r = JSON.parse(localStorage.getItem(k) || "null"); if (ok(r)) { mem.set(k, r); return r.v; } } catch (e) {}
  return undefined;
}
function setC(k, v) { const rec = { at: Date.now(), v }; mem.set(k, rec); try { localStorage.setItem(k, JSON.stringify(rec)); } catch (e) {} }
// Sem internet: devolve o que tiver, mesmo vencido
function stale(k) { try { return JSON.parse(localStorage.getItem(k) || "null")?.v; } catch (e) { return undefined; } }
function once(k, fn) {
  if (pending.has(k)) return pending.get(k);
  const p = fn().finally(() => pending.delete(k)); pending.set(k, p); return p;
}
const ll = (lat, lng) => `${lat.toFixed(2)},${lng.toFixed(2)}`;

/* ---------- um dia num lugar (diário + hora a hora) ---------- */
export function wxDayCached(lat, lng, plan) {
  const k = `wx2:day:${plan.kind === "forecast" ? "f" : "a"}:${ll(lat, lng)}:${plan.date}`;
  return getC(k, plan.kind === "forecast" ? 3 * 3600e3 : plan.recent ? 24 * 3600e3 : 0);
}
export function wxDay(lat, lng, plan) {
  const fc = plan.kind === "forecast" || (plan.kind === "past" && plan.recent);
  const k = `wx2:day:${plan.kind === "forecast" ? "f" : "a"}:${ll(lat, lng)}:${plan.date}`;
  const c = wxDayCached(lat, lng, plan); if (c !== undefined) return Promise.resolve(c);
  return once(k, async () => {
    const daily = D_BASE + (fc ? ",precipitation_probability_max,uv_index_max" : "");
    const hourly = H_BASE + (fc ? ",precipitation_probability" : "");
    const url = `${fc ? FORECAST : ARCHIVE}?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&daily=${daily}&hourly=${hourly}&timezone=${TZ}&start_date=${plan.date}&end_date=${plan.date}&wind_speed_unit=kmh`;
    try {
      const r = await fetch(url); if (!r.ok) throw 0; const j = await r.json();
      const dd = j.daily, hh = j.hourly; if (!dd?.time?.length) throw 0;
      const hm = s => s ? s.slice(11, 16) : null;
      const v = {
        code: dd.weather_code?.[0], tmax: dd.temperature_2m_max?.[0], tmin: dd.temperature_2m_min?.[0], rain: dd.precipitation_sum?.[0],
        prob: dd.precipitation_probability_max?.[0] ?? null, wind: dd.wind_speed_10m_max?.[0], gust: dd.wind_gusts_10m_max?.[0],
        dir: dd.wind_direction_10m_dominant?.[0], uv: dd.uv_index_max?.[0] ?? null, sunrise: hm(dd.sunrise?.[0]), sunset: hm(dd.sunset?.[0]),
        hours: (hh?.time || []).map((t, i) => ({ h: +t.slice(11, 13), t: hh.temperature_2m?.[i], code: hh.weather_code?.[i], rain: r2(hh.precipitation?.[i] || 0),
          prob: hh.precipitation_probability?.[i] ?? null, wind: hh.wind_speed_10m?.[i], gust: hh.wind_gusts_10m?.[i], day: hh.is_day?.[i] === 1 })),
      };
      setC(k, v); return v;
    } catch (e) { const s = stale(k); return s === undefined ? null : s; }
  });
}

/* ---------- clima típico: o mesmo dia nos últimos 5 anos ---------- */
export function wxTypicalCached(lat, lng, date) { return getC(`wx2:typ:${ll(lat, lng)}:${date.slice(5)}`, 0); }
export function wxTypical(lat, lng, date) {
  const md = date.slice(5), k = `wx2:typ:${ll(lat, lng)}:${md}`;
  const c = wxTypicalCached(lat, lng, date); if (c !== undefined) return Promise.resolve(c);
  return once(k, async () => {
    const y = new Date().getFullYear(); // últimos 5 anos completos até hoje
    const lastY = `${y}-${md}` < iso(new Date(Date.now() - 6 * 864e5)) ? y : y - 1;
    const url = `${ARCHIVE}?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=${TZ}&start_date=${lastY - 4}-${md}&end_date=${lastY}-${md}`;
    try {
      const r = await fetch(url); if (!r.ok) throw 0; const j = await r.json(); const dd = j.daily; if (!dd?.time) throw 0;
      const years = []; dd.time.forEach((t, i) => { if (t.slice(5) === md) years.push({ y: +t.slice(0, 4), code: dd.weather_code[i], tmax: dd.temperature_2m_max[i], tmin: dd.temperature_2m_min[i], rain: r2(dd.precipitation_sum[i] || 0) }); });
      if (!years.length) throw 0;
      const avg = f => years.reduce((s, x) => s + (x[f] ?? 0), 0) / years.length;
      const v = { years, tmax: avg("tmax"), tmin: avg("tmin"), rainy: years.filter(x => x.rain >= 1).length, n: years.length };
      setC(k, v); return v;
    } catch (e) { return null; }
  });
}

/* ---------- cidades do caminho (busca de nomes do Open-Meteo) ---------- */
const distKm = (a, b) => { const R = 6371, t = x => x * Math.PI / 180; const dLa = t(b.lat - a.lat), dLo = t(b.lng - a.lng);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
export function geocode(name, near) {
  const k = "wx2:geo:" + name.toLowerCase() + (near ? ":" + ll(near.lat, near.lng).replace(/\.\d+/g, "") : "");
  const c = getC(k, 0); if (c !== undefined) return Promise.resolve(c);
  return once(k, async () => {
    try {
      const r = await fetch(`${GEO}?name=${encodeURIComponent(name)}&count=10&language=pt&countryCode=BR&format=json`); if (!r.ok) throw 0;
      const j = await r.json(); let list = (j.results || []).filter(x => (x.feature_code || "").startsWith("PPL"));
      if (!list.length) list = j.results || [];
      if (near) list = list.map(x => ({ x, d: distKm(near, { lat: x.latitude, lng: x.longitude }) })).filter(o => o.d < 450).sort((a, b) => a.d - b.d).map(o => o.x);
      const hit = list[0]; const v = hit ? { lat: hit.latitude, lng: hit.longitude, name: hit.name } : null;
      setC(k, v); return v;
    } catch (e) { return null; }
  });
}
export { distKm };
