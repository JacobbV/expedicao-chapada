import { CIRCUITS, CHECKLIST, STATUS, PEND, ETAPAS, CATS, CAT_ALIAS, LEGACY_PREP, PTYPES, baseStatus, addDays } from "./data.js";
import { createStore, newId } from "./store.js";
import { ensureLeaflet, MapView, pinHTML, distKm } from "./map.js";
import { wxInfo, wxPlan, wxDay, wxTypical, geocode, windFrom } from "./weather.js";

const store = createStore();
let S = null, ST = null;
let route = "inicio";
let viewRider = null, clFilter = "all", expFilter = "todos", mapFilter = "all";
let mapView = null, gastosTab = "trip";
let linkOn = (() => { try { return localStorage.getItem("linkOn") === "1"; } catch (e) { return false; } })();
let routeKey = "", routeSeq = 0;
const openDays = new Set();

/* ---------- utilitários ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = v => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brl0 = v => brl(v); // valores sempre com centavos
const num = (v, d = 0) => (Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: d });
const WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const pad = n => String(n).padStart(2, "0");
const parseISO = iso => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
const fmtD = iso => { const d = parseISO(iso); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };
const wd = iso => WD[parseISO(iso).getDay()];
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const diffDays = (a, b) => Math.round((Date.UTC(...b.split("-").map((x, i) => i === 1 ? x - 1 : +x)) - Date.UTC(...a.split("-").map((x, i) => i === 1 ? x - 1 : +x))) / 864e5);
const parseNum = v => { if (v === "" || v == null) return null; const n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : null; };

function toast(msg) {
  document.querySelectorAll(".toast").forEach(x => x.remove());
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.remove(), Math.max(2200, msg.length * 60));
}

/* ---------- identidade ---------- */
const riderIds = () => Object.keys(S.riders || {}).sort((a, b) => (a === "jaco" ? -1 : b === "jaco" ? 1 : ((S.riders[a].created || 0) - (S.riders[b].created || 0)) || a.localeCompare(b)));
const rname = id => S.riders?.[id]?.name || id;
function me() {
  if (ST.mode === "local") { try { const m = localStorage.getItem("me"); if (m && S.riders[m]) return m; } catch (e) {} return null; }
  const em = (ST.user || "").toLowerCase();
  return riderIds().find(id => (S.riders[id].email || "").toLowerCase() === em) || null;
}
const canEdit = rid => ST.mode === "local" || rid === me();
// Admin (Jacó) mexe no app geral; os outros só nos próprios dados
const isAdmin = () => ST.mode === "local" || me() === (S.trip?.admin || "jaco");
const ADMIN_ACTS = new Set(["newRider"]); // o resto da viagem os dois editam juntos
const adminNote = what => isAdmin() ? "" : `<p class="note">🔒 Só o ${esc(rname(S.trip?.admin || "jaco"))} (admin) altera ${what}. Você vê tudo para consulta.</p>`;

/* ---------- cálculos ---------- */
const days = () => [...(S.trip?.days || [])].sort((a, b) => a.date.localeCompare(b.date));
const totalKm = () => days().reduce((s, d) => s + (Number(d.km) || 0), 0);
const itemStatus = (rid, iid) => S.checklist?.[rid]?.items?.[iid] || baseStatus(rid, iid);
function progress(rid) {
  const c = { avaliar: 0, tenho: 0, prov: 0, rev: 0, nao: 0 }; let total = 0;
  for (const [, items] of CHECKLIST) for (const it of items) { c[itemStatus(rid, it[0])]++; total++; }
  return { c, total, pct: Math.round((c.tenho + c.nao) / total * 100) };
}
const expenses = () => Object.entries(S.expenses || {}).map(([id, e]) => ({ id, ...e })).sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.created || 0) - (a.created || 0));
function settlement() {
  const ids = riderIds(), list = expenses().filter(e => e.shared && !e.fromPrep);
  const total = list.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const share = ids.length ? total / ids.length : 0;
  const bal = {}; ids.forEach(id => bal[id] = -share);
  list.forEach(e => { if (bal[e.rider] != null) bal[e.rider] += Number(e.amount) || 0; });
  return { total, share, bal };
}
function settleText() {
  const { bal, total } = settlement();
  if (!total) return "Nenhum gasto compartilhado ainda.";
  const ids = riderIds();
  const pos = ids.filter(i => bal[i] > 0.5), neg = ids.filter(i => bal[i] < -0.5);
  if (!pos.length) return "Contas acertadas: cada um pagou a sua metade.";
  if (ids.length === 2) return `${rname(neg[0])} deve ${brl(bal[pos[0]])} a ${rname(pos[0])}.`;
  return ids.map(i => `${rname(i)}: ${bal[i] >= 0 ? "recebe" : "paga"} ${brl(Math.abs(bal[i]))}`).join(" · ");
}
function fuelPlan(rid) {
  const r = S.riders[rid]; const c = consumoDe(rid);
  if (!c) return null;
  const l = totalKm() / c; return { litros: l, custo: l * (Number(S.trip.gasPrice) || 0), autonomia: r.tanque ? r.tanque * c : null };
}

/* ---------- folha (modal) ---------- */
function openSheet(html, mount) {
  const layer = $("#layer");
  layer.innerHTML = `<div class="sheet-bg" data-close="1"><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div></div>`;
  const bg = layer.firstElementChild;
  bg.addEventListener("click", e => { if (e.target.dataset.close) closeSheet(); });
  const first = bg.querySelector("input,select,textarea,button:not(.x)"); first && setTimeout(() => first.focus(), 50);
  mount && mount(bg.querySelector(".sheet"));
}
function closeSheet() { const l = $("#layer"); if (!l.querySelector(".login")) l.innerHTML = ""; }
addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });

/* ---------- topo ---------- */
function renderTop() {
  const p = $("#syncPill");
  let cls = "on", txt = "Sincronizado";
  if (ST.mode === "local") { cls = ""; txt = "Modo local"; }
  else if (ST.error) { cls = "err"; txt = "Erro"; }
  else if (!ST.online) { cls = "off"; txt = ST.pending ? "Offline · na fila" : "Offline"; }
  else if (ST.pending) { cls = "q"; txt = "Enviando…"; }
  p.className = "pill " + cls; p.querySelector("span:last-child").textContent = txt;
  const m = me();
  $("#mePill").querySelector("span").textContent = m ? rname(m) : "Quem é você?";
  document.querySelectorAll(".nav a").forEach(a => {
    const r = a.dataset.r, cur = route;
    a.toggleAttribute("aria-current", r === cur); if (r === cur) a.setAttribute("aria-current", "page");
  });
}
$("#syncPill").addEventListener("click", () => go("ajustes"));
$("#mePill").addEventListener("click", () => pickMe());

function pickMe(force) {
  const ids = riderIds();
  openSheet(`<h3>Quem está usando este celular?</h3>
    <p class="muted">${ST.mode === "cloud" ? "Isso liga o seu e-mail ao seu perfil. Você edita o seu checklist e lança os seus gastos; o do outro aparece para consulta." : "No modo local isso só define o perfil padrão. Dá para trocar quando quiser."}</p>
    <div class="stack">${ids.map(id => `<button class="btn block" data-pick="${id}">${esc(rname(id))} · ${esc(S.riders[id].moto || "")}</button>`).join("")}</div>
    ${force ? "" : `<button class="btn" data-close="1">Cancelar</button>`}`, sh => {
    sh.addEventListener("click", async e => {
      const b = e.target.closest("[data-pick]"); if (!b) return;
      const id = b.dataset.pick;
      if (ST.mode === "local") { try { localStorage.setItem("me", id); } catch (er) {} }
      else {
        const taken = (S.riders[id].email || "").toLowerCase();
        if (taken && taken !== ST.user.toLowerCase()) { toast(`${rname(id)} já está ligado a outro e-mail`); return; }
        const old = me(); if (old && old !== id) await store.merge("riders/" + old, { email: "" });
        await store.merge("riders/" + id, { email: ST.user });
      }
      viewRider = id; $("#layer").innerHTML = ""; render();
    });
  });
}

/* ---------- rotas ---------- */
function go(r) { if (location.hash !== "#" + r) location.hash = r; else { route = r; render(); } }
addEventListener("hashchange", () => { route = (location.hash.slice(1) || "inicio"); render(); scrollTo(0, 0); });

const VIEWS = { inicio, roteiro, mapa, checklist, gastos, mais, hospedagem, pendencias, pilotos, ajustes, sobre, roadbook, seguranca, diario, revisao, pilotando, novidades, resumo };

function render() {
  if (!S || !ST) return;
  if (ST.mode === "cloud" && ST.authReady && !ST.user) return renderLogin();
  if ($("#layer .login")) $("#layer").innerHTML = "";
  if (!S.trip) { $("#view").innerHTML = `<div class="card"><p>${ST.error ? esc(ST.error) : "Baixando os dados da viagem…"}</p></div>`; renderTop(); return; }
  if (route === "mais") { route = "inicio"; history.replaceState(null, "", "#inicio"); setTimeout(openMenu, 0); }
  if (!VIEWS[route]) route = "inicio";
  if (!viewRider || !S.riders[viewRider]) viewRider = me() || riderIds()[0];
  document.body.classList.toggle("not-admin", !isAdmin());
  document.body.classList.toggle("riding", route === "pilotando");
  if (route === "mapa" && mapView && mapView.alive()) { updateMapParts(); renderTop(); return; }
  $("#view").innerHTML = `<section class="view">${VIEWS[route]()}</section>`;
  if (route === "mapa") mountMap();
  renderTop();
  if (!me() && !$("#layer").innerHTML) pickMe(true);
  migrateLegacy();
  migrateRoute();
  fillWx();
  fillFuel();
  newsCheck();
  if (route === "pilotando") { startRide(); fillRide(); } else stopRide();
}

/* ---------- login (modo nuvem) ---------- */
function renderLogin() {
  if ($("#layer .login")) return;
  $("#layer").innerHTML = `<div class="login"><form id="loginForm" novalidate>
    <div class="label" style="color:var(--asphalt-muted)">Janeiro de 2027</div>
    <h1>Expedição <span>Chapada</span></h1>
    <p style="color:var(--asphalt-muted);margin-top:-6px">Roteiro, mapa, checklist e gastos da viagem.</p>
    <label class="field"><span>E-mail</span><input id="lgEmail" type="email" autocomplete="username" required></label>
    <label class="field"><span>Senha</span><input id="lgPw" type="password" autocomplete="current-password" required></label>
    <p class="err" id="lgErr" hidden></p>
    <p class="okmsg" id="lgOk" hidden></p>
    <button class="btn primary block" type="submit">Entrar</button>
    <button class="linkbtn" type="button" id="lgForgot">Esqueci minha senha</button>
    <p class="login-foot">Criado por Jacó · <a href="https://github.com/JacobbV" target="_blank" rel="noopener">GitHub</a></p>
  </form></div>`;
  const err = $("#lgErr"), ok = $("#lgOk");
  $("#loginForm").addEventListener("submit", async e => {
    e.preventDefault(); err.hidden = true; ok.hidden = true;
    try { await store.signIn($("#lgEmail").value.trim(), $("#lgPw").value); }
    catch (ex) { err.hidden = false; err.textContent = /invalid|wrong|user-not-found|credential/.test(ex.code || "") ? "E-mail ou senha incorretos." : ex.code === "auth/network-request-failed" ? "Sem internet. Para entrar a primeira vez, conecte-se." : ex.code === "auth/too-many-requests" ? "Muitas tentativas. Espere alguns minutos e tente de novo." : "Não foi possível entrar. Tente de novo."; }
  });
  $("#lgForgot").addEventListener("click", async () => {
    err.hidden = true; ok.hidden = true;
    const email = $("#lgEmail").value.trim();
    if (!email) { err.hidden = false; err.textContent = "Digite seu e-mail acima e toque de novo em “Esqueci minha senha”."; $("#lgEmail").focus(); return; }
    try { await store.resetPassword(email); }
    catch (ex) { if (ex.code === "auth/network-request-failed") { err.hidden = false; err.textContent = "Sem internet. Conecte-se para recuperar a senha."; return; }
      if (ex.code === "auth/invalid-email") { err.hidden = false; err.textContent = "Esse e-mail não parece válido."; return; } }
    ok.hidden = false; ok.textContent = "Se esse e-mail tiver conta, enviamos um link para criar uma nova senha. Confira também o spam.";
  });
}

/* ---------- INÍCIO ---------- */
function inicio() {
  const ds = days(); const t = todayISO();
  const start = ds[0]?.date || S.trip.startDate, last = ds[ds.length - 1]?.date || start;
  let big, sub;
  if (t < start) { const n = diffDays(t, start); big = `Faltam <span>${n}</span> ${n === 1 ? "dia" : "dias"}`; sub = `Saída ${wd(start)} ${fmtD(start)}${ds[0]?.saida ? " às " + ds[0].saida.replace(":", "h") : ""} · ${esc(ds[0]?.title || "")}`; }
  else if (t <= last) { const k = ds.findIndex(d => d.date === t) + 1; big = `Dia <span>${k || "—"}</span> de ${ds.length}`; sub = "Boa estrada. Confira o dia de hoje abaixo."; }
  else { big = `Expedição <span>concluída</span>`; sub = `${ds.length} dias · ${num(totalKm())} km planejados`; }

  const fim = S.trip.feriasFim; let margem = "";
  if (fim && !isAdmin()) {
    const limite = addDays(fim, -1), folga = diffDays(last, fim) - 1;
    margem = `<div class="${folga < 0 ? "warnbox" : "infobox"}"><b>Prazo da viagem:</b> precisamos estar em casa até ${wd(limite)} ${fmtD(limite)}, porque as férias do ${esc(rname(S.trip?.admin || "jaco"))} terminam em ${fmtD(fim)}. Pelo roteiro atual, a chegada é ${wd(last)} ${fmtD(last)}${folga < 0 ? `, ${-folga} ${folga === -1 ? "dia" : "dias"} depois do prazo` : ""}.</div>`;
  } else if (fim) {
    const folga = diffDays(last, fim) - 1;
    margem = folga < 0
      ? `<div class="warnbox"><b>Passou das férias:</b> a chegada em casa é ${wd(last)} ${fmtD(last)} e as férias acabam ${fmtD(fim)}. Tire ${-folga} ${folga === -1 ? "dia" : "dias"} do roteiro ou adiante a saída.</div>`
      : folga < 1
      ? `<div class="warnbox"><b>Sem folga:</b> a chegada em casa é ${wd(last)} ${fmtD(last)} e as férias acabam ${fmtD(fim)}. Vale adiantar a saída.</div>`
      : `<div class="infobox">Chegada em casa ${wd(last)} ${fmtD(last)}. Sobram <b>${folga} ${folga === 1 ? "dia" : "dias"}</b> de folga antes do fim das férias (${fmtD(fim)}).</div>`;
  }
  const next = ds.find(d => d.date >= t) || ds[0];
  const m = me() || riderIds()[0], other = riderIds().find(i => i !== m);
  const pm = progress(m), po = other ? progress(other) : null;
  const doneP = Object.keys(S.pend?.done || {}).length, totalP = PEND.length + Object.keys(S.pend?.custom || {}).length;
  const myExp = myTripCost(m), myPrep = sumAmt(prepExpenses()) + sumAmt(tripExpenses().filter(e => e.rider === m && !e.fromPrep));
  const fuel = riderIds().map(id => { const f = fuelPlan(id); return `<tr><td>${esc(rname(id))}</td><td class="r num">${f ? num(f.litros) + " L" : "—"}</td><td class="r num">${f ? brl0(f.custo) : `<a href="#pilotos">informar consumo</a>`}</td></tr>`; }).join("");

  return `
  <div class="hero"><div class="label" style="color:var(--asphalt-muted)">${esc(S.trip.name || "Expedição")}</div><div class="big">${big}</div><div class="sub">${sub}</div></div>
  ${margem}
  ${hojeCard(ds, t)}
  <div class="stats">
    <a class="stat" href="#checklist"><div class="v">${pm.pct}%</div><div class="k">checklist ${esc(rname(m))}</div></a>
    ${po ? `<a class="stat" href="#checklist" data-vr="${other}"><div class="v">${po.pct}%</div><div class="k">checklist ${esc(rname(other))}</div></a>` : ""}
    <a class="stat" href="#pendencias"><div class="v">${totalP - doneP}</div><div class="k">pendências abertas</div></a>
    <a class="stat" href="#gastos"><div class="v" style="font-size:1.5rem">${brl0(myExp)}</div><div class="k">sua parte na viagem</div></a>
  </div>
  <div class="card"><div class="between"><h3>Combustível previsto</h3><span class="muted num" style="font-size:.85rem">${num(totalKm())} km · ${brl(S.trip.gasPrice)}/L</span></div>
    <div class="tablebox" style="margin-top:8px"><table><thead><tr><th>Piloto</th><th class="r">Litros</th><th class="r">Custo</th></tr></thead><tbody>${fuel}</tbody></table></div>
    <p class="note" style="margin-top:10px">Estimativa pela soma dos km do roteiro e pelo consumo de cada moto. O preço da gasolina muda em Ajustes.</p></div>
  <div class="card"><h3>Acerto de contas</h3><p class="settle" style="margin-top:6px">${esc(settleText())}</p>
    <p class="muted" style="font-size:.85rem;margin-top:6px">🔒 Meus gastos (só você vê): <a href="#gastos" data-act="gtab" data-v="prep">${brl(myPrep)}</a></p></div>`;
}

/* Painel Hoje: o que importa no dia (antes da viagem mostra a prévia do 1º dia) */
const m0 = () => me() || riderIds()[0];
function hojeCard(ds, t) {
  if (!ds.length) return "";
  const last = ds[ds.length - 1].date;
  if (t > last) return "";
  let i = ds.findIndex(d => d.date === t), tag;
  if (i >= 0) tag = "Hoje";
  else { i = ds.findIndex(d => d.date > t); tag = t < ds[0].date ? `Prévia do dia 1` : "Próximo dia"; }
  const d = ds[i], c = CIRCUITS[d.circ] || CIRCUITS.estrada, nx = ds[i + 1];
  const rows = [];
  // Horário
  const t0 = toH(d.saida);
  if (d.saida) rows.push(["🕓", `Saída às <b>${d.saida.replace(":", "h")}</b>${isRoad(d) && d.km && tripEnds(d)[1] ? ` · chegada por volta de <b>${hhmm(t0 + d.km / avgSpeed())}</b> em ${esc(cleanCity(tripEnds(d)[1]))}` : ""}`]);
  else if (isRoad(d)) rows.push(["🕓", `Hora de saída ainda não definida · <a href="#roteiro" data-act="editDay" data-id="${d.id}">definir</a>`]);
  // Combustível do dia
  if (d.km) {
    const parts = riderIds().map(id => { const r = S.riders[id], aut = (Number(r.tanque) || 0) * (consumoDe(id) || 0);
      if (!aut) return `${esc(rname(id))}: <a href="#pilotos">informar tanque e consumo</a>`;
      const n = Math.ceil(d.km / (aut * .85)) - 1;
      return `${esc(rname(id))}: ${n <= 0 ? "um tanque dá" : `<b>${n} ${n === 1 ? "parada" : "paradas"}</b> para abastecer`} <span class="muted">(autonomia ~${num(aut)} km)</span>`; });
    rows.push(["⛽", isRoad(d) && tripEnds(d)[1] ? `<div data-fuel="${d.id}" data-mode="short">${num(d.km)} km · ${parts.join(" · ")}</div>` : `${num(d.km)} km · ${parts.join(" · ")}`]);
  }
  // Pernoite
  const ln = lodgingFor(i, ds); if (ln && ln !== "—") rows.push(["🛏️", `Pernoite: <a href="#hospedagem">${esc(ln)}</a>`]);
  // Revisão pendente (antes da viagem)
  if (tag !== "Hoje" && m0()) { const n = revOf(m0()).filter(x => !x.done).length; if (n) rows.push(["🔧", `Revisão da moto: ${n} ${n === 1 ? "item" : "itens"} a fazer · <a href="#revisao" data-vr="${m0()}">ver</a>`]); }
  // Avisos de hoje (localização / cheguei bem)
  if (tag === "Hoje") { const ck = checkins().filter(c => c.at && new Date(c.at).toDateString() === new Date().toDateString()).slice(0, 2);
    ck.forEach(c => rows.push([c.kind === "ok" ? "✅" : "📍", `<b>${esc(rname(c.rider))}</b> ${c.kind === "ok" ? `chegou bem${c.place ? " em " + esc(c.place) : ""}` : "mandou a localização"} às ${pad(new Date(c.at).getHours())}h${pad(new Date(c.at).getMinutes())}${c.lat != null ? ` · <a href="https://maps.google.com/?q=${c.lat},${c.lng}" target="_blank" rel="noopener">mapa</a>` : ""}`])); }
  // Checklist que falta (meu)
  const m = me() || riderIds()[0];
  if (m) {
    const falta = []; for (const [, items] of CHECKLIST) for (const it of items) { const st = itemStatus(m, it[0]); if (st === "prov" || st === "rev" || st === "avaliar") falta.push(it[1]); }
    if (falta.length) rows.push(["📋", `Falta no seu checklist: ${falta.slice(0, 3).map(esc).join(", ")}${falta.length > 3 ? ` e mais ${falta.length - 3}` : ""} · <a href="#checklist" data-vr="${m}">ver</a>`]);
    else rows.push(["📋", "Seu checklist está completo."]);
  }
  return `<div class="card hoje" style="border-left:6px solid ${c.color}">
    <div class="between"><div class="label">${tag} · ${wd(d.date)} ${fmtD(d.date)}</div><span class="muted" style="font-size:.78rem">Dia ${i + 1} de ${ds.length}</span></div>
    <div class="ht">${esc(d.title)}</div>
    <div class="muted" style="font-size:.85rem">${esc(c.short || c.name)}</div>
    <div data-wx="${d.id}" data-mode="strip"><span class="muted">Carregando o tempo…</span></div>
    <ul class="hlist">${rows.map(([ic, h]) => `<li><span>${ic}</span><div>${h}</div></li>`).join("")}</ul>
    ${tag === "Hoje" ? `<a class="btn primary block" href="#pilotando">🏍️ Modo pilotando</a><div class="grid2"><button class="btn" data-act="sendLoc">📍 Minha localização</button><button class="btn" data-act="sendOk">✅ Cheguei bem</button></div>` : ""}
    <div class="row"><button class="btn sm" data-act="wxDay" data-id="${d.id}">Tempo do dia</button><button class="btn sm" data-act="mapCirc" data-v="${d.circ}">Ver no mapa</button><a class="btn sm" href="#roadbook">Roadbook</a></div>
    ${nx ? `<p class="muted" style="font-size:.8rem">Depois: ${wd(nx.date)} ${fmtD(nx.date)} · ${esc(nx.title)}${nx.saida ? " · saída " + nx.saida.replace(":", "h") : ""}</p>` : ""}
  </div>`;
}

/* ---------- ROTEIRO ---------- */
function roteiro() {
  const ds = days(), t = todayISO();
  const next = ds.find(d => d.date >= t);
  if (!openDays.size && next) openDays.add(next.id);
  const cards = ds.map(d => {
    const c = CIRCUITS[d.circ] || CIRCUITS.estrada; const det = CIRCUITS[d.circ];
    const circBlock = det && det.seq ? `
      <div class="label" style="color:${c.color}">${esc(det.name)}</div>
      <div class="seq">${det.seq.map(s => `<span>${esc(s)}</span>`).join("")}</div>
      <div class="metrics"><div><div class="label">Moto</div><div class="v">${esc(det.moto)}</div></div><div><div class="label">Caminhada</div><div class="v">${esc(det.caminhada)}</div></div><div><div class="label">Acesso</div><div class="v">${esc(det.acesso)}</div></div></div>
      ${det.trechos ? `<div class="tablebox"><table><tbody>${det.trechos.map(([a, b]) => `<tr><td>${esc(a)}</td><td class="r num">${esc(b)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      <p class="note">${esc(det.nota)}</p>` : "";
    return `<details class="day${d.date === t ? " today" : ""}" style="--c:${c.color}" data-day="${d.id}" ${openDays.has(d.id) ? "open" : ""}>
      <summary><div class="dnum">${parseISO(d.date).getDate()}<small>${wd(d.date)}</small></div>
        <div style="min-width:0"><div class="dt">${esc(d.title)}</div><div class="dm">${esc(c.short || c.name)}${d.saida ? " · saída " + d.saida.replace(":", "h") : ""}</div></div>
        <div class="dk">${d.km ? num(d.km) + " km" : ""}<span class="wx" data-wx="${d.id}" data-mode="chip"></span></div></summary>
      <div class="body">
        ${d.via ? `<div><div class="label">Caminho</div><div style="font-size:.9rem">${esc(d.via)}</div></div>` : ""}
        <div><div class="label">${isRoad(d) && tripEnds(d)[1] ? "Tempo no caminho" : "Tempo"}</div><div data-wx="${d.id}" data-mode="strip"><span class="muted">Carregando…</span></div></div>
        ${isRoad(d) && tripEnds(d)[1] ? `<div><div class="label">Abastecimento</div><div data-fuel="${d.id}"><span class="muted" style="font-size:.85rem">Calculando…</span></div></div>` : ""}
        ${d.notes ? `<p class="note">${esc(d.notes)}</p>` : ""}
        ${circBlock}
        ${dayPoints(d)}
        ${isRoad(d) && tripEnds(d)[1] || allPoints().some(p => p.circ === d.circ && p.lat != null && p.id !== "pousada") ? `<div><div class="label">Navegar</div>${navBtns(d)}</div>` : ""}
        ${dayPhotos(d)}
        <div class="row"><button class="btn sm " data-act="editDay" data-id="${d.id}">Editar dia</button><button class="btn sm " data-act="insDay" data-id="${d.id}">+ Inserir dia depois</button></div>
      </div></details>`;
  }).join("");
  const first = ds[0], last = ds[ds.length - 1];
  return `
  <div class="between"><h2>Roteiro</h2><span class="muted num">${num(totalKm())} km</span></div>
  <div class="row"><span class="muted">${first ? `${wd(first.date)} ${fmtD(first.date)} → ${wd(last.date)} ${fmtD(last.date)} · ${ds.length} dias` : ""}</span>
    <button class="btn sm " data-act="shiftDates">Mudar data de saída</button><a class="btn sm" href="#roadbook">Roadbook 10×15</a></div>
  <p class="note">Distâncias de estrada e dos circuitos são estimativas até a validação por GPS. A ordem dos circuitos pode mudar conforme a chuva: edite o dia e troque o circuito. Inserir ou remover um dia empurra as datas seguintes.</p>
  <div class="card stack" id="wxWeek"><h3>Tempo da viagem</h3><p class="muted">Carregando o tempo…</p></div>
  <div class="stack">${cards}</div>
  <button class="btn block " data-act="addDay">+ Adicionar dia de folga</button>`;
}
function dayForm(d) {
  const opts = Object.entries(CIRCUITS).map(([k, c]) => `<option value="${k}" ${d.circ === k ? "selected" : ""}>${esc(c.name)}</option>`).join("");
  openSheet(`<h3>Editar dia</h3>
    <form id="dayF" class="stack">
      <div class="grid2"><label class="field"><span>Data</span><input id="dDate" type="date" value="${d.date}" required></label>
      <label class="field"><span>Saída</span><input id="dSaida" type="time" value="${esc(d.saida || "")}"></label></div>
      <label class="field"><span>Título</span><input id="dTitle" value="${esc(d.title)}" required></label>
      <div class="grid2"><label class="field"><span>Tipo / circuito</span><select id="dCirc">${opts}</select></label>
      <label class="field"><span>Km de moto</span><input id="dKm" inputmode="decimal" value="${d.km ?? ""}"></label></div>
      <label class="field"><span>Caminho / cidades</span><input id="dVia" value="${esc(d.via || "")}"><small>Separe com “ · ”. Usado no tempo, no abastecimento e no Modo pilotando.</small></label>
      <label class="field"><span>Rota no Google Maps (link)</span><input id="dGm" inputmode="url" value="${esc(d.gmaps || "")}" placeholder="https://maps.app.goo.gl/…"><small>No Google Maps, monte a rota do jeito que vocês vão, toque em Compartilhar e cole o link aqui. O botão Google Maps passa a abrir exatamente essa rota.</small></label>
      <label class="field"><span>Observações</span><textarea id="dNotes">${esc(d.notes || "")}</textarea></label>
      <div class="actions"><button type="button" class="btn danger" id="dDel">Remover</button><button class="btn primary" type="submit">Salvar</button></div>
    </form>`, sh => {
    sh.querySelector("#dayF").addEventListener("submit", e => {
      e.preventDefault();
      const nd = { ...d, date: $("#dDate").value || d.date, saida: $("#dSaida").value, title: $("#dTitle").value.trim() || d.title, circ: $("#dCirc").value,
        tipo: ["c1", "c2", "c3"].includes($("#dCirc").value) ? "passeio" : $("#dCirc").value === "folga" ? "folga" : "estrada",
        km: parseNum($("#dKm").value), via: $("#dVia").value.trim(), notes: $("#dNotes").value.trim(), gmaps: /^https?:\/\//.test($("#dGm").value.trim()) ? $("#dGm").value.trim() : "" };
      store.merge("trip", { days: S.trip.days.map(x => x.id === d.id ? nd : x) }); closeSheet(); toast("Dia salvo");
    });
    let armed = false;
    sh.querySelector("#dDel").addEventListener("click", e => {
      if (!armed) { armed = true; e.target.textContent = "Toque de novo para remover"; return; }
      store.merge("trip", { days: S.trip.days.filter(x => x.id !== d.id).map(x => x.date > d.date ? { ...x, date: addDays(x.date, -1) } : x) });
      closeSheet(); toast("Dia removido · datas seguintes recuaram 1 dia");
    });
  });
}
function shiftForm() {
  const ds = days(); const cur = ds[0]?.date || S.trip.startDate;
  openSheet(`<h3>Mudar data de saída</h3><p class="muted">Todos os dias andam juntos, mantendo a mesma sequência.</p>
    <form id="shF" class="stack"><label class="field"><span>Nova data de saída</span><input id="shDate" type="date" value="${cur}" required></label>
    <div class="actions"><button type="button" class="btn" data-close="1">Cancelar</button><button class="btn primary">Aplicar</button></div></form>`, sh => {
    sh.querySelector("#shF").addEventListener("submit", e => {
      e.preventDefault(); const nv = $("#shDate").value; if (!nv) return;
      const off = diffDays(cur, nv);
      store.merge("trip", { startDate: nv, days: S.trip.days.map(d => ({ ...d, date: addDays(d.date, off) })) });
      closeSheet(); toast("Datas atualizadas");
    });
  });
}

/* ---------- CHECKLIST ---------- */
function legendOpen() { try { return localStorage.getItem("legendClosed") !== "1"; } catch (e) { return true; } }
function riderSeg(withAll) {
  const ids = riderIds(); const cur = withAll ? expFilter : viewRider;
  return `<div class="seg" role="group">${withAll ? `<button data-act="${withAll}" data-v="todos" aria-pressed="${cur === "todos"}">Todos</button>` : ""}${ids.map(id => `<button data-act="${withAll || "vr"}" data-v="${id}" aria-pressed="${cur === id}">${esc(rname(id))}</button>`).join("")}</div>`;
}
function checklist() {
  const rid = viewRider, p = progress(rid), edit = canEdit(rid);
  const order = ["tenho", "nao", "rev", "avaliar", "prov"], colors = { tenho: "var(--ok)", nao: "var(--muted)", rev: "var(--warn)", avaliar: "var(--line)", prov: "var(--bad)" };
  const statuses = rid === "jaco" ? ["tenho", "prov", "rev", "nao"] : ["avaliar", "tenho", "prov", "rev", "nao"];
  const groups = CHECKLIST.map(([name, items]) => {
    const vis = items.filter(i => clFilter === "all" || itemStatus(rid, i[0]) === clFilter); if (!vis.length) return "";
    const done = items.filter(i => ["tenho", "nao"].includes(itemStatus(rid, i[0]))).length;
    return `<div class="group"><h3>${esc(name)}<small>${done}/${items.length}</small></h3>${vis.map(([id, nm, , note]) => {
      const s = itemStatus(rid, id);
      return `<div class="item"><div>${esc(nm)}${note && rid === "jaco" ? `<small>${esc(note)}</small>` : ""}</div>
        <div class="seg status" role="group" aria-label="${esc(nm)}">${(statuses.includes(s) ? statuses : [s, ...statuses]).map(k => `<button data-act="st" data-id="${id}" data-s="${k}" aria-pressed="${s === k}" ${edit ? "" : "disabled"}>${STATUS[k].short}</button>`).join("")}</div></div>`;
    }).join("")}</div>`;
  }).join("");
  const fl = [["all", "Todos"], ["prov", "Providenciar"], ["rev", "Revisar"], ...(p.c.avaliar ? [["avaliar", "Avaliar"]] : []), ["tenho", "Pronto"], ["nao", "Não preciso"]];
  return `
  <div class="between"><h2>Checklist</h2>${riderSeg()}</div>
  <div class="card stack">
    <div class="between"><div style="font-family:var(--f-display);font-weight:800;font-size:2rem;line-height:1">${p.pct}% pronto</div><span class="muted" style="font-size:.85rem">${esc(S.riders[rid].moto || "")}</span></div>
    <div class="bar">${order.map(k => `<i style="width:${p.c[k] / p.total * 100}%;background:${colors[k]}"></i>`).join("")}</div>
    <div class="counts">${["tenho", "prov", "rev", "avaliar", "nao"].filter(k => p.c[k] || k !== "avaliar").map(k => `<span>${STATUS[k].label}: <b>${p.c[k]}</b></span>`).join("")}</div>
    ${edit ? "" : `<p class="note">Só ${esc(rname(rid))} altera este checklist. Você está vendo para consulta.</p>`}
    ${rid !== "jaco" && p.c.avaliar ? `<p class="note">Lista começa em “Avaliar”. ${esc(rname(rid))} marca cada item conforme a situação da Titan e do equipamento dele.</p>` : ""}
  </div>
  <details class="card legend" id="clLegend" ${legendOpen() ? "open" : ""}><summary>O que significa cada status?</summary>
    <dl class="kv" style="margin-top:10px"><dt><span class="chip s-ok">Pronto</span></dt><dd>Tenho e está em condições, ou já comprei, consertei ou reservei. Não preciso mexer.</dd>
    <dt><span class="chip s-bad">Providenciar</span></dt><dd>Falta comprar, conseguir, reservar ou consertar.</dd>
    <dt><span class="chip s-pend">Revisar</span></dt><dd>Tenho, mas preciso conferir antes de ir (ex.: suspensão).</dd>
    <dt><span class="chip s-mute">Não preciso</span></dt><dd>Decidi não levar ou não fazer.</dd>
    <dt><span class="chip s-mute">Avaliar</span></dt><dd>Ainda não decidi. É como o checklist começa para quem não preencheu.</dd></dl></details>
  <div class="filters">${fl.map(([k, l]) => `<button class="fbtn" data-act="clf" data-v="${k}" aria-pressed="${clFilter === k}">${l}</button>`).join("")}</div>
  <div>${groups || `<p class="muted">Nenhum item com esse status.</p>`}</div>`;
}

/* ---------- GASTOS ---------- */
const normCat = c => CAT_ALIAS[c] || c;
// Categorias criadas em “Outros”: cada piloto guarda as suas no próprio perfil; todos usam todas
const customCats = () => { const o = {}; Object.values(S.riders || {}).forEach(r => Object.assign(o, r.cats || {})); return o; };
const allCats = () => { const { outros, ...base } = CATS; return { ...base, ...customCats(), outros }; };
const catLabel = c => { const k = normCat(c); return allCats()[k] || CATS[k] || k; };
// Gastos da viagem = os lançados na viagem + os da preparação que o dono escolheu exibir
const tripExpenses = () => expenses().filter(e => !(e.cat in LEGACY_PREP) || e.fromPrep);
const prepExpenses = () => Object.entries(S.prep || {}).map(([id, e]) => ({ id, ...e })).sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.created || 0) - (a.created || 0));
const sumAmt = l => l.reduce((s, e) => s + (Number(e.amount) || 0), 0);
const byDate = (a, b) => (b.date || "").localeCompare(a.date || "") || (b.created || 0) - (a.created || 0);
function myTripCost(rid) { // o que cabe a cada um: o que pagou sozinho + metade dos divididos (exibidos da preparação não entram)
  const l = tripExpenses().filter(e => !e.fromPrep), n = riderIds().length || 1;
  return sumAmt(l.filter(e => !e.shared && e.rider === rid)) + sumAmt(l.filter(e => e.shared)) / n;
}
function catBars(list) {
  const byCat = {}; list.forEach(e => { const k = normCat(e.cat); byCat[k] = (byCat[k] || 0) + (Number(e.amount) || 0); });
  if (!Object.keys(byCat).length) return "";
  const max = Math.max(1, ...Object.values(byCat));
  return `<div class="card stack"><h3>Por categoria</h3>${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="catrow"><span>${esc(catLabel(k))}</span><span class="b"><i style="width:${v / max * 100}%"></i></span><span class="num">${brl(v)}</span></div>`).join("")}</div>`;
}
// kind: "trip" (gasto da viagem), "prep" (meu, privado); src marca de onde veio na lista Meus gastos
function expRows(list, view) {
  return list.map(e => {
    const kind = e._src || (e.fromPrep ? "prep" : "trip");
    const tags = [e.shared ? `<span class="chip s-est">dividido</span>` : "",
      view === "trip" && e.fromPrep ? `<span class="chip s-mute">exibido da preparação</span>` : "",
      view === "mine" && kind === "prep" ? (e.show ? `<span class="chip s-ok">exibido</span>` : `<span class="chip s-mute">🔒 privado</span>`) : "",
      view === "mine" && kind === "trip" ? `<span class="chip s-est">da viagem</span>` : ""].join(" ");
    return `<button class="exp" data-act="editExp" data-kind="${kind}" data-id="${e.id}">
      <span class="t">${esc(e.desc || catLabel(e.cat) || "Gasto")}</span><span class="v">${brl(e.amount)}</span>
      <span class="m">${e.date ? wd(e.date) + " " + fmtD(e.date) + " · " : ""}${esc(catLabel(e.cat))}${view === "trip" ? " · " + esc(rname(e.rider)) : ""}${e.liters ? ` · ${num(e.liters, 2)} L a ${brl(e.ppl)}` : ""}</span>
      <span class="m">${tags}</span></button>`; }).join("");
}
function gastos() {
  const tabs = `<div class="seg tabs2" role="tablist"><button data-act="gtab" data-v="trip" aria-pressed="${gastosTab === "trip"}">Gastos da viagem</button><button data-act="gtab" data-v="prep" aria-pressed="${gastosTab === "prep"}">Meus gastos</button></div>`;
  if (gastosTab === "prep") {
    const m = me() || riderIds()[0];
    const prep = prepExpenses().map(e => ({ ...e, _src: "prep" }));
    const trip = tripExpenses().filter(e => e.rider === m && !e.fromPrep).map(e => ({ ...e, _src: "trip" }));
    const list = [...prep, ...trip].sort(byDate);
    const err = ST.mode === "cloud" && ST.prepError ? `<div class="warnbox">${esc(ST.prepError)}</div>` : "";
    const other = rname(riderIds().find(i => i !== me()) || "");
    return `<h2>Gastos</h2>${tabs}${err}
    <div class="infobox">🔒 <b>Só você vê esta aba.</b> Ela soma tudo o que você gastou: a preparação e o que você pagou na viagem. ${ST.mode === "cloud" ? `Para mostrar um gasto da preparação ao ${esc(other)}, abra o gasto e ligue <b>Exibir para o grupo</b>.` : "No modo local ela fica só neste aparelho."}</div>
    <div class="stats"><div class="stat"><div class="v" style="font-size:1.5rem">${brl(sumAmt(list))}</div><div class="k">total geral</div></div>
      <div class="stat"><div class="v" style="font-size:1.5rem">${brl(sumAmt(prep))}</div><div class="k">preparação</div></div>
      <div class="stat"><div class="v" style="font-size:1.5rem">${brl(sumAmt(trip))}</div><div class="k">pago por você na viagem</div></div>
      <div class="stat"><div class="v" style="font-size:1.5rem">${brl(sumAmt(prep.filter(e => e.show)))}</div><div class="k">exibido para o grupo</div></div></div>
    ${catBars(list)}
    ${list.length ? `<div class="row"><button class="btn sm" data-act="exportCSV" data-v="prep">Exportar planilha</button></div>` : ""}
    <div class="stack">${list.length ? expRows(list, "mine") : `<div class="card"><p class="muted">Nada lançado ainda. Use “+ Gasto” para registrar revisão, peças, pneus, equipamento, bagagem…</p></div>`}</div>
    <button class="fab" data-act="newExp" data-kind="prep">+ Gasto</button>`;
  }
  const all = tripExpenses(); const list = expFilter === "todos" ? all : all.filter(e => e.rider === expFilter);
  const fuelL = list.filter(e => e.cat === "combustivel").reduce((s, e) => s + (Number(e.liters) || 0), 0);
  const st = settlement();
  return `<h2>Gastos</h2>${tabs}
  <div class="between"><span class="muted" style="font-size:.88rem">Os dois veem. Marque “dividir” no que for dos dois.</span>${riderSeg("ef")}</div>
  <div class="stats">
    <div class="stat"><div class="v" style="font-size:1.5rem">${brl(sumAmt(list))}</div><div class="k">${expFilter === "todos" ? "total exibido" : "pago por " + esc(rname(expFilter))}</div></div>
    <div class="stat"><div class="v" style="font-size:1.5rem">${brl(sumAmt(list.filter(e => e.shared)))}</div><div class="k">dividido</div></div>
    <div class="stat"><div class="v" style="font-size:1.5rem">${brl(myTripCost(me() || riderIds()[0]))}</div><div class="k">sua parte na viagem</div></div>
    <div class="stat"><div class="v" style="font-size:1.5rem">${num(fuelL, 2)} L</div><div class="k">combustível lançado</div></div>
  </div>
  <div class="card"><h3>Acerto de contas</h3><p class="settle" style="margin-top:6px">${esc(settleText())}</p>
    ${st.total ? `<p class="muted" style="font-size:.85rem;margin-top:4px">Divididos: ${brl(st.total)} · ${brl(st.share)} para cada um</p>` : ""}</div>
  ${catBars(list)}
  ${all.length ? `<div class="row"><button class="btn sm" data-act="exportCSV" data-v="trip">Exportar planilha</button></div>` : ""}
  <div class="stack">${list.length ? expRows(list, "trip") : `<div class="card"><p class="muted">Nenhum gasto da viagem ainda. Use “+ Gasto” para combustível, pousada, comida, pedágio, guia…</p></div>`}</div>
  <button class="fab" data-act="newExp" data-kind="trip">+ Gasto</button>`;
}
function expForm(e, kind) {
  const isNew = !e; const m = me() || riderIds()[0]; const prep = kind === "prep";
  const cats = allCats();
  e = e || { rider: m, cat: prep ? "moto" : "combustivel", date: todayISO(), amount: "", desc: "", shared: false, show: false, liters: "", ppl: S.trip.gasPrice };
  // um gasto exibido da preparação de outra pessoa abre só para leitura
  const othersPrep = prep && !isNew && e.fromPrep && e.rider !== m;
  const readonly = othersPrep || (!prep && !isNew && !canEdit(e.rider));
  const riders = riderIds().filter(id => ST.mode === "local" || id === m || id === e.rider);
  if (e.cat) e = { ...e, cat: normCat(e.cat) };
  const fuelLog = !prep && e.fromLog ? S.riders?.[e.rider]?.diario?.[e.fromLog] : null;
  const catList = othersPrep ? { [e.cat]: catLabel(e.cat) } : (e.cat in cats ? cats : { ...cats, [e.cat]: catLabel(e.cat) });
  openSheet(`<h3>${isNew ? "Novo gasto" : readonly ? "Gasto" : "Editar gasto"}</h3>
   <p class="muted" style="font-size:.85rem">${othersPrep ? `Gasto da preparação que ${esc(rname(e.rider))} escolheu exibir.` : prep ? "🔒 Meus gastos: só você vê, a menos que ligue “Exibir para o grupo”." : "Gasto da viagem: os dois veem."}</p>
   <form id="expF" class="stack">
    <fieldset ${readonly ? "disabled" : ""} style="border:0;padding:0;margin:0;display:grid;gap:12px;min-width:0">
    <div class="grid2">${prep ? "" : `<label class="field"><span>Quem pagou</span><select id="eRider">${riders.map(id => `<option value="${id}" ${e.rider === id ? "selected" : ""}>${esc(rname(id))}</option>`).join("")}</select></label>`}
    <label class="field"><span>Categoria</span><select id="eCat">${Object.entries(catList).map(([k, l]) => `<option value="${k}" ${e.cat === k ? "selected" : ""}>${l}</option>`).join("")}${othersPrep ? "" : `<option value="__new__">+ Nova categoria…</option>`}</select></label></div>
    <label class="field" id="newCatBox" hidden><span>Nome da nova categoria</span><input id="eNewCat" maxlength="30" placeholder="Ex.: Lavagem da moto"><small>Ela fica salva e aparece na lista para os próximos gastos.</small></label>
    <label class="field"><span>Descrição</span><input id="eDesc" value="${esc(e.desc)}" placeholder="${prep ? "Ex.: pneu dianteiro, kit relação, luvas" : "Ex.: posto em Salgueiro, pousada, almoço"}"></label>
    <div id="fuelBox" class="grid2" ${e.cat === "combustivel" ? "" : "hidden"}>
      <label class="field"><span>Litros</span><input id="eL" inputmode="decimal" value="${e.liters ?? ""}"></label>
      <label class="field"><span>R$ por litro</span><input id="ePpl" inputmode="decimal" value="${e.ppl ?? ""}"></label>
      ${prep ? "" : `<label class="field"><span>Hodômetro (km)</span><input id="eOdo" inputmode="numeric" value="${fuelLog?.odo ?? ""}" placeholder="total da moto"><small>Opcional: entra no Diário de bordo e calcula o consumo real</small></label>
      <label class="check" style="align-self:center"><input type="checkbox" id="eFull" ${fuelLog?.cheio === false ? "" : "checked"}> Tanque cheio</label>`}</div>
    <div class="grid2"><label class="field"><span>Valor (R$)</span><input id="eAmt" inputmode="decimal" value="${e.amount ?? ""}" required></label>
    <label class="field"><span>Data</span><input id="eDate" type="date" value="${e.date || ""}"></label></div>
    ${prep ? (othersPrep ? "" : `<label class="check"><input type="checkbox" id="eShow" ${e.show ? "checked" : ""}> Exibir para o grupo <small class="muted" style="font-weight:500">(aparece em Gastos da viagem)</small></label>`)
      : `<label class="check"><input type="checkbox" id="eShared" ${e.shared ? "checked" : ""}> Dividir entre os dois</label>`}
    </fieldset>
    <p class="err" id="eErr" hidden></p>
    <div class="actions">${isNew || readonly ? `<button type="button" class="btn" data-close="1">${readonly ? "Fechar" : "Cancelar"}</button>` : `<button type="button" class="btn danger" id="eDel">Excluir</button>`}${readonly ? "" : `<button class="btn primary">Salvar</button>`}</div>
   </form>`, sh => {
    const cat = sh.querySelector("#eCat"), L = sh.querySelector("#eL"), P = sh.querySelector("#ePpl"), A = sh.querySelector("#eAmt"), shared = sh.querySelector("#eShared"), show = sh.querySelector("#eShow");
    let autoAmt = isNew;
    const recalc = () => { const l = parseNum(L.value), p = parseNum(P.value); if (autoAmt && cat.value === "combustivel" && l && p) A.value = (l * p).toFixed(2); };
    L.addEventListener("input", recalc); P.addEventListener("input", recalc); A.addEventListener("input", () => { autoAmt = false; });
    const syncNew = () => { const on = cat.value === "__new__"; sh.querySelector("#newCatBox").hidden = !on; if (on) sh.querySelector("#eNewCat").focus(); };
    cat.addEventListener("change", syncNew);
    cat.addEventListener("change", () => { sh.querySelector("#fuelBox").hidden = cat.value !== "combustivel"; if (isNew && shared) shared.checked = ["hospedagem", "passeio", "estacionamento"].includes(cat.value); });
    sh.querySelector("#expF").addEventListener("submit", ev => {
      ev.preventDefault(); const amt = parseNum(A.value);
      if (!amt || amt <= 0) { const er = sh.querySelector("#eErr"); er.hidden = false; er.textContent = "Informe o valor do gasto."; return; }
      const id = isNew ? newId() : e.id;
      let catKey = cat.value;
      const newName = cat.value === "__new__" ? sh.querySelector("#eNewCat").value.trim() : "";
      if (cat.value === "__new__" && !newName) { const er = sh.querySelector("#eErr"); er.hidden = false; er.textContent = "Digite o nome da nova categoria."; sh.querySelector("#eNewCat").focus(); return; }
      if (newName) {
        const existing = Object.entries(allCats()).find(([, l]) => l.toLowerCase() === newName.toLowerCase());
        if (existing) catKey = existing[0];
        else { catKey = "c_" + slug(newName); store.merge("riders/" + m, { cats: { [catKey]: newName } }); }
      }
      const data = { cat: catKey, desc: sh.querySelector("#eDesc").value.trim(), amount: Math.round(amt * 100) / 100, date: sh.querySelector("#eDate").value,
        liters: cat.value === "combustivel" ? parseNum(L.value) : null, ppl: cat.value === "combustivel" ? parseNum(P.value) : null, created: e.created || Date.now() };
      if (prep) {
        const vis = !!show?.checked;
        store.putPrep(id, { ...data, show: vis });
        // cópia pública só com o que o dono decidiu mostrar
        if (vis) store.put("expenses", id, { ...data, rider: m, shared: false, fromPrep: true });
        else if (S.expenses?.[id]?.fromPrep) store.remove("expenses", id);
      } else {
        const rider = sh.querySelector("#eRider").value, odo = catKey === "combustivel" ? parseNum(sh.querySelector("#eOdo")?.value) : null;
        if (odo && data.liters && canEdit(rider)) { // abastecimento com hodômetro também vai para o Diário de bordo
          const lid = e.fromLog || newId();
          store.merge("riders/" + rider, { diario: { [lid]: { date: data.date, odo: Math.round(odo), litros: data.liters, ppl: data.ppl, cheio: !!sh.querySelector("#eFull")?.checked, local: data.desc.replace(/^Abastecimento( em)?\s*/i, ""), exp: id } } });
          data.fromLog = lid;
        } else if (e.fromLog) data.fromLog = e.fromLog;
        store.put("expenses", id, { ...data, rider, shared: shared.checked });
      }
      closeSheet(); toast(isNew ? "Gasto lançado" : "Gasto salvo");
    });
    const del = sh.querySelector("#eDel"); let armed = false;
    del && del.addEventListener("click", () => { if (!armed) { armed = true; del.textContent = "Toque de novo para excluir"; return; }
      if (prep) { store.removePrep(e.id); if (S.expenses?.[e.id]?.fromPrep) store.remove("expenses", e.id); }
      else { store.remove("expenses", e.id); if (e.fromLog && canEdit(e.rider)) store.merge("riders/" + e.rider, { diario: { [e.fromLog]: null } }); }
      closeSheet(); toast(e.fromLog ? "Gasto excluído (e o abastecimento no Diário)" : "Gasto excluído"); });
  });
}
function openExpense(id, kind) {
  if (kind === "prep") {
    const own = S.prep?.[id];
    if (own) return expForm({ id, ...own }, "prep");
    const pub = S.expenses?.[id]; if (pub) return expForm({ id, ...pub }, "prep"); // exibido por outra pessoa
    return;
  }
  const t = S.expenses?.[id]; if (t) expForm({ id, ...t }, "trip");
}
// Gastos antigos de manutenção/equipamento (v1.0/1.1) passam para os gastos privados de quem pagou
let migrating = false;
// Rota corrigida (v1.14.3): troca o caminho antigo que vinha no app pelo caminho combinado.
// Só mexe nos dias que ainda estão com o texto/km antigos; o que o grupo editou fica como está.
const ROUTE_V = 3;
function migrateRoute() {
  if (!S.trip || (S.trip.routeV || 0) >= ROUTE_V || (ST.mode === "cloud" && !ST.user)) return;
  const N1 = "Catolé do Rocha · Sousa · Cajazeiras · Brejo Santo · Salgueiro · Cabrobó · Petrolina";
  const N2 = "Petrolina/Juazeiro · Senhor do Bonfim · Jacobina · Morro do Chapéu · Utinga · Wagner · BR-242 · Lençóis";
  let changed = false;
  const nd = S.trip.days.map(d => {
    const [o, de] = tripEnds(d).map(x => low(cleanCity(x))); let x = d;
    if (o.startsWith("catole") && de.startsWith("petrolina") && (/pombal/i.test(d.via || "") || [548, 563].includes(Number(d.km)))) {
      x = { ...d, via: N1, km: 565, notes: /BR-407 como refer|PB-325 → BR-230 → BR-116/.test(d.notes || "") || !d.notes ? "PB-325 até o trevo da BR-230 (sem entrar em Pombal), à direita sentido Sousa → BR-116 pelo Ceará → BR-232 → BR-428. Chegar de dia." : d.notes }; }
    else if (o.startsWith("petrolina") && de.startsWith("lencois") && /capim grosso|ruy barbosa|mairi/i.test(d.via || "")) {
      x = { ...d, via: N2, km: 528, notes: (d.notes || "").includes("BR-407 → BA-131") ? d.notes : ("BR-407 → BA-131 → BR-324 → BA-144 (Morro do Chapéu) → BA-046/BA-142 → BR-242. " + (d.notes || "")).trim() }; }
    else if (o.startsWith("lencois") && de.startsWith("petrolina") && [487].includes(Number(d.km))) x = { ...d, km: 528 };
    else if (o.startsWith("petrolina") && de.startsWith("catole") && [548, 563].includes(Number(d.km))) x = { ...d, km: 565 };
    if (x !== d) changed = true; return x;
  });
  store.merge("trip", changed ? { days: nd, routeV: ROUTE_V } : { routeV: ROUTE_V });
  if (changed) toast("Roteiro atualizado com a rota corrigida (sem Pombal, ida por Jacobina e Morro do Chapéu)");
}
function migrateLegacy() {
  if (migrating) return; const m = me(); if (!m) return;
  if (ST.mode === "cloud" && (!ST.uid || ST.prepError)) return;
  const old = expenses().filter(e => e.rider === m && (e.cat in LEGACY_PREP) && !e.fromPrep);
  if (!old.length) return; migrating = true;
  Promise.all(old.map(e => { const { id, rider, shared, ...rest } = e;
    return store.putPrep(id, { ...rest, cat: LEGACY_PREP[e.cat] }).then(() => store.remove("expenses", id)); }))
    .then(() => toast(`${old.length} ${old.length === 1 ? "gasto foi" : "gastos foram"} para Meus gastos`))
    .finally(() => { migrating = false; });
}

/* ---------- MAIS ---------- */
function mais() {
  const conf = Object.values(S.lodging || {}).filter(l => l.status === "confirmada").length;
  const open = PEND.length + Object.keys(S.pend?.custom || {}).length - Object.keys(S.pend?.done || {}).length;
  return `<h2>Mais</h2><div class="menu">
    <a href="#hospedagem">Hospedagem <span class="muted">${conf}/3 confirmadas</span></a>
    <a href="#pendencias">Pendências <span class="muted">${open} abertas</span></a>
    <a href="#pilotos">Pilotos e motos <span class="muted">consumo e autonomia</span></a>
    <a href="#ajustes">Ajustes e sincronização <span class="muted">${ST.mode === "local" ? "modo local" : esc(ST.user || "")}</span></a></div>`;
}
const backLink = `<button class="back" type="button" data-act="openMenu">← Menu</button>`;
const ICON = {
  hosp: '<path d="M3 20V8l9-5 9 5v12"/><path d="M9 20v-6h6v6"/>',
  pend: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  moto: '<circle cx="6" cy="16" r="3"/><circle cx="18" cy="16" r="3"/><path d="M6 16l4-7h4l4 7M10 9l-1-3H7"/>',
  book: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 11h6M9 15h4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  out:  '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  ride: '<circle cx="12" cy="12" r="9"/><path d="M12 12l4-3M12 3v2M3 12h2M19 12h2"/>',
  fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M6 9h6"/><path d="M14 10h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V8l-3-3"/>',
};
const mi = (href, icon, label, extra) => `<a href="${href}" class="mitem"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[icon]}</svg><span>${label}</span>${extra ? `<small>${extra}</small>` : ""}</a>`;
const revTag = id => { const n = id ? revOf(id).filter(x => !x.done).length : 0; return n ? `${n} a fazer` : "manutenção"; };
const consumoTag = id => { const r = id && logStats(id).real; return r ? `${num(r, 1)} km/L real` : "consumo real"; };
function openMenu() {
  const conf = Object.values(S.lodging || {}).filter(l => l.status === "confirmada").length;
  const open = PEND.length + Object.keys(S.pend?.custom || {}).length - Object.keys(S.pend?.done || {}).length;
  const m = me(), r = S.riders?.[m] || {};
  const ds = days(), t = todayISO(), start = ds[0]?.date;
  const left = start && t < start ? diffDays(t, start) : null;
  const sync = ST.mode === "local" ? "Modo local" : ST.error ? "Erro de sincronização" : !ST.online ? (ST.pending ? "Offline · na fila" : "Offline") : ST.pending ? "Enviando…" : "Sincronizado";
  $("#layer").innerHTML = `<div class="drawer-bg" data-close="1"><nav class="drawer" aria-label="Menu">
    <div class="between"><span class="label">Menu</span><button class="x" data-close="1" aria-label="Fechar">×</button></div>
    <div class="me-card"><div class="avatar">${esc((r.name || "?").slice(0, 1))}</div>
      <div style="min-width:0"><b>${esc(r.name || "Sem perfil")}</b>${isAdmin() && ST.mode === "cloud" ? ` <span class="chip s-est">admin</span>` : ""}
      <small>${esc(r.moto || "")}</small>${ST.mode === "cloud" && ST.user ? `<small>${esc(ST.user)}</small>` : ""}</div></div>
    <div class="mini-stats"><div><b>${left != null ? left : "—"}</b><small>${left != null ? (left === 1 ? "dia para a saída" : "dias para a saída") : "viagem em curso"}</small></div>
      <div><b class="dotline ${ST.mode === "local" ? "" : ST.error ? "err" : !ST.online ? "off" : "on"}">●</b><small>${sync}</small></div></div>
    <div class="mgroup"><div class="label">Viagem</div>
      ${mi("#novidades", "bell", "Novidades", (() => { const n = events().filter(e => e.at > seenGet()).length; return n ? `<b class="newtag">${n} nova${n > 1 ? "s" : ""}</b>` : "em dia"; })())}
      ${mi("#resumo", "star", "Resumo da expedição", `${photos().length} fotos`)}
      ${mi("#hospedagem", "hosp", "Hospedagem", `${conf}/3 confirmadas`)}
      ${mi("#pendencias", "pend", "Pendências", `${open} abertas`)}
      ${mi("#pilotos", "moto", "Pilotos e motos", `${riderIds().length} pilotos`)}
      ${mi("#roadbook", "book", "Roadbook", "10×15 · PDF")}</div>
    <div class="mgroup"><div class="label">Na estrada</div>
      ${mi("#seguranca", "shield", "Segurança", "localização e fichas")}
      ${mi("#pilotando", "ride", "Modo pilotando", "tela grande")}
      ${mi("#diario", "fuel", "Diário de bordo", consumoTag(m))}
      ${mi("#revisao", "wrench", "Revisão das motos", revTag(m))}</div>
    <div class="mgroup"><div class="label">App</div>
      ${mi("#ajustes", "gear", "Ajustes", "gasolina e backup")}
      ${mi("#sobre", "info", "Sobre", `versão ${esc(self.APP_VERSION || "?")}`)}</div>
    <div class="mgroup"><div class="label">Aparência</div>${themeSeg()}</div>
    ${ST.mode === "cloud" ? `<button class="mitem out" type="button" data-menu="logout"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON.out}</svg><span>Sair da conta</span></button>` : ""}
    <p class="muted" style="font-size:.78rem">© 2026 ${esc(about().author)}</p></nav></div>`;
  const bg = $("#layer").firstElementChild;
  let armed = false;
  bg.addEventListener("click", e => {
    const lo = e.target.closest("[data-menu=logout]");
    if (lo) { if (!armed) { armed = true; lo.querySelector("span").textContent = "Toque de novo para sair"; return; } $("#layer").innerHTML = ""; store.signOut(); return; }
    if (e.target.dataset.close || e.target.closest("a")) $("#layer").innerHTML = "";
  });
}
$("#menuBtn").addEventListener("click", () => openMenu());

function hospedagem() {
  const ds = days();
  const all = Object.entries(S.lodging || {}).map(([id, l]) => ({ id, ...l }));
  const sec = Object.entries(ETAPAS).map(([k, et]) => {
    const retIdx = ds.findIndex((x, i) => i > 1 && x.circ === "estrada");
    const r = retIdx > 1 ? retIdx : ds.length - 1;
    const [d, checkout] = k === "petrolina_ida" ? [ds[0], ds[1]] : k === "lencois" ? [ds[1], ds[r]] : [ds[r], ds[r + 1]];
    const nights = d && checkout ? diffDays(d.date, checkout.date) : null;
    const ls = all.filter(l => l.etapa === k);
    const chosen = ls.filter(l => l.status !== "opcao"), opts = ls.filter(l => l.status === "opcao");
    const card = l => `<div class="card lodge ${l.status}">
      <div class="between"><span class="name">${esc(l.name)}</span>${l.status === "confirmada" ? `<span class="chip s-ok">confirmada</span>` : l.status === "escolhida" ? `<span class="chip s-pend">escolhida · falta reservar</span>` : `<span class="chip s-mute">opção</span>`}</div>
      <dl class="kv">${l.price ? `<dt>Valor</dt><dd class="num">${brl(l.price)}${l.priceNote ? ` <span class="muted">· ${esc(l.priceNote)}</span>` : ""}</dd>` : ""}
        ${l.address ? `<dt>Endereço</dt><dd>${esc(l.address)}</dd>` : ""}${l.parking ? `<dt>Estacion.</dt><dd>${esc(l.parking)}</dd>` : ""}${l.notes ? `<dt>Notas</dt><dd>${esc(l.notes)}</dd>` : ""}</dl>
      <div class="row">${l.link ? `<a class="btn sm" href="${esc(l.link)}" target="_blank" rel="noopener">Abrir link</a>` : ""}<button class="btn sm" data-act="editLodge" data-id="${l.id}">Editar</button>
        <div class="seg" role="group">${[["opcao", "Opção"], ["escolhida", "Escolhida"], ["confirmada", "Confirmada"]].map(([s, t]) => `<button data-act="lst" data-id="${l.id}" data-s="${s}" aria-pressed="${l.status === s}">${t}</button>`).join("")}</div></div></div>`;
    return `<div class="stack"><div class="between"><h3>${esc(et.name)}</h3><span class="muted num" style="font-size:.85rem">${d ? `${fmtD(d.date)} → ${checkout ? fmtD(checkout.date) : "?"}${nights ? ` · ${nights} ${nights === 1 ? "noite" : "noites"}` : ""}` : ""}</span></div>
      ${chosen.map(card).join("")}
      ${chosen.length && opts.length ? `<details><summary class="muted" style="cursor:pointer;font-weight:700">Outras opções (${opts.length})</summary><div class="stack" style="margin-top:8px">${opts.map(card).join("")}</div></details>` : opts.map(card).join("")}
      ${!ls.length ? `<p class="muted">Nenhuma opção cadastrada.</p>` : ""}
      <button class="btn sm " data-act="newLodge" data-etapa="${k}">+ Opção em ${esc(et.name.split(" ·")[0])}</button></div>`;
  }).join("");
  return `${backLink}<h2>Hospedagem</h2><p class="note">Cadastre as opções. Ao marcar uma como escolhida ou confirmada, ela sobe para o topo e as outras ficam guardadas em “Outras opções”.</p>${sec}`;
}
function lodgeForm(l, etapa) {
  const isNew = !l; l = l || { etapa, name: "", price: "", priceNote: "", address: "", link: "", parking: "", notes: "", status: "opcao" };
  openSheet(`<h3>${isNew ? "Nova opção" : "Editar hospedagem"}</h3><form id="lgF" class="stack">
    <label class="field"><span>Etapa</span><select id="lEt">${Object.entries(ETAPAS).map(([k, e]) => `<option value="${k}" ${l.etapa === k ? "selected" : ""}>${e.name}</option>`).join("")}</select></label>
    <label class="field"><span>Nome</span><input id="lName" value="${esc(l.name)}" required></label>
    <div class="grid2"><label class="field"><span>Valor total (R$)</span><input id="lPrice" inputmode="decimal" value="${l.price ?? ""}"></label>
    <label class="field"><span>Estacionamento</span><input id="lPark" value="${esc(l.parking)}" placeholder="coberto, na rua, a confirmar…"></label></div>
    <label class="field"><span>Sobre o valor</span><input id="lPN" value="${esc(l.priceNote)}" placeholder="noites, pessoas, café incluso…"></label>
    <label class="field"><span>Link</span><input id="lLink" type="url" value="${esc(l.link)}"></label>
    <label class="field"><span>Endereço</span><input id="lAddr" value="${esc(l.address)}"></label>
    <label class="field"><span>Notas</span><textarea id="lNotes">${esc(l.notes)}</textarea></label>
    <div class="actions">${isNew ? `<button type="button" class="btn" data-close="1">Cancelar</button>` : `<button type="button" class="btn danger" id="lDel">Excluir</button>`}<button class="btn primary">Salvar</button></div></form>`, sh => {
    sh.querySelector("#lgF").addEventListener("submit", ev => {
      ev.preventDefault(); const name = $("#lName").value.trim(); if (!name) return;
      const id = isNew ? newId() : l.id; const { id: _, ...rest } = l;
      store.put("lodging", id, { ...rest, etapa: $("#lEt").value, name, price: parseNum($("#lPrice").value), priceNote: $("#lPN").value.trim(), parking: $("#lPark").value.trim(), link: $("#lLink").value.trim(), address: $("#lAddr").value.trim(), notes: $("#lNotes").value.trim() });
      closeSheet(); toast("Hospedagem salva");
    });
    const del = sh.querySelector("#lDel"); let armed = false;
    del && del.addEventListener("click", () => { if (!armed) { armed = true; del.textContent = "Toque de novo para excluir"; return; } store.remove("lodging", l.id); closeSheet(); });
  });
}

function pendencias() {
  const done = S.pend?.done || {}; const custom = Object.entries(S.pend?.custom || {}).map(([id, c]) => [id, c.prio || "Outros", c.t, c.d || "", true]);
  const all = [...PEND, ...custom]; const prios = ["Segurança", "Logística", "Passeios", "Trilhas", "Complementar", "Outros"];
  const col = p => p === "Segurança" ? "var(--bad)" : p === "Logística" ? "var(--warn)" : "var(--muted)";
  const open = all.filter(p => !done[p[0]]).length;
  return `${backLink}<div class="between"><h2>Pendências</h2><span class="muted">${open} de ${all.length} abertas</span></div>
  ${prios.map(pr => { const items = all.filter(p => p[1] === pr); if (!items.length) return "";
    return `<div class="stack"><div class="prio" style="color:${col(pr)}">${pr.toUpperCase()}</div>${items.map(([id, , t, d, isC]) => `
      <label class="pitem${done[id] ? " done" : ""}" for="pd-${id}"><input type="checkbox" id="pd-${id}" data-act="pd" data-id="${id}" ${done[id] ? "checked" : ""} >
      <div><div class="pt">${esc(t)}</div>${d ? `<div class="pd">${esc(d)}</div>` : ""}</div>${isC ? `<button class="x" data-act="delPend" data-id="${id}" aria-label="Remover">×</button>` : "<span></span>"}</label>`).join("")}</div>`; }).join("")}
  <button class="btn block " data-act="newPend">+ Nova pendência</button>`;
}
function pendForm() {
  openSheet(`<h3>Nova pendência</h3><form id="pF" class="stack">
    <label class="field"><span>O que falta</span><input id="pT" required></label>
    <label class="field"><span>Detalhe</span><input id="pD"></label>
    <label class="field"><span>Prioridade</span><select id="pP">${["Segurança", "Logística", "Passeios", "Trilhas", "Complementar", "Outros"].map(p => `<option>${p}</option>`).join("")}</select></label>
    <div class="actions"><button type="button" class="btn" data-close="1">Cancelar</button><button class="btn primary">Adicionar</button></div></form>`, sh => {
    sh.querySelector("#pF").addEventListener("submit", ev => { ev.preventDefault(); const t = $("#pT").value.trim(); if (!t) return;
      store.merge("meta/pend", { custom: { [newId()]: { t, d: $("#pD").value.trim(), prio: $("#pP").value } } }); closeSheet(); });
  });
}

function pilotos() {
  return `${backLink}<div class="between"><h2>Pilotos e motos</h2>${isAdmin() ? `<button class="btn sm" data-act="newRider">+ Adicionar piloto</button>` : ""}</div>
  ${riderIds().map(id => { const r = S.riders[id], f = fuelPlan(id);
    return `<div class="card stack"><div class="between"><h3>${esc(r.name)}</h3><span>${id === (S.trip?.admin || "jaco") ? `<span class="chip s-est">admin</span> ` : ""}${id === me() ? `<span class="chip s-ok">você</span>` : ""}</span></div>
      <dl class="kv"><dt>Moto</dt><dd>${esc(r.moto || "—")}</dd><dt>Consumo</dt><dd class="num">${r.consumo ? num(r.consumo, 1) + " km/L" : `<span class="chip s-pend">informar</span>`}</dd>
      <dt>Tanque</dt><dd class="num">${r.tanque ? num(r.tanque, 1) + " L" : "—"}</dd>
      ${f?.autonomia ? `<dt>Autonomia</dt><dd class="num">≈ ${num(f.autonomia)} km por tanque</dd>` : ""}
      ${f ? `<dt>Na viagem</dt><dd class="num">${num(f.litros)} L · ${brl0(f.custo)}</dd>` : ""}
      ${ST.mode === "cloud" ? `<dt>Conta</dt><dd>${esc(r.email || "não ligada")}</dd>` : ""}
      ${isAdmin() ? `<dt>ID do perfil</dt><dd class="num">${esc(id)}</dd>` : ""}</dl>
      <div class="row">${canEdit(id) || isAdmin() ? `<button class="btn sm" data-act="editRider" data-id="${id}">Editar</button>` : ""}${canEdit(id) || isAdmin() ? `<button class="btn sm" data-act="editSocial" data-id="${id}">Redes e contatos</button>` : ""}</div></div>`; }).join("")}
    <p class="note">A autonomia é teórica (tanque × consumo). Com bagagem e serra ela cai; planeje parar a cada 200–250 km.</p>
    ${isAdmin() && ST.mode === "cloud" ? `<p class="note">Para um piloto novo entrar no app: crie a conta dele em Firebase → Authentication e acrescente o e-mail com o <b>ID do perfil</b> na função <code>pilotos()</code> das regras do Firestore (README).</p>` : ""}`;
}
const slug = t => (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20) || "piloto";
function riderForm(id) {
  const isNew = !id; const r = isNew ? { name: "", moto: "", consumo: null, tanque: null } : S.riders[id];
  const removable = !isNew && isAdmin() && id !== (S.trip?.admin || "jaco");
  openSheet(`<h3>${isNew ? "Novo piloto" : esc(r.name)}</h3><form id="rF" class="stack">
    <label class="field"><span>Nome</span><input id="rN" value="${esc(r.name)}" required></label>
    <label class="field"><span>Moto</span><input id="rM" value="${esc(r.moto || "")}" placeholder="Ex.: Honda XRE 300"></label>
    <div class="grid2"><label class="field"><span>Consumo (km/L)</span><input id="rC" inputmode="decimal" value="${r.consumo ?? ""}"><small>Média na estrada</small></label>
    <label class="field"><span>Tanque (L)</span><input id="rT" inputmode="decimal" value="${r.tanque ?? ""}"></label></div>
    <div class="actions">${removable ? `<button type="button" class="btn danger" id="rDel">Remover piloto</button>` : `<button type="button" class="btn" data-close="1">Cancelar</button>`}<button class="btn primary">Salvar</button></div></form>`, sh => {
    sh.querySelector("#rF").addEventListener("submit", ev => { ev.preventDefault();
      const name = sh.querySelector("#rN").value.trim(); if (!name) return;
      const data = { name, moto: sh.querySelector("#rM").value.trim(), consumo: parseNum(sh.querySelector("#rC").value), tanque: parseNum(sh.querySelector("#rT").value) };
      if (isNew) { let nid = slug(name), i = 2; while (S.riders[nid]) nid = slug(name) + i++;
        store.put("riders", nid, { ...data, email: "", created: Date.now() }); closeSheet(); toast(`${name} adicionado · ID do perfil: ${nid}`); }
      else { store.merge("riders/" + id, data); closeSheet(); toast("Salvo"); } });
    const del = sh.querySelector("#rDel"); let armed = false;
    del && del.addEventListener("click", () => { if (!armed) { armed = true; del.textContent = "Toque de novo para remover"; return; }
      store.remove("riders", id); closeSheet(); toast("Piloto removido"); });
  });
}

function ajustes() {
  const local = ST.mode === "local";
  return `${backLink}<h2>Ajustes</h2>
  <div class="card stack"><h3>Aparência</h3>${themeSeg()}<p class="muted" style="font-size:.85rem">Automático segue o tema do celular ou do navegador. A escolha vale só para este aparelho.</p></div>
  <form class="card stack" id="setF">
    <h3>Viagem</h3>
    <div class="grid2"><label class="field"><span>Gasolina (R$/L)</span><input id="sGas" inputmode="decimal" value="${S.trip.gasPrice ?? ""}"><small>Usado nas estimativas e como padrão ao abastecer</small></label>
    <label class="field"><span>Média na estrada (km/h)</span><input id="sSpeed" inputmode="numeric" value="${S.trip.avgSpeed ?? 70}"><small>Contando paradas. Usada para estimar a hora em cada cidade do caminho e o tempo nela.</small></label>
    ${isAdmin() ? `<label class="field"><span>Fim das suas férias</span><input id="sFer" type="date" value="${S.trip.feriasFim || ""}"><small>Só você altera. Para os outros pilotos aparece só o prazo da viagem.</small></label>` : ""}</div>
    <button class="btn primary" style="justify-self:start">Salvar ajustes</button>
  </form>
  <div class="card stack"><h3>Sincronização</h3>
    ${local ? `<p><span class="chip s-mute">modo local</span></p><p>Tudo fica salvo só neste aparelho e funciona sem internet. Para o Kaique ver e editar junto, configure o Firebase seguindo o README do repositório (uns 10 minutos, grátis).</p>
      <p class="note">Antes de ligar a sincronização, exporte um backup aqui: os dados do modo local não vão sozinhos para a nuvem.</p>`
    : `<p><span class="chip ${ST.error ? "s-bad" : ST.online ? "s-ok" : "s-pend"}">${ST.error ? "erro" : ST.online ? "online" : "offline"}</span> ${esc(ST.user || "")}</p>
      ${ST.error ? `<p class="err">${esc(ST.error)}</p>` : ""}
      <p>As alterações feitas sem sinal ficam guardadas no celular e sobem sozinhas quando a internet voltar. ${ST.pending ? "<b>Há alterações aguardando envio.</b>" : "Nada pendente de envio."}</p>
      <button class="btn sm" data-act="logout" style="justify-self:start">Sair da conta</button>`}
  </div>
  <div class="card stack"><h3>Backup</h3>
    <div class="row"><button class="btn sm" data-act="export">Baixar backup (.json)</button>
    ${local ? `<label class="btn sm" for="impFile">Restaurar backup</label><input id="impFile" type="file" accept="application/json,.json" hidden>` : ""}</div>
    ${local ? `<button class="btn sm danger" data-act="reset" style="justify-self:start">Voltar aos dados iniciais</button>` : ""}
  </div>
  <p class="muted" style="font-size:.8rem">Versão ${esc(self.APP_VERSION || "?")} · dados de distância e tempo são estimativas até validação por GPS.</p>`;
}

/* ---------- MAPA ---------- */
const CIRC_ORDER = ["chegada", "c1", "c2", "c3", "planob", "estrada"];
const CIRC_BASE = { chegada: "Chegada", c1: "Circuito 1", c2: "Circuito 2", c3: "Circuito 3", planob: "Plano B", estrada: "Estrada", folga: "Folga" };
const allPoints = () => Object.entries(S.points || {}).map(([id, p]) => ({ id, ...p }))
  .sort((a, b) => (CIRC_ORDER.indexOf(a.circ) - CIRC_ORDER.indexOf(b.circ)) || ((a.order ?? 99) - (b.order ?? 99)) || a.name.localeCompare(b.name));
const pcolor = c => CIRCUITS[c]?.color || "var(--muted)";
function circLabel(c) {
  const base = CIRC_BASE[c] || c; if (c === "estrada") return base;
  const d = days().find(x => x.circ === c); return d ? `${base} · ${wd(d.date)} ${fmtD(d.date)}` : base;
}
function fromPousada(p) {
  const h = S.points?.pousada; if (!h || h.lat == null || p.lat == null || p.id === "pousada") return null;
  return distKm(h, p);
}
function mapPoints() {
  return allPoints().filter(p => mapFilter === "all" ? p.circ !== "estrada" : p.circ === mapFilter || (mapFilter === "estrada" && p.id === "pousada"));
}
function chipsHTML() {
  const present = new Set(allPoints().map(p => p.circ));
  const opts = [["all", "Todos"], ...CIRC_ORDER.filter(c => present.has(c)).map(c => [c, circLabel(c)])];
  return opts.map(([k, l]) => `<button class="fbtn" data-act="mapf" data-v="${k}" aria-pressed="${mapFilter === k}"${k !== "all" ? ` style="--c:${pcolor(k)}"` : ""}>${k !== "all" ? `<i class="dot"></i>` : ""}${esc(l)}</button>`).join("");
}
function listHTML() {
  const ps = mapPoints();
  if (!ps.length) return `<p class="muted">Nenhum ponto neste filtro. Toque em “+ Ponto” para criar.</p>`;
  return ps.map(p => { const km = fromPousada(p);
    return `<button class="ptrow" data-act="ptOpen" data-id="${p.id}" style="--c:${pcolor(p.circ)}">
      <span class="ptmark">${p.order ? p.order : p.type === "pousada" ? `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"><path d="M2 8l6-5 6 5v6H2z"/><path d="M7 14v-4h2v4"/></svg>` : ""}</span>
      <span class="ptt">${esc(p.name)}<small>${esc(PTYPES[p.type] || "Ponto")}${km != null ? ` · ≈ ${num(km, km < 10 ? 1 : 0)} km de Lençóis` : ""}</small></span>
      ${p.lat == null ? `<span class="chip s-pend">sem posição</span>` : ""}</button>`; }).join("");
}
function setBanner(html) { const b = $("#mapBanner"); if (b) b.innerHTML = html ? `<div class="mapbanner"><span>${html}</span><button class="btn sm" data-act="cancelPlace">Cancelar</button></div>` : ""; }
function mapa() {
  return `<div class="between"><h2>Mapa</h2><div class="row"><button class="btn sm" data-act="linkToggle" id="linkBtn" aria-pressed="${linkOn}">${linkOn ? "✓ Pontos ligados" : "Ligar pontos"}</button><button class="btn sm" data-act="newPt">+ Ponto</button></div></div>
  <div class="filters" id="mapChips">${chipsHTML()}</div>
  <div id="mapBanner"></div>
  <div id="map" class="mapbox"><p class="muted" style="padding:16px">Carregando o mapa…</p></div>
  <p class="note">Toque num pin para ver detalhes e abrir no Google Maps. Segure o dedo no mapa (ou use “+ Ponto”) para criar um ponto. O mapa só aparece sem internet nas áreas já abertas antes; para navegar sem sinal, baixe a região no Google Maps offline.</p>
  <div id="routeBox"></div>
  <div id="mapList" class="stack">${listHTML()}</div>`;
}
function updateMapParts() {
  const c = $("#mapChips"), l = $("#mapList"); if (c) c.innerHTML = chipsHTML(); if (l) l.innerHTML = listHTML();
  mapView.setPoints(mapPoints().map(p => ({ ...p, color: pcolor(p.circ) })), mapFilter);
  updateRoutes();
}
function mountMap() {
  ensureLeaflet().then(L => {
    const el = $("#map"); if (route !== "mapa" || !el) return;
    if (mapView) { try { mapView.map.remove(); } catch (e) {} }
    el.innerHTML = "";
    mapView = new MapView(L, el, { onPin: id => pointSheet(id), onPlace: ll => pointForm(null, ll) });
    mapView.setPoints(mapPoints().map(p => ({ ...p, color: pcolor(p.circ) })), mapFilter);
    routeKey = ""; updateRoutes();
    mapView.invalidate();
  }).catch(err => { const el = $("#map"); if (el) el.innerHTML = `<p class="err" style="padding:16px">${esc(err.message)}</p>`; });
}
function pointSheet(id) {
  const p = S.points?.[id]; if (!p) return;
  const has = p.lat != null && p.lng != null, km = fromPousada({ id, ...p });
  openSheet(`<div class="label" style="color:${pcolor(p.circ)}">${esc(circLabel(p.circ))}${p.order ? ` · ponto ${p.order}` : ""}</div>
    <div class="row" style="flex-wrap:nowrap;align-items:center">${pinHTML(pcolor(p.circ), p.type, 0)}<h3 style="font-size:1.4rem">${esc(p.name)}</h3></div>
    <dl class="kv"><dt>Tipo</dt><dd>${esc(PTYPES[p.type] || "Ponto")}</dd>
      ${km != null ? `<dt>Distância</dt><dd>≈ ${num(km, km < 10 ? 1 : 0)} km de Lençóis em linha reta</dd>` : ""}
      ${has ? `<dt>Posição</dt><dd class="num">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</dd>` : `<dt>Posição</dt><dd><span class="chip s-pend">sem posição</span></dd>`}
      ${p.src ? `<dt>Fonte</dt><dd>${esc(p.src)}</dd>` : ""}</dl>
    ${p.note ? `<p class="note">${esc(p.note)}</p>` : ""}
    <div class="actions">${has ? `<a class="btn primary" href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}" target="_blank" rel="noopener">Abrir no Google Maps</a>` : `<button class="btn primary" data-s="place">Marcar no mapa</button>`}</div>
    <div class="actions"><button class="btn" data-s="edit">Editar</button>${has ? `<button class="btn" data-s="move">Mover pin</button>` : ""}<button class="btn danger" data-s="del">Remover</button></div>`, sh => {
    let armed = false;
    sh.addEventListener("click", e => {
      const b = e.target.closest("[data-s]"); if (!b) return; const a = b.dataset.s;
      if (a === "edit") pointForm({ id, ...p });
      else if (a === "place") { closeSheet(); if (!mapView) return; setBanner(`Toque no mapa onde fica <b>${esc(p.name)}</b>.`);
        mapView.startPlacing(ll => { setBanner(""); store.merge("points/" + id, { lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6), src: "Marcada no app" }); toast("Posição salva"); }); }
      else if (a === "move") { closeSheet(); if (!mapView) return; setBanner(`Arraste o pin de <b>${esc(p.name)}</b> e solte no lugar certo.`);
        mapView.startDrag(id, ll => { setBanner(""); store.merge("points/" + id, { lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6), src: "Ajustada no app" }); toast("Posição salva"); }); }
      else if (a === "del") { if (!armed) { armed = true; b.textContent = "Toque de novo para remover"; return; } store.remove("points", id); closeSheet(); toast("Ponto removido"); }
    });
  });
}
function pointForm(p, ll) {
  const isNew = !p;
  p = p || { name: "", circ: mapFilter === "all" ? "chegada" : mapFilter, type: "cachoeira", order: null, note: "", lat: ll ? +ll.lat.toFixed(6) : null, lng: ll ? +ll.lng.toFixed(6) : null };
  const coords = p.lat != null ? `${p.lat}, ${p.lng}` : "";
  const circs = Object.entries(CIRCUITS).filter(([k]) => k !== "folga");
  openSheet(`<h3>${isNew ? "Novo ponto" : "Editar ponto"}</h3><form id="ptF" class="stack">
    <label class="field"><span>Nome</span><input id="ptN" value="${esc(p.name)}" required></label>
    <div class="grid2"><label class="field"><span>Circuito</span><select id="ptC">${circs.map(([k]) => `<option value="${k}" ${p.circ === k ? "selected" : ""}>${esc(CIRC_BASE[k] || k)}</option>`).join("")}</select></label>
    <label class="field"><span>Tipo</span><select id="ptT">${Object.entries(PTYPES).map(([k, l]) => `<option value="${k}" ${p.type === k ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>
    <div class="grid2"><label class="field"><span>Ordem no dia</span><input id="ptO" inputmode="numeric" value="${p.order ?? ""}"><small>Número que aparece no pin</small></label>
    <label class="field"><span>Coordenadas</span><input id="ptLL" value="${coords}" placeholder="-12.5583, -41.3895"><small>Cole do Google Maps, ou deixe vazio</small></label></div>
    <label class="field"><span>Observação</span><textarea id="ptNote">${esc(p.note || "")}</textarea></label>
    <p class="err" id="ptErr" hidden></p>
    <div class="actions"><button type="button" class="btn" data-close="1">Cancelar</button><button class="btn primary">Salvar</button></div></form>`, sh => {
    sh.querySelector("#ptF").addEventListener("submit", ev => {
      ev.preventDefault(); const err = sh.querySelector("#ptErr"); err.hidden = true;
      const name = sh.querySelector("#ptN").value.trim(); if (!name) return;
      let lat = null, lng = null; const raw = sh.querySelector("#ptLL").value.trim();
      if (raw) { const m = raw.match(/(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)/);
        if (m) { lat = parseNum(m[1]); lng = parseNum(m[2]); }
        if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) { err.hidden = false; err.textContent = "Coordenadas inválidas. Use o formato -12.5583, -41.3895."; return; } }
      const moved = isNew || lat !== p.lat || lng !== p.lng;
      const id = isNew ? "p" + newId() : p.id;
      const { id: _, ...rest } = p;
      store.put("points", id, { ...rest, name, circ: sh.querySelector("#ptC").value, type: sh.querySelector("#ptT").value,
        order: parseNum(sh.querySelector("#ptO").value), note: sh.querySelector("#ptNote").value.trim(), lat, lng,
        src: moved ? (lat == null ? "" : ll ? "Marcada no app" : "Informada no app") : (p.src || "") });
      closeSheet(); toast(isNew ? "Ponto criado" : "Ponto salvo");
    });
  });
}
/* Ligar pontos: rota de cada circuito saindo e voltando à pousada */
const cssColor = v => { const m = /var\((--[\w-]+)\)/.exec(v); return m ? getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || "#666" : v; };
function routePlans() {
  const ps = allPoints().filter(p => p.lat != null && p.lng != null);
  const base = S.points?.pousada && S.points.pousada.lat != null ? { lat: S.points.pousada.lat, lng: S.points.pousada.lng } : null;
  const circs = mapFilter === "all" ? CIRC_ORDER.filter(c => c !== "estrada") : [mapFilter];
  return circs.map(c => {
    const stops = ps.filter(p => p.circ === c && p.id !== "pousada").sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
    if (!stops.length) return null;
    const missing = allPoints().filter(p => p.circ === c && p.lat == null).length;
    let path;
    if (c === "estrada") path = base ? [...stops, base] : stops;                 // Catolé → Petrolina → Lençóis
    else path = base ? [base, ...stops, base] : stops;                            // pousada → pontos → pousada
    if (path.length < 2) return null;
    return { circ: c, foot: c === "chegada", path: path.map(p => [p.lat, p.lng]), missing };
  }).filter(Boolean);
}
const lineKm = path => path.slice(1).reduce((s, p, i) => s + distKm({ lat: path[i][0], lng: path[i][1] }, { lat: p[0], lng: p[1] }), 0);
async function roadRoute(path) {
  const key = "osrm:" + path.map(p => p[0].toFixed(5) + "," + p[1].toFixed(5)).join(";");
  try { const c = JSON.parse(localStorage.getItem(key) || "null"); if (c) return c; } catch (e) {}
  const coords = path.map(p => `${p[1]},${p[0]}`).join(";");
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`, { signal: ctl.signal });
    const j = await r.json(); if (j.code !== "Ok" || !j.routes?.length) return null;
    const out = { km: j.routes[0].distance / 1000, line: j.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]) };
    try { localStorage.setItem(key, JSON.stringify(out)); } catch (e) {}
    return out;
  } catch (e) { return null; } finally { clearTimeout(t); }
}
async function updateRoutes() {
  const box = $("#routeBox"); if (!mapView || !box) return;
  if (!linkOn) { mapView.setRoutes(null); box.innerHTML = ""; routeKey = ""; return; }
  const plans = routePlans();
  const key = mapFilter + "|" + JSON.stringify(plans.map(p => p.path));
  if (key === routeKey) return; routeKey = key; const seq = ++routeSeq;
  if (!plans.length) { mapView.setRoutes(null); box.innerHTML = `<div class="card"><p class="muted">Sem pontos com posição para ligar neste filtro.</p></div>`; return; }
  // primeiro desenha em linha reta; depois troca pela estrada quando a rota chegar
  const rows = plans.map(p => ({ ...p, km: lineKm(p.path), road: false, line: p.path }));
  const draw = () => {
    if (seq !== routeSeq) return;
    mapView.setRoutes(rows.map(r => ({ latlngs: r.line, color: cssColor(pcolor(r.circ)), dashed: !r.road })));
    const total = rows.reduce((s, r) => s + r.km, 0);
    box.innerHTML = `<div class="card stack"><div class="between"><h3>Distâncias</h3>${rows.length > 1 ? `<span class="num" style="font-weight:700">Total ≈ ${num(total)} km</span>` : ""}</div>
      <div class="tablebox"><table><tbody>${rows.map(r => `<tr><td><i class="rdot" style="background:${pcolor(r.circ)}"></i>${esc(CIRC_BASE[r.circ] || r.circ)}</td>
        <td class="r num"><b>≈ ${num(r.km, r.km < 10 ? 1 : 0)} km</b></td><td class="muted" style="font-size:.8rem">${r.road ? "pela estrada" : r.foot ? "a pé, em linha reta" : "em linha reta"}${r.missing ? ` · ${r.missing} sem posição` : ""}</td></tr>`).join("")}</tbody></table></div>
      <p class="note">${mapFilter === "estrada" ? "Catolé → Petrolina → pousada." : "Cada circuito sai e volta para a pousada, na ordem dos números."} Linha cheia = rota pela estrada (OpenStreetMap/OSRM); tracejada = linha reta, usada a pé ou quando não há internet. Pontos de trilha contam até a estrada mais próxima. É estimativa: confira antes de ir.</p></div>`;
  };
  draw();
  await Promise.all(rows.map(async r => { if (r.foot) return; const rr = await roadRoute(r.path); if (rr) { r.km = rr.km; r.line = rr.line; r.road = true; } }));
  draw();
}
function dayPoints(d) {
  const ps = allPoints().filter(p => p.circ === d.circ); if (!ps.length) return "";
  return `<div><div class="label">No mapa</div><div class="seq" style="margin-top:4px">${ps.map(p => `<span>${p.order ? p.order + ". " : ""}${esc(p.name)}</span>`).join("")}</div>
    <button class="btn sm" data-act="mapCirc" data-v="${d.circ}" style="margin-top:8px">Ver no mapa</button></div>`;
}

/* ---------- TEMA ---------- */
const getTheme = () => { try { return localStorage.getItem("theme") || "auto"; } catch (e) { return "auto"; } };
function setTheme(t) {
  try { t === "auto" ? localStorage.removeItem("theme") : localStorage.setItem("theme", t); } catch (e) {}
  const root = document.documentElement;
  t === "auto" ? root.removeAttribute("data-theme") : root.setAttribute("data-theme", t);
  if (mapView) { routeKey = ""; updateRoutes(); } // cores das linhas acompanham o tema
}
const themeSeg = () => `<div class="seg themeseg" role="group" aria-label="Tema">${[["auto", "Automático"], ["light", "☀ Dia"], ["dark", "☾ Noite"]].map(([k, l]) => `<button type="button" data-theme-set="${k}" aria-pressed="${getTheme() === k}">${l}</button>`).join("")}</div>`;
document.addEventListener("click", e => {
  const b = e.target.closest("[data-theme-set]"); if (!b) return;
  setTheme(b.dataset.themeSet);
  document.querySelectorAll("[data-theme-set]").forEach(x => x.setAttribute("aria-pressed", x.dataset.themeSet === b.dataset.themeSet));
});

/* ---------- SOBRE ---------- */
const ABOUT_DEFAULT = { author: "Jacó", github: "https://github.com/JacobbV", instagram: "", facebook: "", tiktok: "", whatsapp: "", email: "",
  // Textos iniciais: o admin edita em Sobre → Editar textos
  nos: "Somos o Jacó e o Kaique, dois amigos de Catolé do Rocha-PB que gostam de estrada. O Jacó vai de BMW G 650 GS; o Kaique, de Honda CG 160 Titan, já com uma viagem de moto até Canoa Quebrada na bagagem.",
  historia: "A ideia começou como uma conversa sobre a próxima viagem e virou a Expedição Chapada: cerca de 2.400 km de moto, de Catolé do Rocha até Lençóis, na Chapada Diamantina, em janeiro de 2027.",
  objetivos: "Conhecer cachoeiras, serras e mirantes da Chapada, como o Pai Inácio e a Fumaça; viajar com segurança e no ritmo das duas motos; gastar com consciência; e registrar tudo em fotos e vídeos.",
  appinfo: "Este aplicativo foi desenvolvido pelo Jacó para planejar e acompanhar a expedição: roteiro, mapa, checklist, gastos e hospedagem, funcionando até sem sinal na estrada." };
const STORY = [["nos", "Quem somos"], ["historia", "Nossa história"], ["objetivos", "Objetivos e sonhos"], ["appinfo", "Sobre o app"]];
const about = () => ({ ...ABOUT_DEFAULT, ...(S.trip?.about || {}) });
const canEditAbout = () => isAdmin();
const SOCIAL = [
  ["github", "GitHub", '<path d="M8 6L3 12l5 6M16 6l5 6-5 6"/>', v => /^https?:/.test(v) ? v : "https://github.com/" + v.replace(/^@/, "")],
  ["instagram", "Instagram", '<rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.5"/>', v => /^https?:/.test(v) ? v : "https://instagram.com/" + v.replace(/^@/, "")],
  ["facebook", "Facebook", '<circle cx="9" cy="8" r="3"/><circle cx="16" cy="9" r="2.5"/><path d="M3 19c0-3 3-5 6-5s6 2 6 5M14 14c3 0 6 1.5 6 4.5"/>', v => /^https?:/.test(v) ? v : "https://facebook.com/" + v.replace(/^@/, "")],
  ["tiktok", "TikTok", '<path d="M10 20a4 4 0 1 1 0-8M10 20a4 4 0 0 0 4-4V4c1 2 3 3.5 6 3.5"/>', v => /^https?:/.test(v) ? v : "https://www.tiktok.com/@" + v.replace(/^@/, "")],
  ["whatsapp", "WhatsApp", '<path d="M5 19l1.2-3.6A8 8 0 1 1 9 18.5z"/><path d="M9.5 9.5c.5 2 2 3.5 4 4"/>', v => { const d = v.replace(/\D/g, ""); return "https://wa.me/" + (d.startsWith("55") ? d : "55" + d); }],
  ["email", "E-mail", '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>', v => "mailto:" + v],
];
function socialOf(id) {
  const r = S.riders?.[id] || {}; const own = r.social || {};
  // contatos antigos (v1.4/1.5) ficavam no Sobre geral: valem para o admin até serem editados
  if (!r.social && id === (S.trip?.admin || "jaco")) { const a = about(); const o = {}; SOCIAL.forEach(([k]) => o[k] = a[k] || ""); return o; }
  return own;
}
function socialLinks(id) {
  const so = socialOf(id);
  return SOCIAL.filter(([k]) => (so[k] || "").trim()).map(([k, label, icon, href]) => `<a class="social" href="${esc(href(so[k].trim()))}" target="_blank" rel="noopener">
      <svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg><span>${label}<small>${esc(so[k].trim())}</small></span></a>`).join("");
}
function sobre() {
  const a = about();
  return `${backLink}<h2>Sobre</h2>
  <div class="hero"><div class="label" style="color:var(--asphalt-muted)">Aplicativo da viagem</div><div class="big" style="font-size:2.6rem">Expedição <span>Chapada</span></div>
    <div class="sub">Versão ${esc(self.APP_VERSION || "?")} · Catolé do Rocha-PB → Lençóis-BA · janeiro de 2027</div></div>
  ${STORY.filter(([k]) => (a[k] || "").trim()).map(([k, t]) => `<div class="card stack story"><h3>${t}</h3>${esc(a[k]).split(/\n+/).map(par => `<p>${par}</p>`).join("")}
    ${k === "nos" ? `<div class="pilots">${riderIds().map(id => `<div class="pilot"><b>${esc(rname(id))}</b><small>${esc(S.riders[id].moto || "")}</small></div>`).join("")}</div>` : ""}</div>`).join("")}
  <button class="btn sm" data-act="editStory" style="justify-self:start">Editar textos</button>
  <h3 style="margin-top:6px">Redes e contatos</h3>
  ${riderIds().map(id => { const l = socialLinks(id);
    return `<div class="card stack"><div class="between"><h3>${esc(rname(id))}</h3><span class="muted" style="font-size:.85rem">${esc(S.riders[id].moto || "")}</span></div>
      ${l ? `<div class="socials">${l}</div>` : `<p class="muted">Nenhum contato cadastrado.</p>`}
      ${canEdit(id) || isAdmin() ? `<button class="btn sm" data-act="editSocial" data-id="${id}" style="justify-self:start">${id === me() ? "Editar meus contatos" : "Editar contatos"}</button>` : ""}</div>`; }).join("")}
  <div class="card stack"><h3>Créditos</h3>
    <p class="muted" style="font-size:.9rem">Mapa © colaboradores do OpenStreetMap · rotas pelo OSRM · tempo pelo Open-Meteo · sincronização pelo Firebase · hospedado no GitHub Pages.</p>
    <p class="muted" style="font-size:.9rem">Distâncias e tempos são estimativas até validação por GPS.</p></div>
  <p class="muted" style="font-size:.8rem">© 2026 ${esc(a.author)} · Expedição Chapada Diamantina</p>`;
}
function socialForm(id) {
  const so = socialOf(id);
  openSheet(`<h3>Contatos de ${esc(rname(id))}</h3><p class="muted" style="font-size:.85rem">Só aparecem os que forem preenchidos. Pode usar o link completo ou só o @usuário.</p>
    <form id="soF" class="stack">
      ${SOCIAL.map(([k, label]) => `<label class="field"><span>${label}</span><input id="so${k}" value="${esc(so[k] || "")}" placeholder="${k === "whatsapp" ? "DDD + número, ex.: 83 99999-0000" : k === "email" ? "nome@email.com" : k === "github" ? "https://github.com/usuario" : "@usuario"}" ${k === "email" ? 'type="email"' : ""}></label>`).join("")}
      <div class="actions"><button type="button" class="btn" data-close="1">Cancelar</button><button class="btn primary">Salvar</button></div></form>`, sh => {
    sh.querySelector("#soF").addEventListener("submit", ev => { ev.preventDefault();
      const out = {}; SOCIAL.forEach(([k]) => out[k] = sh.querySelector("#so" + k).value.trim());
      store.merge("riders/" + id, { social: out }); closeSheet(); toast("Contatos salvos"); });
  });
}

function storyForm() {
  const a = about();
  const own = k => k === "appinfo" && !isAdmin(); // “Sobre o app” é do criador
  openSheet(`<h3>Textos do Sobre</h3><p class="muted" style="font-size:.85rem">Quem somos, história e objetivos são dos dois. “Sobre o app” só o ${esc(rname(S.trip?.admin || "jaco"))} edita. Deixe um campo vazio para esconder a seção.</p>
    <form id="stF" class="stack">${STORY.map(([k, t]) => `<label class="field"><span>${t}${own(k) ? " 🔒" : ""}</span><textarea id="st${k}" rows="4" ${own(k) ? "disabled" : ""}>${esc(a[k] || "")}</textarea></label>`).join("")}
    <div class="actions"><button type="button" class="btn" data-close="1">Cancelar</button><button class="btn primary">Salvar</button></div></form>`, sh => {
    sh.querySelector("#stF").addEventListener("submit", ev => { ev.preventDefault();
      const out = {}; STORY.forEach(([k]) => { if (!own(k)) out[k] = sh.querySelector("#st" + k).value.trim(); });
      store.merge("trip", { about: out }); closeSheet(); toast("Textos salvos"); });
  });
}

/* ---------- SEGURANÇA ---------- */
const EMERG = [["sangue", "Tipo sanguíneo", "Ex.: O+"], ["alergias", "Alergias", "Ex.: dipirona, nenhuma"], ["remedios", "Remédios de uso contínuo", ""],
  ["plano", "Plano de saúde", "Nome e número da carteirinha"], ["contatoNome", "Contato de emergência", "Nome e parentesco"], ["contatoTel", "Telefone do contato", "(83) 9 9999-9999"],
  ["placa", "Placa da moto", ""], ["assistencia", "Seguro / assistência 24h", "Empresa e telefone"]];
const telHref = v => "tel:" + (v || "").replace(/[^\d+]/g, "");
const waHref = (v, text) => { const d = (v || "").replace(/\D/g, ""); return `https://wa.me/${d ? (d.startsWith("55") ? d : "55" + d) : ""}?text=${encodeURIComponent(text)}`; };
const checkins = () => Object.entries(S.meta?.checkins || {}).map(([id, c]) => ({ id, ...c })).sort((a, b) => (b.at || 0) - (a.at || 0));
const ckTime = at => { const d = new Date(at); return `${WD[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}h${pad(d.getMinutes())}`; };
const ckLine = c => `<li><span>${c.kind === "ok" ? "✅" : "📍"}</span><div><b>${esc(rname(c.rider))}</b> · ${c.kind === "ok" ? `chegou bem${c.place ? " em " + esc(c.place) : ""}` : "mandou a localização"} · <span class="muted">${ckTime(c.at)}</span>${c.lat != null ? ` · <a href="https://maps.google.com/?q=${c.lat},${c.lng}" target="_blank" rel="noopener">ver no mapa</a>` : ""}</div></li>`;
function todayDest() { const d = days().find(x => x.date === todayISO()); if (!d) return ""; return isRoad(d) && tripEnds(d)[1] ? cleanCity(tripEnds(d)[1]) : "Lençóis"; }
// GPS primeiro; se falhar, tenta a localização aproximada (Wi-Fi/rede). Devolve { pos } ou { err }
function getPos() {
  const one = hi => new Promise(res => navigator.geolocation.getCurrentPosition(p => res({ pos: { lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5) } }), er => res({ err: er.code }), { enableHighAccuracy: hi, timeout: hi ? 15000 : 10000, maximumAge: 120000 }));
  if (!navigator.geolocation) return Promise.resolve({ err: 0 });
  return one(true).then(r => r.pos || r.err === 1 ? r : one(false));
}
const POS_ERR = { 0: "Este aparelho não informa localização.", 1: "Localização bloqueada para o app. Libere em Configurações do celular → navegador (ou no cadeado da barra de endereço) e tente de novo.", 2: "Não deu para achar a posição agora (sem GPS ou sinal).", 3: "O GPS demorou demais para responder." };
// Avisar o grupo: abre uma folha, pega a localização e só então mostra os botões de envio.
// O toque no botão abre o WhatsApp direto (whatsapp://), com a lista de conversas para escolher.
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
function sendAlert(kind) {
  const m = me(); if (!m) return pickMe();
  const place = kind === "ok" ? todayDest() : "";
  openSheet(`<h3>${kind === "ok" ? "✅ Cheguei bem" : "📍 Enviar minha localização"}</h3><div id="alBox" class="stack"><p class="muted">Pegando sua localização…</p></div>
    <button class="btn" data-close="1">Fechar</button>`, async sh => {
    const box = sh.querySelector("#alBox");
    const run = async () => {
      box.innerHTML = `<p class="muted">Pegando sua localização…</p>`;
      const g = await getPos(); if (!box.isConnected) return;
      const pos = g.pos || null, now = new Date(), hm = `${pad(now.getHours())}h${pad(now.getMinutes())}`;
      const link = pos ? `\nhttps://maps.google.com/?q=${pos.lat},${pos.lng}` : "";
      const text = kind === "ok" ? `✅ ${rname(m)}: cheguei bem${place ? " em " + place : ""}, às ${hm}.${link}\n— Expedição Chapada` : `▶ Localização de ${rname(m)}, às ${hm}:${link || "\n(sem localização agora)"}\n— Expedição Chapada`;
      const wa = isMobile ? `whatsapp://send?text=${encodeURIComponent(text)}` : waHref("", text);
      box.innerHTML = `${pos ? "" : `<div class="warnbox">${esc(POS_ERR[g.err] || POS_ERR[2])}</div>`}
        <div class="msgprev">${esc(text).replace(/\n/g, "<br>")}</div>
        <a class="btn primary block" id="alWa" href="${wa}" ${isMobile ? "" : 'target="_blank" rel="noopener"'}>Enviar pelo WhatsApp</a>
        <div class="grid2">${navigator.share ? `<button type="button" class="btn" id="alSh">Outros apps…</button>` : ""}<button type="button" class="btn" id="alCp">Copiar texto</button></div>
        ${pos ? "" : `<button type="button" class="btn" id="alRe">Tentar pegar a localização de novo</button>`}
        <p class="muted" style="font-size:.78rem">Ao enviar, o aviso também fica registrado no app para o outro piloto.</p>`;
      let logged = false;
      const log = () => { if (logged) return; logged = true;
        const keep = checkins().slice(49).reduce((o, c) => (o[c.id] = null, o), {});
        store.merge("meta/checkins", { ...keep, [newId()]: { rider: m, kind, at: Date.now(), lat: pos?.lat ?? null, lng: pos?.lng ?? null, place } }); };
      box.querySelector("#alWa").addEventListener("click", log);
      box.querySelector("#alSh")?.addEventListener("click", () => { log(); navigator.share({ text }).catch(() => {}); });
      box.querySelector("#alCp").addEventListener("click", () => { log(); navigator.clipboard?.writeText(text).then(() => toast("Texto copiado: cole na conversa"), () => toast("Não deu para copiar")); });
      box.querySelector("#alRe")?.addEventListener("click", run);
    };
    run();
  });
}
function seguranca() {
  const list = checkins().slice(0, 6);
  return `${backLink}<h2>Segurança</h2>
  <div class="card stack"><h3>Avisar o grupo</h3>
    <div class="grid2"><button class="btn primary big" data-act="sendLoc">📍 Enviar minha localização</button><button class="btn big" data-act="sendOk">✅ Cheguei bem</button></div>
    <p class="muted" style="font-size:.82rem">Abre o WhatsApp com a mensagem e o link do mapa prontos: escolha o grupo ou a pessoa. O aviso também fica registrado aqui para o outro piloto.</p>
    ${list.length ? `<div class="label">Últimos avisos</div><ul class="hlist">${list.map(ckLine).join("")}</ul>` : ""}</div>
  <div class="card stack"><h3>Números úteis</h3>
    <div class="grid2 sos">${[["192", "SAMU"], ["193", "Bombeiros"], ["191", "PRF · rodovia federal"], ["190", "Polícia Militar"]].map(([n, l]) => `<a class="btn" href="tel:${n}"><b>${n}</b><small>${l}</small></a>`).join("")}</div></div>
  ${riderIds().map(id => { const e = S.riders[id].emerg || {}, filled = EMERG.filter(([k]) => e[k]);
    return `<div class="card stack"><div class="between"><h3>Ficha · ${esc(rname(id))}</h3>${canEdit(id) || isAdmin() ? `<button class="btn sm" data-act="editEmerg" data-id="${id}">Editar</button>` : ""}</div>
      ${filled.length ? `<dl class="kv">${filled.map(([k, l]) => `<dt>${l}</dt><dd>${k === "contatoTel" ? `<a href="${telHref(e[k])}">${esc(e[k])}</a> · <a href="${waHref(e[k], "")}" target="_blank" rel="noopener">WhatsApp</a>` : esc(e[k])}</dd>`).join("")}</dl>`
        : `<p class="muted">${id === me() ? "Preencha sua ficha: tipo sanguíneo, alergias e um contato de emergência ajudam muito se algo acontecer." : "Ainda não preenchida."}</p>`}</div>`; }).join("")}
  <p class="note">A ficha fica visível só para os pilotos do grupo. Em acidente, mostre esta tela para o socorro.</p>`;
}
function emergForm(id) {
  const e = S.riders[id].emerg || {};
  openSheet(`<h3>Ficha de emergência · ${esc(rname(id))}</h3><p class="muted" style="font-size:.85rem">Só os pilotos do grupo veem. Preencha o que quiser.</p>
    <form id="emF" class="stack">${EMERG.map(([k, l, ph]) => `<label class="field"><span>${l}</span><input id="em_${k}" value="${esc(e[k] || "")}" placeholder="${esc(ph)}" ${k === "contatoTel" ? 'inputmode="tel"' : ""}></label>`).join("")}
    <div class="actions"><button type="button" class="btn" data-close="1">Cancelar</button><button class="btn primary">Salvar</button></div></form>`, sh => {
    sh.querySelector("#emF").addEventListener("submit", ev => { ev.preventDefault();
      const out = {}; EMERG.forEach(([k]) => out[k] = sh.querySelector("#em_" + k).value.trim());
      store.merge("riders/" + id, { emerg: out }); closeSheet(); toast("Ficha salva"); });
  });
}

/* ---------- DIÁRIO DE BORDO ---------- */
const logOf = id => Object.entries(S.riders?.[id]?.diario || {}).map(([k, v]) => ({ id: k, ...v })).sort((a, b) => (a.odo || 0) - (b.odo || 0) || (a.date || "").localeCompare(b.date || ""));
function logStats(id) {
  const L = logOf(id); if (!L.length) return { L, km: 0, litros: 0, real: null, gasto: 0, segs: 0 };
  let lastFull = null, since = 0, kmSeg = 0, lSeg = 0, segs = 0;
  L.forEach((e, i) => {
    e.seg = null;
    if (lastFull != null) since += Number(e.litros) || 0;
    if (e.cheio !== false) {
      if (lastFull != null && since > 0 && e.odo > lastFull) { const km = e.odo - lastFull; e.seg = { km, cons: km / since }; kmSeg += km; lSeg += since; segs++; }
      lastFull = e.odo; since = 0;
    }
  });
  const km = L[L.length - 1].odo - L[0].odo, after = L.slice(1);
  const litros = after.reduce((s, e) => s + (Number(e.litros) || 0), 0), gasto = after.reduce((s, e) => s + (Number(e.litros) || 0) * (Number(e.ppl) || 0), 0);
  return { L, km, litros, real: segs ? kmSeg / lSeg : null, gasto, segs };
}
// consumo usado nas contas: o real do diário, quando existe; senão o informado no perfil
const consumoDe = id => logStats(id).real || Number(S.riders?.[id]?.consumo) || null;
function diario() {
  const id = viewRider, r = S.riders[id] || {}, st = logStats(id), mine = canEdit(id);
  const cad = Number(r.consumo) || null, tanque = Number(r.tanque) || null;
  const diff = st.real && cad ? (st.real - cad) / cad * 100 : null;
  return `${backLink}<div class="between"><h2>Diário de bordo</h2>${mine ? `<button class="btn sm primary" data-act="newLog">+ Abastecimento</button>` : ""}</div>
  ${riderSeg(false)}
  <div class="stats">
    <div class="stat"><div class="v">${st.real ? num(st.real, 1) : "—"}</div><div class="k">km/L real${diff != null ? ` · ${diff >= 0 ? "+" : ""}${num(diff)}% do informado` : ""}</div></div>
    <div class="stat"><div class="v">${tanque && (st.real || cad) ? num(tanque * (st.real || cad)) : "—"}</div><div class="k">km por tanque${st.real ? " (real)" : cad ? " (informado)" : ""}</div></div>
    <div class="stat"><div class="v">${num(st.km)}</div><div class="k">km rodados no diário</div></div>
    <div class="stat"><div class="v" style="font-size:1.5rem">${st.km > 0 && st.gasto ? brl(st.gasto / st.km) : "—"}</div><div class="k">combustível por km</div></div>
  </div>
  ${st.real && cad && Math.abs(diff) >= 5 && mine ? `<div class="infobox">O consumo real (${num(st.real, 1)} km/L) já é usado nas contas do app: autonomia, paradas para abastecer e combustível previsto. <button class="btn sm" data-act="useReal" style="margin-left:6px">Gravar ${num(st.real, 1)} km/L no perfil</button></div>` : ""}
  <div class="card stack"><h3>Abastecimentos</h3>
    ${st.L.length ? `<div class="loglist">${[...st.L].reverse().map(e => `<button type="button" class="logrow" ${mine ? `data-act="editLog" data-id="${e.id}"` : "disabled"}>
      <div><b>${e.date ? `${wd(e.date)} ${fmtD(e.date)}` : "—"}</b>${e.local ? ` · ${esc(e.local)}` : ""}<small>${num(e.odo)} km no hodômetro${e.cheio === false ? " · parcial" : ""}</small></div>
      <div class="r"><b class="num">${num(e.litros, 2)} L</b><small>${e.ppl ? brl(e.litros * e.ppl) : ""}</small>${e.seg ? `<span class="chip s-ok">${num(e.seg.cons, 1)} km/L · ${num(e.seg.km)} km</span>` : ""}</div></button>`).join("")}</div>`
      : `<p class="muted">${mine ? "Anote cada abastecida: hodômetro e litros. O app calcula o consumo real da sua moto." : `${esc(rname(id))} ainda não anotou abastecimentos.`}</p>`}
    <p class="note">O consumo é calculado entre dois tanques cheios: encha até a boca e anote o hodômetro. Abastecida parcial entra na conta do próximo tanque cheio.</p></div>`;
}
function logForm(e) {
  const id = canEdit(viewRider) ? viewRider : me(), isNew = !e, prev = logOf(id).slice(-1)[0];
  e = e || { date: todayISO(), odo: "", litros: "", ppl: S.trip.gasPrice, cheio: true, local: "" };
  openSheet(`<h3>${isNew ? "Novo abastecimento" : "Editar abastecimento"}</h3>
    <form id="lgF" class="stack">
      <div class="grid2"><label class="field"><span>Hodômetro (km)</span><input id="lO" inputmode="numeric" value="${e.odo ?? ""}" required ${prev && isNew ? `placeholder="último: ${num(prev.odo)}"` : ""}></label>
      <label class="field"><span>Data</span><input id="lD" type="date" value="${e.date || ""}"></label></div>
      <div class="grid2"><label class="field"><span>Litros</span><input id="lL" inputmode="decimal" value="${e.litros ?? ""}" required></label>
      <label class="field"><span>R$ por litro</span><input id="lP" inputmode="decimal" value="${e.ppl ?? ""}"></label></div>
      <label class="field"><span>Posto / cidade</span><input id="lLoc" value="${esc(e.local || "")}" placeholder="Ex.: Salgueiro"></label>
      <label class="check"><input type="checkbox" id="lC" ${e.cheio !== false ? "checked" : ""}> Tanque cheio</label>
      ${isNew ? `<label class="check"><input type="checkbox" id="lE" checked> Lançar também em Gastos da viagem</label>` : e.exp && S.expenses?.[e.exp] ? `<p class="muted" style="font-size:.8rem">Ligado a um gasto da viagem: as mudanças aqui atualizam o gasto.</p>` : ""}
      <p class="err" id="lErr" hidden></p>
      <div class="actions">${isNew ? `<button type="button" class="btn" data-close="1">Cancelar</button>` : `<button type="button" class="btn danger" id="lDel">Excluir</button>`}<button class="btn primary">Salvar</button></div></form>`, sh => {
    sh.querySelector("#lgF").addEventListener("submit", ev => { ev.preventDefault();
      const odo = parseNum(sh.querySelector("#lO").value), litros = parseNum(sh.querySelector("#lL").value), ppl = parseNum(sh.querySelector("#lP").value);
      const er = sh.querySelector("#lErr");
      if (!odo || !litros) { er.hidden = false; er.textContent = "Informe o hodômetro e os litros."; return; }
      const lid = isNew ? newId() : e.id;
      const data = { date: sh.querySelector("#lD").value, odo: Math.round(odo), litros, ppl, cheio: sh.querySelector("#lC").checked, local: sh.querySelector("#lLoc").value.trim() };
      const expId = e.exp && S.expenses?.[e.exp] ? e.exp : (isNew && sh.querySelector("#lE")?.checked && ppl ? newId() : null);
      if (expId) { data.exp = expId; const old = S.expenses?.[expId] || {};
        store.put("expenses", expId, { ...old, cat: "combustivel", desc: "Abastecimento" + (data.local ? " em " + data.local : ""), amount: Math.round(litros * (ppl || 0) * 100) / 100,
          date: data.date, liters: litros, ppl, created: old.created || Date.now(), rider: id, shared: old.shared || false, fromLog: lid }); }
      store.merge("riders/" + id, { diario: { [lid]: data } });
      closeSheet(); toast(isNew ? "Abastecimento anotado" : "Salvo");
    });
    const del = sh.querySelector("#lDel"); let armed = false;
    del && del.addEventListener("click", () => { if (!armed) { armed = true; del.textContent = "Toque de novo para excluir"; return; }
      store.merge("riders/" + id, { diario: { [e.id]: null } }); if (e.exp && S.expenses?.[e.exp]) store.remove("expenses", e.exp);
      closeSheet(); toast(e.exp ? "Abastecimento excluído (e o gasto ligado a ele)" : "Abastecimento excluído"); });
  });
}

/* ---------- ABASTECIMENTO NA ROTA ---------- */
const autonomia = id => (Number(S.riders?.[id]?.tanque) || 0) * (consumoDe(id) || 0);
// Postos marcados no mapa (tipo Posto) que ficam perto do caminho entram como opção de parada
function postosOnRoute(R) {
  const out = [];
  allPoints().filter(p => p.type === "posto" && p.lat != null).forEach(p => {
    for (let i = 1; i < R.stops.length; i++) {
      const a = R.stops[i - 1], b = R.stops[i], da = distKm(a, p), db = distKm(p, b);
      if (da + db - distKm(a, b) < 15) { out.push({ name: p.name, km: Math.round(a.km + (b.km - a.km) * da / (da + db)), posto: true, lat: p.lat, lng: p.lng }); break; }
    }
  });
  return out;
}
function planFuel(cands, total, safe) {
  const out = []; let pos = 0, warn = null;
  while (total - pos > safe) {
    const reach = cands.filter(x => x.km > pos && x.km - pos <= safe && x.km < total);
    if (!reach.length) { const nx = cands.find(x => x.km > pos && x.km < total); warn = { from: pos, gap: (nx ? nx.km : total) - pos, to: nx ? nx.name : null }; break; }
    const pick = reach[reach.length - 1]; out.push(pick); pos = pick.km;
  }
  return { stops: out, warn };
}
const fuelCache = new Map();
async function fuelPlanDay(d) {
  if (!isRoad(d) || !tripEnds(d)[1]) return null;
  const R = await routeStops(d); if (!R) return null;
  const total = R.stops[R.stops.length - 1].km;
  const cands = [...R.stops.slice(1), ...postosOnRoute(R)].sort((a, b) => a.km - b.km);
  return { R, total, dest: R.stops[R.stops.length - 1].name, riders: riderIds().map(id => { const aut = autonomia(id); return aut ? { id, aut, ...planFuel(cands, total, aut * .8) } : { id, missing: true }; }) };
}
function fuelHTML(P, mode) {
  if (!P) return mode === "rb" ? "—" : "";
  const nm = s => `${s.posto ? "⛽ " : ""}${esc(s.name)}`;
  if (mode === "rb") return P.riders.map(r => `${esc(rname(r.id))}: ${r.missing ? "—" : r.stops.length ? r.stops.map(s => `${nm(s)} (${num(s.km)})`).join(", ") : "um tanque dá"}`).join(" · ");
  const line = r => r.missing ? `<b>${esc(rname(r.id))}</b>: <a href="#pilotos">informar tanque e consumo</a>`
    : `<b>${esc(rname(r.id))}</b>${mode === "short" ? "" : ` <span class="muted">(~${num(r.aut)} km/tanque)</span>`}: ${r.stops.length ? "abastecer em " + r.stops.map(s => `<b>${nm(s)}</b> <span class="muted">${num(s.km)} km</span>`).join(" → ") : `um tanque dá até ${esc(P.dest)}`}${r.warn ? ` <span class="wxchip">⚠️ ${num(r.warn.gap)} km sem parada${r.warn.to ? " até " + esc(r.warn.to) : ""}</span>` : ""}`;
  if (mode === "short") return `${num(P.total)} km · ${P.riders.map(line).join(" · ")}`;
  return `<ul class="hlist">${P.riders.map(r => `<li><span>⛽</span><div>${line(r)}</div></li>`).join("")}</ul>
    ${P.riders.some(r => r.warn) ? `<p class="note">Trecho maior que a autonomia segura sem cidade no caminho: marque um posto no mapa (tipo <b>Posto de combustível</b>) que ele entra na conta.</p>` : ""}
    <p class="muted" style="font-size:.75rem">Saindo de tanque cheio e guardando 20% de reserva. Postos marcados no mapa perto do caminho também contam.</p>`;
}
function fillFuel() {
  document.querySelectorAll("[data-fuel]").forEach(el => {
    const d = days().find(x => x.id === el.dataset.fuel); if (!d) return;
    fuelPlanDay(d).then(P => { if (el.isConnected && (P || el.dataset.mode === "rb")) el.innerHTML = fuelHTML(P, el.dataset.mode); });
  });
}

/* ---------- REVISÃO DAS MOTOS ---------- */
const REV_SUG = ["Troca de óleo e filtro", "Kit relação", "Pneu dianteiro", "Pneu traseiro", "Pastilhas de freio", "Fluido de freio", "Bateria", "Velas", "Filtro de ar", "Suspensão e retentores", "Lâmpadas e farol", "Cabos (embreagem e acelerador)"];
const revOf = id => Object.entries(S.riders?.[id]?.revisao || {}).map(([k, v]) => ({ id: k, ...v })).sort((a, b) => (a.done - b.done) || (a.created || 0) - (b.created || 0));
function revisao() {
  const id = viewRider, list = revOf(id), mine = canEdit(id);
  const todo = list.filter(x => !x.done), done = list.filter(x => x.done), total = done.reduce((s, x) => s + (Number(x.valor) || 0), 0);
  const have = new Set(list.map(x => x.item.toLowerCase()));
  const row = x => `<button type="button" class="logrow" ${mine ? `data-act="editRev" data-id="${x.id}"` : "disabled"}><div><b>${x.done ? "✓ " : ""}${esc(x.item)}</b><small>${[x.date ? `${wd(x.date)} ${fmtD(x.date)}` : "", x.km ? num(x.km) + " km" : "", x.obs || ""].filter(Boolean).map(esc).join(" · ") || (x.done ? "feito" : "a fazer")}</small></div>
    <div class="r">${x.valor ? `<b class="num">${brl(x.valor)}</b>` : ""}${x.prep ? `<small>em Meus gastos</small>` : ""}</div></button>`;
  return `${backLink}<div class="between"><h2>Revisão das motos</h2>${mine ? `<button class="btn sm primary" data-act="newRev">+ Item</button>` : ""}</div>
  ${riderSeg(false)}
  <div class="stats"><div class="stat"><div class="v">${todo.length}</div><div class="k">a fazer antes da viagem</div></div><div class="stat"><div class="v" style="font-size:1.5rem">${brl(total)}</div><div class="k">${done.length} ${done.length === 1 ? "item feito" : "itens feitos"}</div></div></div>
  <div class="card stack"><h3>A fazer</h3>${todo.length ? `<div class="loglist">${todo.map(row).join("")}</div>` : `<p class="muted">Nada pendente${list.length ? ". Moto pronta 🏍️" : "."}</p>`}
    ${mine ? `<div class="label">Sugestões</div><div class="seq">${REV_SUG.filter(s => !have.has(s.toLowerCase())).map(s => `<button type="button" class="chipbtn" data-act="addRev" data-v="${esc(s)}">+ ${esc(s)}</button>`).join("")}</div>` : ""}</div>
  ${done.length ? `<div class="card stack"><h3>Feito</h3><div class="loglist">${done.map(row).join("")}</div></div>` : ""}
  <p class="note">Ao marcar como feito com valor, dá para lançar o custo em <b>Meus gastos</b> (só você vê), na categoria Moto.</p>`;
}
function revForm(x) {
  const id = canEdit(viewRider) ? viewRider : me(), isNew = !x?.id, own = id === me() || ST.mode === "local";
  x = { item: "", done: false, date: todayISO(), km: "", valor: "", obs: "", ...(x || {}) };
  openSheet(`<h3>${isNew ? "Novo item" : "Editar item"}</h3><form id="rvF" class="stack">
    <label class="field"><span>Item</span><input id="rvI" value="${esc(x.item)}" required placeholder="Ex.: troca de óleo"></label>
    <label class="check"><input type="checkbox" id="rvD" ${x.done ? "checked" : ""}> Feito</label>
    <div class="grid2"><label class="field"><span>Data</span><input id="rvDt" type="date" value="${x.date || ""}"></label><label class="field"><span>Hodômetro (km)</span><input id="rvK" inputmode="numeric" value="${x.km ?? ""}"></label></div>
    <div class="grid2"><label class="field"><span>Valor (R$)</span><input id="rvV" inputmode="decimal" value="${x.valor ?? ""}"></label><label class="field"><span>Oficina / obs.</span><input id="rvO" value="${esc(x.obs || "")}"></label></div>
    ${own && !x.prep ? `<label class="check"><input type="checkbox" id="rvP" checked> Lançar o valor em Meus gastos</label>` : ""}
    <div class="actions">${isNew ? `<button type="button" class="btn" data-close="1">Cancelar</button>` : `<button type="button" class="btn danger" id="rvDel">Excluir</button>`}<button class="btn primary">Salvar</button></div></form>`, sh => {
    sh.querySelector("#rvF").addEventListener("submit", ev => { ev.preventDefault();
      const item = sh.querySelector("#rvI").value.trim(); if (!item) return;
      const rid = x.id || newId(), valor = parseNum(sh.querySelector("#rvV").value), done = sh.querySelector("#rvD").checked;
      const data = { item, done, date: sh.querySelector("#rvDt").value, km: parseNum(sh.querySelector("#rvK").value), valor, obs: sh.querySelector("#rvO").value.trim(), created: x.created || Date.now(), prep: x.prep || null };
      const pc = sh.querySelector("#rvP");
      if (pc?.checked && done && valor) { data.prep = newId(); store.putPrep(data.prep, { cat: "moto", desc: item, amount: Math.round(valor * 100) / 100, date: data.date, liters: null, ppl: null, created: Date.now(), show: false }); }
      else if (x.prep && valor && own) store.putPrep(x.prep, { ...(S.prep?.[x.prep] || { cat: "moto", show: false, created: Date.now() }), desc: item, amount: Math.round(valor * 100) / 100, date: data.date });
      store.merge("riders/" + id, { revisao: { [rid]: data } }); closeSheet(); toast(data.prep && !x.prep ? "Salvo e lançado em Meus gastos" : "Salvo");
    });
    const del = sh.querySelector("#rvDel"); let armed = false;
    del && del.addEventListener("click", () => { if (!armed) { armed = true; del.textContent = "Toque de novo para excluir"; return; }
      store.merge("riders/" + id, { revisao: { [x.id]: null } }); closeSheet(); toast("Item excluído (o gasto, se lançado, continua em Meus gastos)"); });
  });
}

/* ---------- MODO PILOTANDO ---------- */
let rideWatch = null, rideLock = null, rideClock = null, ridePos = null;
function startRide() {
  if (rideWatch == null && navigator.geolocation) rideWatch = navigator.geolocation.watchPosition(p => { ridePos = { lat: p.coords.latitude, lng: p.coords.longitude, at: Date.now(), speed: p.coords.speed }; fillRide(); }, () => {}, { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 });
  if (!rideLock && navigator.wakeLock) navigator.wakeLock.request("screen").then(l => { rideLock = l; l.addEventListener?.("release", () => { rideLock = null; }); }).catch(() => {});
  if (!rideClock) rideClock = setInterval(fillRide, 30000);
}
function stopRide() {
  if (rideWatch != null) { navigator.geolocation.clearWatch(rideWatch); rideWatch = null; }
  if (rideLock) { rideLock.release().catch(() => {}); rideLock = null; }
  if (rideClock) { clearInterval(rideClock); rideClock = null; }
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && route === "pilotando" && !rideLock && navigator.wakeLock) navigator.wakeLock.request("screen").then(l => { rideLock = l; }).catch(() => {}); });
function rideDay() { const ds = days(), t = todayISO(); return ds.find(d => d.date === t) || ds.find(d => d.date > t) || ds[ds.length - 1]; }
function pilotando() {
  const d = rideDay(); if (!d) return `<p>Sem dias no roteiro.</p>`;
  return `<div class="ride">
    <div class="ride-top"><div><div class="ride-clock" id="rideClock">--h--</div><div class="ride-day">${wd(d.date)} ${fmtD(d.date)} · ${esc(d.title)}</div></div><a class="btn" href="#inicio">Sair</a></div>
    <div id="rideBody" class="ride-body"><p class="muted">Carregando…</p></div>
    <div class="ride-nav"><button class="btn primary" data-act="navG" data-id="${d.id}" data-here="1">🧭 Google Maps</button><button class="btn" data-act="navW" data-id="${d.id}" data-here="1">Waze</button></div>
    <div class="ride-btns"><button class="btn" data-act="sendLoc">📍 Localização</button><button class="btn" data-act="sendOk">✅ Cheguei bem</button><a class="btn sos1" href="tel:192">📞 192</a></div>
    <p class="ride-note" id="rideGps">${navigator.geolocation ? "Procurando GPS…" : "GPS indisponível: posição estimada pelo horário."} A tela fica acesa enquanto este modo estiver aberto.</p>
  </div>`;
}
async function fillRide() {
  const body = $("#rideBody"); if (!body) return;
  const now = new Date(), nowH = now.getHours() + now.getMinutes() / 60;
  const ck = $("#rideClock"); if (ck) ck.textContent = `${pad(now.getHours())}h${pad(now.getMinutes())}`;
  const d = rideDay(), m = me() || riderIds()[0];
  const gps = $("#rideGps"); if (gps && ridePos) gps.textContent = `GPS ok · atualizado às ${pad(new Date(ridePos.at).getHours())}h${pad(new Date(ridePos.at).getMinutes())}. A tela fica acesa enquanto este modo estiver aberto.`;
  const w = await dayWx(d), hrNow = w?.day?.hours?.find(h => h.h === now.getHours());
  const wxTile = hrNow ? `<div class="rt"><small>Tempo agora · ${esc(w.loc.name)}</small><b>${wxInfo(hrNow.code, !hrNow.day).icon} ${tC(hrNow.t)}</b><span>${hrNow.prob != null ? `chuva ${hrNow.prob}%` : ""}</span></div>` : "";
  if (isRoad(d) && tripEnds(d)[1]) {
    const P = await fuelPlanDay(d); if (!P || !body.isConnected) { body.innerHTML = wxTile; return; }
    const S2 = P.R.stops, total = P.total; let cur;
    if (ridePos) { let best = null;
      for (let i = 1; i < S2.length; i++) { const a = S2[i - 1], b = S2[i], da = distKm(a, ridePos), db = distKm(ridePos, b), det = da + db - distKm(a, b);
        if (!best || det < best.det) best = { det, km: a.km + (b.km - a.km) * da / Math.max(.1, da + db) }; }
      cur = best.km; }
    else { const t0 = toH(d.saida) ?? 6; cur = Math.max(0, Math.min(total, (nowH - t0) * avgSpeed())); }
    rideCur = cur;
    const next = S2.find(s => s.km > cur + 1) || S2[S2.length - 1], left = Math.max(0, total - cur);
    const mf = P.riders.find(r => r.id === m), nf = mf && !mf.missing ? mf.stops.find(s => s.km > cur + 1) : null;
    body.innerHTML = `
      <div class="rt big"><small>Próxima cidade</small><b>${esc(next.name)}</b><span>${num(Math.max(0, next.km - cur))} km</span></div>
      <div class="rt"><small>Destino · ${esc(P.dest)}</small><b>${num(left)} km</b><span>chegada ~${hhmm(nowH + left / avgSpeed())}</span></div>
      <div class="rt ${nf && nf.km - cur < 40 ? "hot" : ""}"><small>Abastecer (${esc(rname(m))})</small><b>${mf?.missing ? "—" : nf ? `${nf.posto ? "⛽ " : ""}${esc(nf.name)}` : "até o destino"}</b><span>${nf ? `em ${num(nf.km - cur)} km` : mf?.missing ? "informe tanque e consumo" : "um tanque dá"}</span></div>
      ${wxTile}`;
  } else {
    const ps = allPoints().filter(p => p.circ === d.circ && p.lat != null);
    const lst = ps.map(p => ({ p, km: ridePos ? distKm(ridePos, p) : null })).sort((a, b) => ridePos ? a.km - b.km : (a.p.order || 0) - (b.p.order || 0));
    body.innerHTML = `${wxTile}<div class="rt"><small>Pontos do dia</small><ul class="ride-list">${lst.map(o => `<li><a href="https://www.google.com/maps/dir/?api=1&destination=${o.p.lat},${o.p.lng}" target="_blank" rel="noopener">${esc(o.p.name)}</a><span>${o.km != null ? num(o.km, o.km < 10 ? 1 : 0) + " km" : ""}</span></li>`).join("") || "<li>Sem pontos marcados</li>"}</ul></div>`;
  }
}

/* ---------- NAVEGAR (Google Maps / Waze) ---------- */
let rideCur = null; // km já rodados no dia, calculado no modo pilotando
// Google Maps no celular aceita até 3 paradas: tira as que ficam mais perto da anterior
const pickEven = (arr, n, start = 0) => { const a = [...arr]; while (a.length > n) { let k = 0, min = Infinity; a.forEach((x, i) => { const g = (x.km ?? i) - (i ? (a[i - 1].km ?? i - 1) : start); if (g < min) { min = g; k = i; } }); a.splice(k, 1); } return a; };
async function navTargets(d, fromHere) {
  if (isRoad(d) && tripEnds(d)[1]) {
    const R = await routeStops(d); if (!R) return null;
    let st = R.stops, origin = st[0];
    if (fromHere && rideCur != null) { st = st.filter(s => s.km > rideCur + 1); origin = null; }
    if (!st.length) st = [R.stops[R.stops.length - 1]];
    const dest = st[st.length - 1], mid = st.slice(fromHere ? 0 : 1, -1);
    return { origin, dest, wps: pickEven(mid, 3) };
  }
  const ps = allPoints().filter(p => p.circ === d.circ && p.lat != null && p.id !== "pousada").sort((a, b) => (a.order || 0) - (b.order || 0));
  if (!ps.length) return null;
  return { origin: null, dest: ps[ps.length - 1], wps: pickEven(ps.slice(0, -1), 3) };
}
const ll2 = p => `${p.lat},${p.lng}`;
async function navOpen(d, app, fromHere) {
  // rota salva pelo grupo (link do Google Maps) vale mais que a montada pelo app; no meio do caminho, sai da posição atual
  if (app === "google" && d.gmaps && !(fromHere && rideCur > 5)) { location.href = d.gmaps; return; }
  const T = await navTargets(d, fromHere); if (!T) { toast("Sem pontos com posição para navegar neste dia"); return; }
  location.href = app === "waze" ? `https://waze.com/ul?ll=${ll2(T.dest)}&navigate=yes`
    : `https://www.google.com/maps/dir/?api=1${T.origin ? "&origin=" + ll2(T.origin) : ""}&destination=${ll2(T.dest)}${T.wps.length ? "&waypoints=" + T.wps.map(ll2).join("%7C") : ""}&travelmode=driving`;
}
const navBtns = (d, here) => `<div class="navbtns"><button class="btn sm" data-act="navG" data-id="${d.id}" ${here ? 'data-here="1"' : ""}>🧭 Google Maps${d.gmaps ? " · rota de vocês" : ""}</button><button class="btn sm" data-act="navW" data-id="${d.id}" ${here ? 'data-here="1"' : ""}>Waze</button></div>`;

/* ---------- EXPORTAR GASTOS (planilha) ---------- */
function downloadCSV(name, rows) {
  const cell = v => { const s = v == null ? "" : typeof v === "number" ? String(v).replace(".", ",") : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = "﻿" + rows.map(r => r.map(cell).join(";")).join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const money = v => (Number(v) || 0).toFixed(2).replace(".", ",");
const brDate = iso => iso ? iso.split("-").reverse().join("/") : "";
function exportGastos(kind) {
  if (kind === "prep") {
    const m = me() || riderIds()[0];
    const list = [...prepExpenses().map(e => ({ ...e, _o: "Preparação" })), ...tripExpenses().filter(e => e.rider === m && !e.fromPrep).map(e => ({ ...e, _o: "Viagem" }))].sort(byDate).reverse();
    downloadCSV(`meus-gastos-${slug(rname(m))}-${todayISO()}.csv`, [["Data", "Origem", "Categoria", "Descrição", "Valor (R$)", "Exibido para o grupo"],
      ...list.map(e => [brDate(e.date), e._o, catLabel(e.cat), e.desc || "", money(e.amount), e._o === "Preparação" ? (e.show ? "sim" : "não") : ""])]);
  } else {
    const list = [...tripExpenses()].sort(byDate).reverse();
    downloadCSV(`gastos-viagem-${todayISO()}.csv`, [["Data", "Quem pagou", "Categoria", "Descrição", "Valor (R$)", "Dividido", "Litros", "R$/L"],
      ...list.map(e => [brDate(e.date), rname(e.rider), catLabel(e.cat), e.desc || "", money(e.amount), e.shared ? "sim" : "não", e.liters || "", e.ppl || ""])]);
  }
  toast("Planilha baixada (abre no Excel ou no Google Planilhas)");
}

/* ---------- FOTOS POR DIA ---------- */
const photos = () => Object.entries(S.photos || {}).map(([id, p]) => ({ id, ...p })).sort((a, b) => (a.created || 0) - (b.created || 0));
async function compressImg(file, max, q) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    let qq = q, out = c.toDataURL("image/jpeg", qq);
    while (out.length > 700000 && qq > .35) { qq -= .1; out = c.toDataURL("image/jpeg", qq); }
    return out;
  } finally { URL.revokeObjectURL(url); }
}
async function addPhotos(dayId, files) {
  const m = me(); if (!m) return pickMe();
  const d = days().find(x => x.id === dayId); const list = [...files].filter(f => f.type.startsWith("image/")).slice(0, 10);
  let ok = 0;
  for (const [i, f] of list.entries()) {
    toast(`Preparando foto ${i + 1} de ${list.length}…`);
    try {
      const [full, thumb] = await Promise.all([compressImg(f, 1600, .78), compressImg(f, 360, .62)]);
      await store.putPhoto(newId(), { rider: m, day: dayId, date: d?.date || todayISO(), thumb, caption: "", created: Date.now() }, full); ok++;
    } catch (er) { toast(er.message || "Não deu para salvar a foto"); break; }
  }
  if (ok) toast(ok === 1 ? "Foto salva" : `${ok} fotos salvas`);
}
const thumbs = (list, limit) => list.slice(0, limit || 99).map(p => `<button type="button" class="ph" data-act="openPhoto" data-id="${p.id}"><img src="${p.thumb}" alt="${esc(p.caption || "Foto")}" loading="lazy"></button>`).join("");
function dayPhotos(d) {
  const list = photos().filter(p => p.day === d.id);
  return `<div><div class="between"><div class="label">Fotos${list.length ? ` · ${list.length}` : ""}</div>
    <label class="btn sm">+ Fotos<input type="file" accept="image/*" multiple hidden data-photo-day="${d.id}"></label></div>
    ${list.length ? `<div class="phgrid">${thumbs(list)}</div>` : `<p class="muted" style="font-size:.82rem">Nenhuma foto deste dia ainda.</p>`}
    ${ST.photoError ? `<p class="err" style="font-size:.8rem">${esc(ST.photoError)}</p>` : ""}</div>`;
}
function photoSheet(id) {
  const p = S.photos?.[id]; if (!p) return;
  const own = p.rider === me() || ST.mode === "local", d = days().find(x => x.id === p.day);
  openSheet(`<div class="phview"><img id="phImg" src="${p.thumb}" alt=""></div>
    <div class="muted" style="font-size:.82rem">${esc(rname(p.rider))} · ${d ? `${wd(d.date)} ${fmtD(d.date)} · ${esc(d.title)}` : ""}</div>
    ${own ? `<label class="field"><span>Legenda</span><input id="phCap" value="${esc(p.caption || "")}" maxlength="140" placeholder="Ex.: Cachoeira da Fumaça"></label>` : p.caption ? `<p>${esc(p.caption)}</p>` : ""}
    <div class="actions">${own ? `<button type="button" class="btn danger" id="phDel">Excluir</button>` : ""}<a class="btn" id="phDl" download="foto-${id}.jpg" href="${p.thumb}">Baixar</a>${own ? `<button type="button" class="btn primary" id="phSave">Salvar</button>` : `<button class="btn" data-close="1">Fechar</button>`}</div>`, async sh => {
    const full = await store.getPhotoFull(id);
    if (full && sh.isConnected) { sh.querySelector("#phImg").src = full; sh.querySelector("#phDl").href = full; }
    sh.querySelector("#phSave")?.addEventListener("click", () => { store.mergePhoto(id, { caption: sh.querySelector("#phCap").value.trim() }); closeSheet(); toast("Legenda salva"); });
    const del = sh.querySelector("#phDel"); let armed = false;
    del?.addEventListener("click", () => { if (!armed) { armed = true; del.textContent = "Toque de novo para excluir"; return; } store.removePhoto(id); closeSheet(); toast("Foto excluída"); });
  });
}

/* ---------- NOVIDADES (avisos dentro do app) ---------- */
const seenGet = () => { try { const v = +localStorage.getItem("seenAt"); if (v) return v; localStorage.setItem("seenAt", String(Date.now())); } catch (e) {} return Date.now(); };
const seenSet = () => { try { localStorage.setItem("seenAt", String(Date.now())); } catch (e) {} };
function events() {
  const m = me(), out = [], now = Date.now();
  tripExpenses().filter(e => e.rider !== m && e.created).forEach(e => out.push({ at: e.created, ic: "💸", tx: `${rname(e.rider)} lançou ${catLabel(e.cat)}${e.desc ? ` (${e.desc})` : ""}: ${brl(e.amount)}${e.shared ? " · dividido" : ""}`, href: "#gastos" }));
  checkins().filter(c => c.rider !== m).forEach(c => out.push({ at: c.at, ic: c.kind === "ok" ? "✅" : "📍", tx: `${rname(c.rider)} ${c.kind === "ok" ? `chegou bem${c.place ? " em " + c.place : ""}` : "mandou a localização"}`, href: "#seguranca" }));
  photos().filter(p => p.rider !== m).forEach(p => out.push({ at: p.created, ic: "📷", tx: `${rname(p.rider)} adicionou uma foto${p.caption ? `: ${p.caption}` : ""}`, href: "#resumo" }));
  const ds = days(); if (ds.length) {
    const st = parseISO(ds[0].date).getTime();
    [[30, "📅", "Falta 1 mês para a saída"], [7, "📅", "Falta 1 semana para a saída. Hora de fechar o checklist"], [1, "🏍️", "Amanhã é dia de estrada!"]].forEach(([n, ic, tx]) => out.push({ at: st - n * 864e5 + 8 * 3600e3, ic, tx, href: "#inicio" }));
    out.push({ at: st - 15 * 864e5 + 7 * 3600e3, ic: "🌦️", tx: "A previsão do tempo do 1º dia saiu: confira no Roteiro", href: "#roteiro" });
  }
  return out.filter(e => e.at && e.at <= now).sort((a, b) => b.at - a.at);
}
let toastedAt = Date.now();
function newsCheck() {
  const ev = events(), seen = seenGet(), fresh = ev.filter(e => e.at > seen).length;
  const btn = $("#menuBtn"); if (btn) { let b = btn.querySelector(".badge"); if (fresh) { if (!b) { b = document.createElement("span"); b.className = "badge"; btn.appendChild(b); } b.textContent = fresh > 9 ? "9+" : fresh; } else b?.remove(); }
  const nw = ev.find(e => e.at > toastedAt && e.at > Date.now() - 120000 && e.ic !== "📅");
  if (nw) { toastedAt = nw.at; toast(`${nw.ic} ${nw.tx}`); }
  return fresh;
}
function novidades() {
  const seen = seenGet(), ev = events().slice(0, 60);
  setTimeout(() => { seenSet(); newsCheck(); }, 800);
  const fmt = at => { const d = new Date(at); return `${WD[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}h${pad(d.getMinutes())}`; };
  return `${backLink}<h2>Novidades</h2>
  <p class="muted" style="font-size:.85rem">O que o outro piloto fez no app (gastos, avisos, fotos) e os lembretes da viagem. As novas desde a última vez que você olhou ficam destacadas.</p>
  <div class="card">${ev.length ? `<ul class="news">${ev.map(e => `<li class="${e.at > seen ? "new" : ""}"><span>${e.ic}</span><a href="${e.href}">${esc(e.tx)}</a><small>${fmt(e.at)}</small></li>`).join("")}</ul>` : `<p class="muted">Nada por aqui ainda.</p>`}</div>`;
}

/* ---------- RESUMO DA EXPEDIÇÃO ---------- */
function resumo() {
  const ds = days(), ids = riderIds(), ex = tripExpenses(), ph = photos();
  const first = ds[0], last = ds[ds.length - 1];
  const kmReal = ids.map(id => ({ id, st: logStats(id) }));
  const kmR = Math.max(0, ...kmReal.map(o => o.st.km));
  const fuelL = ex.filter(e => e.cat === "combustivel").reduce((s, e) => s + (Number(e.liters) || 0), 0);
  const ck = checkins().filter(c => c.kind === "ok").length;
  return `${backLink}<div class="between"><h2>Resumo</h2><button class="btn sm primary" data-act="shareSum">Compartilhar</button></div>
  <div class="hero"><div class="label" style="color:var(--asphalt-muted)">${esc(S.trip.name || "Expedição")}</div>
    <div class="big" style="font-size:2.2rem">${first ? `${fmtD(first.date)} → ${fmtD(last.date)}` : ""}</div>
    <div class="sub">${ds.length} dias · ${ids.map(id => `${esc(rname(id))} (${esc(S.riders[id].moto || "")})`).join(" e ")}</div></div>
  <div class="stats">
    <div class="stat"><div class="v">${num(totalKm())}</div><div class="k">km no roteiro</div></div>
    <div class="stat"><div class="v">${kmR ? num(kmR) : "—"}</div><div class="k">km rodados (diário de bordo)</div></div>
    <div class="stat"><div class="v" style="font-size:1.5rem">${brl(sumAmt(ex))}</div><div class="k">gastos da viagem</div></div>
    <div class="stat"><div class="v">${num(fuelL)} L</div><div class="k">combustível lançado</div></div>
    ${kmReal.map(o => `<div class="stat"><div class="v">${o.st.real ? num(o.st.real, 1) : "—"}</div><div class="k">km/L real · ${esc(rname(o.id))}</div></div>`).join("")}
    ${ids.map(id => `<div class="stat"><div class="v" style="font-size:1.5rem">${brl(myTripCost(id))}</div><div class="k">parte de ${esc(rname(id))}</div></div>`).join("")}
    <div class="stat"><div class="v">${ph.length}</div><div class="k">fotos</div></div>
    <div class="stat"><div class="v">${ck}</div><div class="k">“cheguei bem”</div></div>
  </div>
  ${catBars(ex)}
  <div class="card stack"><h3>Dia a dia</h3>${ds.map((d, i) => { const p = ph.filter(x => x.day === d.id), c = CIRCUITS[d.circ] || CIRCUITS.estrada;
    return `<div class="sumday" style="--c:${c.color}"><div><b>Dia ${i + 1} · ${wd(d.date)} ${fmtD(d.date)}</b><span>${esc(d.title)}${d.km ? ` · ${num(d.km)} km` : ""}</span></div>${p.length ? `<div class="phgrid sm">${thumbs(p, 4)}</div>` : ""}</div>`; }).join("")}</div>
  ${ph.length ? `<div class="card stack"><h3>Fotos</h3><div class="phgrid">${thumbs(ph)}</div></div>` : ""}
  <div class="row"><button class="btn sm" data-act="exportCSV" data-v="trip">Exportar gastos (planilha)</button></div>`;
}
function shareSummary() {
  const ds = days(), ex = tripExpenses();
  const kmR = Math.max(0, ...riderIds().map(id => logStats(id).km));
  const lines = [`🏍️ ${S.trip.name || "Expedição Chapada"}`, ds.length ? `${fmtD(ds[0].date)} a ${fmtD(ds[ds.length - 1].date)} · ${ds.length} dias` : "",
    `${num(kmR || totalKm())} km ${kmR ? "rodados" : "no roteiro"}`, ...riderIds().map(id => { const r = logStats(id).real; return `${rname(id)} · ${S.riders[id].moto || ""}${r ? ` · ${num(r, 1)} km/L` : ""}`; }),
    `Gastos da viagem: ${brl(sumAmt(ex))}`, `${photos().length} fotos`, "", "https://jacobbv.github.io/expedicao-chapada/"].filter(x => x !== null);
  const text = lines.join("\n");
  if (navigator.share) navigator.share({ title: S.trip.name || "Expedição Chapada", text }).catch(() => {});
  else location.href = waHref("", text);
}

/* ---------- TEMPO ---------- */
const tC = v => v == null ? "—" : Math.round(v) + "°";
const low = s => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const hhmm = h => { let H = Math.floor(h), M = Math.round((h - H) * 60); if (M === 60) { H++; M = 0; } return `${pad(H % 24)}h${pad(M)}`; };
const toH = s => { if (!s) return null; const [h, m] = s.split(":").map(Number); return h + m / 60; };
const isRoad = d => d.tipo === "estrada" || d.circ === "estrada";
const tripEnds = d => { const [a, b = ""] = (d.title || "").split("→"); return [a.trim(), b.split("+")[0].trim()]; };
const cleanCity = s => s.split("/")[0].replace(/\(.*?\)/g, "").trim();
function knownPlace(name) {
  const n = low(name); if (!n) return null;
  if (n.startsWith("lencois")) { const p = S.points?.pousada; return p?.lat != null ? { lat: p.lat, lng: p.lng, name: "Lençóis" } : null; }
  const hit = Object.values(S.points || {}).find(p => p.lat != null && (low(p.name) === n || low(p.name).startsWith(n + " ") || low(p.name).startsWith(n)));
  return hit ? { lat: hit.lat, lng: hit.lng, name: hit.name } : null;
}
function dayLoc(d) {
  const P = S.points || {};
  const pt = id => P[id] && P[id].lat != null ? { lat: P[id].lat, lng: P[id].lng, name: id === "pousada" ? "Lençóis" : P[id].name } : null;
  const byCirc = { chegada: "pousada", c1: "paiinacio", c2: "capao", c3: "pousada", planob: "lapadoce", folga: "pousada" };
  if (!isRoad(d) || d.circ !== "estrada" && !tripEnds(d)[1]) return pt(byCirc[d.circ] || "pousada") || pt("pousada");
  const dest = tripEnds(d)[1] || d.title;
  return knownPlace(cleanCity(dest)) || pt("pousada");
}
function viaNames(d) {
  const [o, de] = tripEnds(d); if (!de) return [];
  const usable = v => (v || "").split("·").map(cleanCity).filter(x => x && !/^[A-Z]{2}-?\d/.test(x) && !/mesmo|corredor|sentido|contr[aá]rio/i.test(x));
  let list = usable(d.via);
  if (list.length < 2) {
    const twin = days().find(x => x.id !== d.id && x.via && low(cleanCity(tripEnds(x)[0])) === low(cleanCity(de)) && low(cleanCity(tripEnds(x)[1])) === low(cleanCity(o)) && usable(x.via).length >= 2);
    if (twin) list = usable(twin.via).reverse();
  }
  if (!list.length || low(list[0]) !== low(cleanCity(o))) list.unshift(cleanCity(o));
  if (low(list[list.length - 1]) !== low(cleanCity(de))) list.push(cleanCity(de));
  return list;
}
const avgSpeed = () => Number(S.trip?.avgSpeed) || 70;
async function routeStops(d) {
  const names = viaNames(d); if (names.length < 2) return null;
  const out = []; let prev = null;
  for (const n of names) { const p = knownPlace(n) || await geocode(n, prev); if (!p) continue; prev = p; out.push({ name: n, lat: p.lat, lng: p.lng }); }
  if (out.length < 2) return null;
  let acc = 0; out.forEach((s, i) => { if (i) acc += distKm(out[i - 1], s); s.line = acc; });
  const f = d.km && acc ? d.km / acc : 1.25, speed = avgSpeed(), t0 = toH(d.saida) ?? 6;
  out.forEach(s => { s.km = Math.round(s.line * f); s.eta = t0 + s.km / speed; });
  return { stops: out, assumed: !d.saida, speed };
}
async function dayWx(d) {
  const loc = dayLoc(d); if (!loc) return null;
  const plan = wxPlan(d.date, todayISO());
  const [day, typ] = await Promise.all([wxDay(loc.lat, loc.lng, plan), plan.kind === "ref" ? wxTypical(loc.lat, loc.lng, plan.target) : null]);
  return { loc, plan, day, typ };
}
function wxChips(w) {
  const v = w?.day; if (!v || w.plan.kind === "ref") return [];
  const c = [];
  if (v.tmax >= 34) c.push(["warn", `🔥 ${tC(v.tmax)} à tarde`]);
  if (v.prob != null && v.prob >= 60) c.push(["info", `🌧️ ${v.prob}% de chuva`]); else if (v.rain >= 5) c.push(["info", `🌧️ ${num(v.rain)} mm`]);
  if (v.gust >= 45) c.push(["warn", `💨 rajadas de ${Math.round(v.gust)} km/h`]);
  if (v.uv >= 11) c.push(["warn", `☀️ UV ${Math.round(v.uv)}`]);
  return c;
}
const chipsW = list => list.length ? `<div class="wxchips">${list.map(([k, t]) => `<span class="wxchip ${k}">${t}</span>`).join("")}</div>` : "";
const rainBits = v => [v.prob != null ? `💧 ${v.prob}%` : null, v.rain != null ? `${num(v.rain, v.rain < 10 ? 1 : 0)} mm` : null, v.gust != null ? `💨 rajadas ${Math.round(v.gust)} km/h` : null].filter(Boolean).join(" · ");
function wxRender(w, mode, d) {
  if (!w) return "";
  const { plan, day: v, typ, loc } = w;
  if (mode === "chip") return plan.kind === "forecast" && v ? `${wxInfo(v.code).icon} ${tC(v.tmax)}/${tC(v.tmin)}` : "";
  if (mode === "rb") return plan.kind === "forecast" && v ? `${wxInfo(v.code).icon} ${tC(v.tmax)}/${tC(v.tmin)}${v.prob != null ? ` · ${v.prob}%` : ""}` : "—";
  // faixa do cartão do dia
  if (plan.kind === "ref") {
    if (!typ) return `<span class="muted">Sem dados do tempo agora (precisa de internet).</span>`;
    return `<button type="button" class="wxs" data-act="wxDay" data-id="${d.id}"><span class="ic">${typ.rainy * 2 >= typ.n ? "🌦️" : "🌤️"}</span>
      <span class="tx"><b>~${tC(typ.tmax)}/${tC(typ.tmin)}</b><small>Clima típico em ${esc(loc.name)} · choveu em ${typ.rainy} de ${typ.n} anos</small></span><span class="go">Ver ›</span></button>
      <p class="muted" style="font-size:.78rem;margin-top:6px">A previsão de verdade começa em ${fmtD(plan.availableFrom)}.</p>`;
  }
  if (!v) return `<span class="muted">Sem dados do tempo agora (precisa de internet).</span>`;
  const i = wxInfo(v.code);
  return `<button type="button" class="wxs" data-act="wxDay" data-id="${d.id}"><span class="ic">${i.icon}</span>
    <span class="tx"><b>${tC(v.tmax)}/${tC(v.tmin)}</b><small>${plan.kind === "past" ? "Como foi" : i.text} em ${esc(loc.name)} · ${rainBits(v)}</small></span><span class="go">Ver ›</span></button>${chipsW(wxChips(w))}`;
}

// Semana inteira no topo do Roteiro
function weekHTML(ds, ws) {
  const rows = ds.map((d, i) => {
    const w = ws[i]; if (!w) return null;
    if (w.plan.kind === "ref") { const t = w.typ; if (!t) return null;
      return { d, ic: t.rainy * 2 >= t.n ? "🌦️" : "🌤️", mn: t.tmin, mx: t.tmax, r: `${t.rainy}/${t.n}`, rt: `Choveu em ${t.rainy} de ${t.n} anos`, ref: true }; }
    const v = w.day; if (!v) return null;
    return { d, ic: wxInfo(v.code).icon, mn: v.tmin, mx: v.tmax, r: v.prob != null ? v.prob + "%" : num(v.rain, 1) + " mm", rt: v.prob != null ? "Chance de chuva" : "Chuva no dia", prob: v.prob };
  }).filter(Boolean);
  if (!rows.length) return `<h3>Tempo da viagem</h3><p class="muted">Sem dados do tempo agora (precisa de internet).</p>`;
  const lo = Math.min(...rows.map(r => r.mn)), hi = Math.max(...rows.map(r => r.mx)), span = Math.max(1, hi - lo);
  const anyRef = rows.some(r => r.ref), allRef = rows.every(r => r.ref);
  const passeio = rows.filter(r => !r.ref && r.prob != null && ["c1", "c2", "c3", "planob"].includes(r.d.circ));
  const wet = passeio.find(r => r.prob >= 70), dry = wet && passeio.filter(r => r !== wet && r.prob <= 30).sort((a, b) => a.prob - b.prob)[0];
  const cn = c => CIRC_BASE[c] || CIRCUITS[c]?.name || c, W = iso => wd(iso).replace(/^./, x => x.toUpperCase());
  return `<div class="between"><h3>Tempo da viagem</h3><span class="muted" style="font-size:.75rem">${allRef ? "clima típico · 5 anos" : anyRef ? "previsão + clima típico" : "previsão"}</span></div>
    <div class="week">${rows.map(r => `<button type="button" class="wk" data-act="wxDay" data-id="${r.d.id}"><b>${wd(r.d.date)} ${parseISO(r.d.date).getDate()}</b><span>${r.ic}</span><span class="mn">${tC(r.mn)}</span>
      <span class="bar"><i style="left:${((r.mn - lo) / span * 100).toFixed(0)}%;right:${((hi - r.mx) / span * 100).toFixed(0)}%"></i></span><span class="mx">${tC(r.mx)}</span><span class="r" title="${r.rt}">${r.r}</span></button>`).join("")}</div>
    ${anyRef ? `<p class="muted" style="font-size:.78rem">${allRef ? "Ainda falta muito: cada dia mostra a média do mesmo dia nos últimos 5 anos e em quantos choveu. A previsão entra sozinha 15 dias antes." : "Dias marcados com x/5 ainda são clima típico (em quantos dos últimos 5 anos choveu)."}</p>` : ""}
    ${wet && dry ? `<div class="wxalert">🌧️ ${W(wet.d.date)} ${fmtD(wet.d.date)} tem ${wet.prob}% de chuva no ${esc(cn(wet.d.circ))}. Dá para trocar com o ${esc(cn(dry.d.circ))} de ${W(dry.d.date)} ${fmtD(dry.d.date)} (${dry.prob}%): edite os dois dias.</div>` : ""}`;
}

// Folha "Tempo do dia"
function wxSheet(d) {
  openSheet(`<div id="wxS"><p class="muted">Carregando o tempo…</p></div><button class="btn" data-close="1">Fechar</button>`, async sh => {
    const box = sh.querySelector("#wxS");
    const w = await dayWx(d); if (!box.isConnected) return;
    if (!w || (!w.day && !w.typ)) { box.innerHTML = `<h3>Tempo</h3><p class="muted">Sem dados do tempo agora (precisa de internet).</p>`; return; }
    const { plan, day: v, typ, loc } = w, ref = plan.kind === "ref";
    const head = `<div class="wxhero${ref ? " ref" : ""}"><div class="pl">${wd(d.date)} ${fmtD(d.date)} · ${esc(d.title)}</div>`;
    let hero;
    if (ref && typ) hero = `${head}<div class="t sm">Clima típico</div><div class="c">${esc(loc.name)} · média de ${tC(typ.tmax)} / ${tC(typ.tmin)} · a previsão começa em ${fmtD(plan.availableFrom)}</div></div>`;
    else if (v) { const i = wxInfo(v.code); hero = `${head}<div class="t">${tC(v.tmax)}</div><div class="c">${plan.kind === "past" ? "Como foi · " : ""}${i.icon} ${i.text} em ${esc(loc.name)} · máx ${tC(v.tmax)} mín ${tC(v.tmin)}</div></div>`; }
    else hero = `${head}<div class="t sm">—</div></div>`;
    box.innerHTML = hero + `<div id="wxRoute"></div><div id="wxRest"></div>`;
    const alerts = [];
    // Estrada: tempo em cada cidade na hora que vocês passam
    let arrive = null;
    if (isRoad(d) && tripEnds(d)[1]) {
      const rb = box.querySelector("#wxRoute"); rb.innerHTML = `<p class="muted" style="font-size:.85rem">Calculando o caminho…</p>`;
      const R = await routeStops(d);
      if (R && rb.isConnected) {
        const vals = await Promise.all(R.stops.map(s => wxDay(s.lat, s.lng, plan)));
        R.stops.forEach((s, i) => { const hs = vals[i]?.hours || []; s.hr = s.eta < 24 ? hs.find(h => h.h === Math.round(s.eta) % 24) : null; });
        arrive = R.stops[R.stops.length - 1].eta;
        rb.innerHTML = `<div class="label" style="margin-top:4px">Na estrada, na hora que vocês passam${ref ? ` · referência: ${fmtD(plan.date)}/${plan.date.slice(0, 4)}` : ""}</div>
          <div class="wxroute">${R.stops.map((s, i) => { const h = s.hr, last = i === R.stops.length - 1;
            return `<div class="rs"><span class="h">${hhmm(s.eta)}</span><span class="dot${last ? " end" : ""}"></span><span class="n">${esc(s.name)}<small>${i === 0 ? "saída" : last ? `chegada · ${num(s.km)} km` : `${num(s.km)} km`}</small></span>
              <span class="w">${h ? `${wxInfo(h.code, !h.day).icon} ${tC(h.t)}<small>${h.prob != null ? h.prob + "%" : h.rain ? num(h.rain, 1) + " mm" : "seco"}</small>` : `<small class="muted">—</small>`}</span></div>`; }).join("")}</div>
          <p class="muted" style="font-size:.75rem">Horários estimados: ${R.assumed ? "saída às 06h00 (defina a saída no dia) e " : ""}média de ${R.speed} km/h contando paradas. Ajuste a média em ☰ → Ajustes.</p>`;
        if (!ref) {
          const hrs = R.stops.map(s => ({ s, h: s.hr })).filter(o => o.h);
          const hot = hrs.filter(o => o.h.t >= 33); if (hot.length) alerts.push(["warn", `🔥 Calor forte a partir de ${esc(hot[0].s.name)} (${hhmm(hot[0].s.eta)}): até ${tC(Math.max(...hot.map(o => o.h.t)))}. Água e roupa ventilada.`]);
          const wetS = hrs.find(o => (o.h.prob ?? 0) >= 50 || o.h.rain >= 1); if (wetS) alerts.push(["info", `🌧️ Chuva provável perto de ${esc(wetS.s.name)} por volta das ${hhmm(wetS.s.eta)}. Capa de chuva à mão.`]);
        }
      } else if (rb.isConnected) rb.innerHTML = "";
    }
    const rest = box.querySelector("#wxRest"); if (!rest || !rest.isConnected) return;
    if (v) {
      const ss = toH(v.sunset);
      if (arrive != null && ss != null) alerts.push(arrive > ss - .5 ? ["warn", `🌙 Chegada prevista às ${hhmm(arrive)}, ${arrive > ss ? "depois" : "perto"} do pôr do sol (${v.sunset.replace(":", "h")}). Sair mais cedo ajuda.`] : ["ok", `🌅 Chegada às ${hhmm(arrive)}, antes do pôr do sol (${v.sunset.replace(":", "h")}).`]);
      if (!ref) {
        if (v.gust >= 45) alerts.push(["warn", `💨 Rajadas de até ${Math.round(v.gust)} km/h${v.dir != null ? `, vindo de ${windFrom(v.dir)}` : ""}. Atenção em ponte e trecho aberto.`]);
        if (v.uv >= 11) alerts.push(["warn", `☀️ UV ${Math.round(v.uv)} (extremo). Protetor no pescoço e no rosto.`]);
        if (!isRoad(d) && v.hours?.length) {
          const mx = (a, b) => Math.max(0, ...v.hours.filter(h => h.h >= a && h.h <= b).map(h => h.prob ?? (h.rain >= .5 ? 60 : 0)));
          const am = mx(6, 11), pm = mx(12, 18);
          if (pm >= 50 && am < 40) alerts.push(["info", "🌦️ Chuva mais provável à tarde. Faça a trilha longa de manhã."]);
          else if (am >= 50) alerts.push(["info", "🌧️ Manhã com chance de chuva. Vale ter um plano B por perto."]);
        }
      }
    }
    if (ref && typ) alerts.push(["info", typ.rainy * 2 >= typ.n ? `🌦️ Nesse dia choveu em ${typ.rainy} de ${typ.n} anos. Capa à mão e trilhas de manhã.` : `☀️ Nesse dia costuma ser seco: choveu em ${typ.rainy} de ${typ.n} anos.`]);
    let html = alerts.map(([k, t]) => `<div class="wxalert ${k}">${t}</div>`).join("");
    if (ref && typ) html += `<div class="label">Esse mesmo dia nos últimos ${typ.n} anos</div>
      <div class="yrs">${typ.years.map(y => `<div class="yr">${y.y}<span class="i">${wxInfo(y.code).icon}</span><b>${tC(y.tmax)}</b><small>${y.rain < .1 ? "seco" : num(y.rain, y.rain < 10 ? 1 : 0) + " mm"}</small></div>`).join("")}</div>`;
    if (v?.hours?.length) {
      const focus = arrive != null && arrive < 24 ? Math.round(arrive) : (plan.kind === "forecast" && d.date === todayISO() ? new Date().getHours() : (toH(d.saida) != null ? Math.round(toH(d.saida)) : 8));
      const hs = v.hours.filter(h => h.h >= 5 && h.h <= 21);
      html += `<div class="label">Hora a hora · ${esc(loc.name)}${ref ? ` · ${fmtD(plan.date)}/${plan.date.slice(0, 4)}` : ""}</div>
        <div class="hours">${hs.map(h => `<div class="hr${h.h === focus ? " on" : ""}" ${h.h === focus ? 'data-focus="1"' : ""}>${pad(h.h)}h<span class="i">${wxInfo(h.code, !h.day).icon}</span><b>${tC(h.t)}</b><small>${h.prob != null ? h.prob + "%" : h.rain ? num(h.rain, 1) + "mm" : "–"}</small></div>`).join("")}</div>`;
    }
    const tiles = [];
    if (ref && typ) {
      tiles.push(["🌡️ Média", `${tC(typ.tmax)} / ${tC(typ.tmin)}`, "máxima / mínima"]);
      tiles.push(["🌧️ Choveu", `${typ.rainy} de ${typ.n}`, "anos nesse dia"]);
    }
    if (v) {
      if (!ref) tiles.push(["💨 Vento", `${Math.round(v.wind ?? 0)} km/h`, `Rajadas até ${Math.round(v.gust ?? 0)}${v.dir != null ? ` · vem de ${windFrom(v.dir)}` : ""}`]);
      if (!ref && v.uv != null) tiles.push(["☀️ Índice UV", `${Math.round(v.uv)}`, v.uv >= 11 ? "Extremo" : v.uv >= 8 ? "Muito alto" : v.uv >= 6 ? "Alto" : "Moderado"]);
      if (v.sunrise && v.sunset) { const len = toH(v.sunset) - toH(v.sunrise); tiles.push(["🌅 Sol", v.sunrise.replace(":", "h"), `Põe às ${v.sunset.replace(":", "h")} · ${hhmm(len)} de luz`]); }
      if (!ref) tiles.push(["💧 Chuva", v.prob != null ? `${v.prob}%` : `${num(v.rain, 1)} mm`, v.prob != null ? `${num(v.rain, v.rain < 10 ? 1 : 0)} mm no dia` : "no dia"]);
    }
    if (tiles.length) html += `<div class="grid2 wxtiles">${tiles.map(([l, val, s]) => `<div class="tile"><div class="label">${l}</div><div class="v">${val}</div><div class="s">${s}</div></div>`).join("")}</div>`;
    html += `<p class="muted" style="font-size:.72rem">Dados: Open-Meteo. ${ref ? "Clima típico é referência do passado, não previsão." : plan.kind === "forecast" ? "Previsão atualiza a cada 3 horas quando há internet." : ""}</p>`;
    rest.innerHTML = html;
    const f = rest.querySelector("[data-focus]"); if (f) f.parentElement.scrollLeft = f.offsetLeft - f.parentElement.offsetLeft - 60;
  });
}

function fillWx() {
  document.querySelectorAll("[data-wx]").forEach(el => {
    const d = days().find(x => x.id === el.dataset.wx); if (!d) return;
    dayWx(d).then(w => { if (el.isConnected) el.innerHTML = wxRender(w, el.dataset.mode, d); });
  });
  const wk = $("#wxWeek");
  if (wk) { const ds = days(); Promise.all(ds.map(dayWx)).then(ws => { if (wk.isConnected) wk.innerHTML = weekHTML(ds, ws); }); }
}

/* ---------- ROADBOOK ---------- */
function lodgingFor(i, ds) {
  const retIdx = ds.findIndex((x, k) => k > 1 && x.circ === "estrada"); const r = retIdx > 1 ? retIdx : ds.length - 1;
  const etapa = i === 0 ? "petrolina_ida" : i < r ? "lencois" : i === r ? "petrolina_volta" : null;
  if (!etapa) return i === ds.length - 1 ? "Casa" : "—";
  const ls = Object.values(S.lodging || {}).filter(l => l.etapa === etapa);
  const pick = ls.find(l => l.status === "confirmada") || ls.find(l => l.status === "escolhida");
  return pick ? pick.name + (pick.status === "confirmada" ? " ✓" : " (a reservar)") : "a definir";
}
function roadbook() {
  const ds = days();
  const cards = ds.map((d, i) => {
    const c = CIRCUITS[d.circ] || CIRCUITS.estrada;
    const via = (d.via || "").split("·").map(x => x.trim()).filter(Boolean);
    const pts = allPoints().filter(p => p.circ === d.circ && p.id !== "pousada" && d.circ !== "estrada");
    const note = d.notes || CIRCUITS[d.circ]?.nota || "";
    return `<section class="rb" style="--c:${c.color}">
      <header class="rb-head"><span>Dia ${i + 1} de ${ds.length}</span><span>${wd(d.date)} ${fmtD(d.date)}</span></header>
      <h3 class="rb-title">${esc(d.title)}</h3>
      <div class="rb-meta"><div><span>Saída</span><b>${d.saida ? d.saida.replace(":", "h") : "—"}</b></div><div><span>Moto</span><b>${d.km ? num(d.km) + " km" : "—"}</b></div><div><span>Tempo</span><b data-wx="${d.id}" data-mode="rb">—</b></div></div>
      ${isRoad(d) && tripEnds(d)[1] ? `<div class="rb-sec"><span>Abastecer</span><p data-fuel="${d.id}" data-mode="rb">—</p></div>` : ""}
      ${via.length > 1 ? `<div class="rb-sec"><span>Caminho</span><ol class="rb-via">${via.map(v => `<li>${esc(v)}</li>`).join("")}</ol></div>` : via.length ? `<div class="rb-sec"><span>Caminho</span><p>${esc(via[0])}</p></div>` : ""}
      ${pts.length ? `<div class="rb-sec"><span>Pontos</span><ol class="rb-pts">${pts.map(p => { const km = fromPousada(p); return `<li><b>${p.order || "•"}</b> ${esc(p.name)}${km != null ? ` <em>${num(km, km < 10 ? 1 : 0)} km</em>` : ""}${p.lat == null ? " <em>sem posição</em>" : ""}</li>`; }).join("")}</ol></div>` : ""}
      ${note ? `<p class="rb-note">${esc(note)}</p>` : ""}
      <footer class="rb-foot"><span>Pernoite: <b>${esc(lodgingFor(i, ds))}</b></span><span>Expedição Chapada</span></footer>
    </section>`;
  }).join("");
  return `<div class="rb-toolbar stack">${backLink}<div class="between"><h2>Roadbook</h2><button class="btn primary" data-act="printRb">Imprimir / salvar PDF</button></div>
    <p class="note">Um cartão de 10 × 15 cm por dia. Ao imprimir, escolha <b>Salvar como PDF</b> para guardar no celular, ou imprima direto. Se a impressora pedir tamanho, use 10 × 15 cm (ou A6, com margens mínimas). Km em linha reta a partir da pousada; o tempo (máx/mín e chance de chuva) aparece quando a previsão estiver disponível, 15 dias antes.</p></div>
    <div class="rb-grid" id="roadbookPages">${cards}</div>`;
}

/* ---------- eventos ---------- */
$("#view").addEventListener("click", e => {
  const vr = e.target.closest("[data-vr]"); if (vr) viewRider = vr.dataset.vr;
  const b = e.target.closest("[data-act]"); if (!b) return;
  const act = b.dataset.act, id = b.dataset.id;
  if (act === "pd") return; // tratado no change
  if (b.tagName === "BUTTON") e.preventDefault();
  if (ADMIN_ACTS.has(act) && !isAdmin()) { toast("Só o admin altera isso"); return; }
  if (act === "editDay") dayForm(S.trip.days.find(d => d.id === id));
  else if (act === "shiftDates") shiftForm();
  else if (act === "sendLoc") sendAlert("loc");
  else if (act === "navG" || act === "navW") { const d = days().find(x => x.id === id); if (d) navOpen(d, act === "navW" ? "waze" : "google", !!b.dataset.here); }
  else if (act === "exportCSV") exportGastos(b.dataset.v);
  else if (act === "openPhoto") photoSheet(id);
  else if (act === "shareSum") shareSummary();
  else if (act === "newRev") { if (canEdit(viewRider)) revForm(null); }
  else if (act === "addRev") { if (canEdit(viewRider)) revForm({ item: b.dataset.v }); }
  else if (act === "editRev") { if (!canEdit(viewRider)) return; const x = S.riders[viewRider]?.revisao?.[id]; if (x) revForm({ id, ...x }); }
  else if (act === "sendOk") sendAlert("ok");
  else if (act === "editEmerg") { if (canEdit(id) || isAdmin()) emergForm(id); }
  else if (act === "newLog") { if (canEdit(viewRider)) logForm(null); }
  else if (act === "editLog") { if (!canEdit(viewRider)) return; const e = S.riders[viewRider]?.diario?.[id]; if (e) logForm({ id, ...e }); }
  else if (act === "useReal") { const r = logStats(viewRider).real; if (r && canEdit(viewRider)) { store.merge("riders/" + viewRider, { consumo: Math.round(r * 10) / 10 }); toast("Consumo atualizado no perfil"); } }
  else if (act === "wxDay") { const d = S.trip.days.find(x => x.id === id); if (d) wxSheet(d); }
  else if (act === "addDay") { const ds = days(); const last = ds[ds.length - 1];
    const nd = { id: "d" + newId(), date: last ? addDays(last.date, 1) : S.trip.startDate, tipo: "folga", circ: "folga", title: "Dia de folga", km: null, saida: "", via: "", notes: "" };
    store.merge("trip", { days: [...S.trip.days, nd] }); openDays.add(nd.id); toast("Dia adicionado"); }
  else if (act === "insDay") { const d = S.trip.days.find(x => x.id === id); if (!d) return;
    const nd = { id: "d" + newId(), date: addDays(d.date, 1), tipo: "folga", circ: "folga", title: "Dia extra", km: null, saida: "", via: "", notes: "" };
    store.merge("trip", { days: [...S.trip.days.map(x => x.date > d.date ? { ...x, date: addDays(x.date, 1) } : x), nd] });
    openDays.add(nd.id); toast("Dia inserido · datas seguintes avançaram 1 dia"); }
  else if (act === "mapCirc") { mapFilter = b.dataset.v; if (mapView) mapView.lastFitKey = ""; go("mapa"); }
  else if (act === "mapf") { mapFilter = b.dataset.v; render(); }
  else if (act === "ptOpen") { const p = S.points?.[id]; if (!p) return; if (p.lat != null && mapView) mapView.focus(id); pointSheet(id); }
  else if (act === "newPt") pointForm(null, null);
  else if (act === "linkToggle") { linkOn = !linkOn; try { localStorage.setItem("linkOn", linkOn ? "1" : "0"); } catch (er) {}
    const lb = $("#linkBtn"); if (lb) { lb.setAttribute("aria-pressed", linkOn); lb.textContent = linkOn ? "✓ Pontos ligados" : "Ligar pontos"; }
    routeKey = ""; updateRoutes(); }
  else if (act === "cancelPlace") { mapView?.cancelPlacing(); setBanner(""); }
  else if (act === "vr") { viewRider = b.dataset.v; render(); }
  else if (act === "ef") { expFilter = b.dataset.v; render(); }
  else if (act === "clf") { clFilter = b.dataset.v; render(); }
  else if (act === "st") { const rid = viewRider; if (!canEdit(rid)) return; const s = b.dataset.s;
    store.merge("checklist/" + rid, { items: { [id]: s === baseStatus(rid, id) ? null : s } }); }
  else if (act === "openMenu") openMenu();
  else if (act === "printRb") { document.body.classList.add("printing-rb"); setTimeout(() => { window.print(); }, 50); }
  else if (act === "editSocial") { if (canEdit(id) || isAdmin()) socialForm(id); }
  else if (act === "newRider") { if (isAdmin()) riderForm(null); }
  else if (act === "editStory") { if (canEditAbout()) storyForm(); }
  else if (act === "gtab") { gastosTab = b.dataset.v; render(); }
  else if (act === "newExp") expForm(null, b.dataset.kind);
  else if (act === "editExp") openExpense(id, b.dataset.kind);
  else if (act === "lst") { const l = S.lodging[id]; const s = b.dataset.s; if (!l || l.status === s) return;
    if (s !== "opcao") for (const [oid, o] of Object.entries(S.lodging)) if (oid !== id && o.etapa === l.etapa && o.status !== "opcao") store.put("lodging", oid, { ...o, status: "opcao" });
    store.put("lodging", id, { ...l, status: s }); }
  else if (act === "editLodge") lodgeForm({ id, ...S.lodging[id] });
  else if (act === "newLodge") lodgeForm(null, b.dataset.etapa);
  else if (act === "newPend") pendForm();
  else if (act === "delPend") { e.preventDefault(); store.merge("meta/pend", { custom: { [id]: null }, done: { [id]: null } }); }
  else if (act === "editRider") riderForm(id);
  else if (act === "logout") store.signOut();
  else if (act === "export") { const blob = new Blob([store.exportJSON()], { type: "application/json" }); const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `expedicao-chapada-backup-${todayISO()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
  else if (act === "reset") { if (b.dataset.armed) { store.resetAll(); toast("Dados reiniciados"); } else { b.dataset.armed = "1"; b.textContent = "Toque de novo para apagar tudo e recomeçar"; } }
});
$("#view").addEventListener("toggle", e => { if (e.target.id === "clLegend") { try { localStorage.setItem("legendClosed", e.target.open ? "0" : "1"); } catch (er) {} } }, true);
$("#view").addEventListener("toggle", e => { const d = e.target.closest?.("[data-day]"); if (!d) return; d.open ? openDays.add(d.dataset.day) : openDays.delete(d.dataset.day); }, true);
$("#view").addEventListener("change", e => {
  const t = e.target;
  if (t.dataset.act === "pd") store.merge("meta/pend", { done: { [t.dataset.id]: t.checked ? true : null } });
  if (t.dataset.photoDay && t.files.length) { addPhotos(t.dataset.photoDay, t.files); t.value = ""; }
  if (t.id === "impFile" && t.files[0]) { const r = new FileReader(); r.onload = () => { try { store.importJSON(r.result); toast("Backup restaurado"); } catch (er) { toast("Arquivo inválido: " + er.message); } }; r.readAsText(t.files[0]); }
});
$("#view").addEventListener("submit", e => {
  if (e.target.id !== "setF") return; e.preventDefault();
  const patch = { gasPrice: parseNum($("#sGas").value) ?? S.trip.gasPrice };
  const sp = parseNum($("#sSpeed")?.value); if (sp && sp >= 20 && sp <= 150) patch.avgSpeed = Math.round(sp);
  if (isAdmin() && $("#sFer")) patch.feriasFim = $("#sFer").value || null;
  store.merge("trip", patch); toast("Ajustes salvos");
});

/* ---------- início ---------- */
route = location.hash.slice(1) || "inicio";
store.start((state, status) => { S = state; ST = status; render(); });

addEventListener("afterprint", () => document.body.classList.remove("printing-rb"));
