// Tempo por dia (Open-Meteo, grátis e sem chave).
// - Até 15 dias à frente: previsão.
// - Mais longe que isso: referência do mesmo dia no ano anterior (como estava o tempo).
// - Dias que já passaram: como estava o tempo naquele dia.
const FORECAST = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";
const DAILY = "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum";
const mem = new Map();
const pending = new Map();

const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);

export function wxInfo(code) {
  if (code == null) return { icon: "·", text: "—" };
  if (code === 0) return { icon: "☀️", text: "Céu limpo" };
  if (code <= 2) return { icon: "🌤️", text: "Poucas nuvens" };
  if (code === 3) return { icon: "☁️", text: "Nublado" };
  if (code === 45 || code === 48) return { icon: "🌫️", text: "Neblina" };
  if (code >= 51 && code <= 57) return { icon: "🌦️", text: "Garoa" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { icon: "🌧️", text: code >= 80 ? "Pancadas de chuva" : "Chuva" };
  if (code >= 71 && code <= 77) return { icon: "🌨️", text: "Neve" };
  if (code >= 95) return { icon: "⛈️", text: "Tempestade" };
  return { icon: "🌥️", text: "Variável" };
}

// Qual consulta vale para essa data, vista de hoje
export function wxPlan(date, today) {
  const ahead = daysBetween(today, date);
  if (ahead >= 0 && ahead <= 15) return { kind: "forecast", date };
  if (ahead < 0) return { kind: "past", date };
  const d = parse(date); d.setFullYear(d.getFullYear() - 1);
  return { kind: "ref", date: iso(d), availableFrom: iso(new Date(parse(date).getTime() - 15 * 864e5)) };
}

const keyOf = (lat, lng, plan) => `wx:${plan.kind}:${lat.toFixed(2)},${lng.toFixed(2)}:${plan.date}`;
const fresh = (rec, plan) => rec && (plan.kind !== "forecast" || Date.now() - rec.at < 3 * 3600e3);

export function wxCached(lat, lng, plan) {
  const k = keyOf(lat, lng, plan);
  if (mem.has(k) && fresh(mem.get(k), plan)) return mem.get(k).v;
  try { const r = JSON.parse(localStorage.getItem(k) || "null"); if (fresh(r, plan)) { mem.set(k, r); return r.v; } } catch (e) {}
  return undefined;
}

export function wxFetch(lat, lng, plan) {
  const k = keyOf(lat, lng, plan);
  if (pending.has(k)) return pending.get(k);
  const base = plan.kind === "forecast" ? FORECAST : ARCHIVE;
  const url = `${base}?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&daily=${DAILY}&timezone=America%2FBahia&start_date=${plan.date}&end_date=${plan.date}`;
  const p = fetch(url).then(r => r.ok ? r.json() : null).then(j => {
    const dd = j?.daily; if (!dd || !dd.time?.length) return null;
    const v = { code: dd.weather_code?.[0], tmax: dd.temperature_2m_max?.[0], tmin: dd.temperature_2m_min?.[0], rain: dd.precipitation_sum?.[0] };
    const rec = { at: Date.now(), v }; mem.set(k, rec);
    try { localStorage.setItem(k, JSON.stringify(rec)); } catch (e) {}
    return v;
  }).catch(() => null).finally(() => pending.delete(k));
  pending.set(k, p);
  return p;
}
