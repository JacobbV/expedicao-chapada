import { CIRCUITS, CHECKLIST, STATUS, PEND, ETAPAS, CATEGORIES, TRIP_CATS, PREP_CATS, LEGACY_PREP, PTYPES, baseStatus, addDays } from "./data.js";
import { createStore, newId } from "./store.js";
import { ensureLeaflet, MapView, pinHTML, distKm } from "./map.js";

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
const brl0 = v => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
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
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

/* ---------- identidade ---------- */
const riderIds = () => Object.keys(S.riders || {}).sort((a, b) => (a === "jaco" ? -1 : b === "jaco" ? 1 : a.localeCompare(b)));
const rname = id => S.riders?.[id]?.name || id;
function me() {
  if (ST.mode === "local") { try { const m = localStorage.getItem("me"); if (m && S.riders[m]) return m; } catch (e) {} return null; }
  const em = (ST.user || "").toLowerCase();
  return riderIds().find(id => (S.riders[id].email || "").toLowerCase() === em) || null;
}
const canEdit = rid => ST.mode === "local" || rid === me();

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
  const ids = riderIds(), list = expenses().filter(e => e.shared && e.cat in TRIP_CATS);
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
  const r = S.riders[rid]; const c = Number(r?.consumo);
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

const VIEWS = { inicio, roteiro, mapa, checklist, gastos, mais, hospedagem, pendencias, pilotos, ajustes };

function render() {
  if (!S || !ST) return;
  if (ST.mode === "cloud" && ST.authReady && !ST.user) return renderLogin();
  if ($("#layer .login")) $("#layer").innerHTML = "";
  if (!S.trip) { $("#view").innerHTML = `<div class="card"><p>${ST.error ? esc(ST.error) : "Baixando os dados da viagem…"}</p></div>`; renderTop(); return; }
  if (route === "mais") { route = "inicio"; history.replaceState(null, "", "#inicio"); setTimeout(openMenu, 0); }
  if (!VIEWS[route]) route = "inicio";
  if (!viewRider || !S.riders[viewRider]) viewRider = me() || riderIds()[0];
  if (route === "mapa" && mapView && mapView.alive()) { updateMapParts(); renderTop(); return; }
  $("#view").innerHTML = `<section class="view">${VIEWS[route]()}</section>`;
  if (route === "mapa") mountMap();
  renderTop();
  if (!me() && !$("#layer").innerHTML) pickMe(true);
  migrateLegacy();
}

/* ---------- login (modo nuvem) ---------- */
function renderLogin() {
  if ($("#layer .login")) return;
  $("#layer").innerHTML = `<div class="login"><form id="loginForm" novalidate>
    <div class="label" style="color:var(--asphalt-muted)">Janeiro de 2027</div>
    <h1>Expedição <span>Chapada</span></h1>
    <label class="field"><span>E-mail</span><input id="lgEmail" type="email" autocomplete="username" required></label>
    <label class="field"><span>Senha</span><input id="lgPw" type="password" autocomplete="current-password" required></label>
    <p class="err" id="lgErr" hidden></p>
    <button class="btn primary block" type="submit">Entrar</button>
    <p style="font-size:.82rem;color:var(--asphalt-muted)">As contas são criadas pelo Jacó no Firebase. Depois do primeiro login, o app abre direto, mesmo sem internet.</p>
  </form></div>`;
  $("#loginForm").addEventListener("submit", async e => {
    e.preventDefault(); const err = $("#lgErr"); err.hidden = true;
    try { await store.signIn($("#lgEmail").value.trim(), $("#lgPw").value); }
    catch (ex) { err.hidden = false; err.textContent = /invalid|wrong|user-not-found|credential/.test(ex.code || "") ? "E-mail ou senha incorretos." : ex.code === "auth/network-request-failed" ? "Sem internet. O primeiro login precisa de conexão." : "Não foi possível entrar: " + (ex.code || ex.message); }
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
  if (fim) {
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
  const myExp = myTripCost(m), myPrep = sumAmt(prepExpenses());
  const fuel = riderIds().map(id => { const f = fuelPlan(id); return `<tr><td>${esc(rname(id))}</td><td class="r num">${f ? num(f.litros) + " L" : "—"}</td><td class="r num">${f ? brl0(f.custo) : `<a href="#pilotos">informar consumo</a>`}</td></tr>`; }).join("");

  return `
  <div class="hero"><div class="label" style="color:var(--asphalt-muted)">${esc(S.trip.name || "Expedição")}</div><div class="big">${big}</div><div class="sub">${sub}</div></div>
  ${margem}
  ${next ? `<a class="card" href="#roteiro" style="text-decoration:none;color:inherit;border-left:6px solid ${CIRCUITS[next.circ]?.color || "var(--road)"}">
     <div class="label">${next.date === t ? "Hoje" : "Próximo dia"} · ${wd(next.date)} ${fmtD(next.date)}</div>
     <div style="font-weight:800;font-size:1.1rem;margin-top:2px">${esc(next.title)}</div>
     <div class="muted" style="font-size:.88rem">${next.km ? num(next.km) + " km" : ""}${next.saida ? " · saída " + next.saida.replace(":", "h") : ""}</div></a>` : ""}
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
    <p class="muted" style="font-size:.85rem;margin-top:6px">🔒 Sua preparação (só você vê): <a href="#gastos" data-act="gtab" data-v="prep">${brl0(myPrep)}</a></p></div>`;
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
        <div class="dk">${d.km ? num(d.km) + " km" : ""}</div></summary>
      <div class="body">
        ${d.via ? `<div><div class="label">Caminho</div><div style="font-size:.9rem">${esc(d.via)}</div></div>` : ""}
        ${d.notes ? `<p class="note">${esc(d.notes)}</p>` : ""}
        ${circBlock}
        ${dayPoints(d)}
        <div class="row"><button class="btn sm" data-act="editDay" data-id="${d.id}">Editar dia</button><button class="btn sm" data-act="insDay" data-id="${d.id}">+ Inserir dia depois</button></div>
      </div></details>`;
  }).join("");
  const first = ds[0], last = ds[ds.length - 1];
  return `
  <div class="between"><h2>Roteiro</h2><span class="muted num">${num(totalKm())} km</span></div>
  <div class="row"><span class="muted">${first ? `${wd(first.date)} ${fmtD(first.date)} → ${wd(last.date)} ${fmtD(last.date)} · ${ds.length} dias` : ""}</span>
    <button class="btn sm" data-act="shiftDates">Mudar data de saída</button></div>
  <p class="note">Distâncias de estrada e dos circuitos são estimativas até a validação por GPS. A ordem dos circuitos pode mudar conforme a chuva: edite o dia e troque o circuito. Inserir ou remover um dia empurra as datas seguintes.</p>
  <div class="stack">${cards}</div>
  <button class="btn block" data-act="addDay">+ Adicionar dia de folga</button>`;
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
      <label class="field"><span>Caminho / cidades</span><input id="dVia" value="${esc(d.via || "")}"></label>
      <label class="field"><span>Observações</span><textarea id="dNotes">${esc(d.notes || "")}</textarea></label>
      <div class="actions"><button type="button" class="btn danger" id="dDel">Remover</button><button class="btn primary" type="submit">Salvar</button></div>
    </form>`, sh => {
    sh.querySelector("#dayF").addEventListener("submit", e => {
      e.preventDefault();
      const nd = { ...d, date: $("#dDate").value || d.date, saida: $("#dSaida").value, title: $("#dTitle").value.trim() || d.title, circ: $("#dCirc").value,
        tipo: ["c1", "c2", "c3"].includes($("#dCirc").value) ? "passeio" : $("#dCirc").value === "folga" ? "folga" : "estrada",
        km: parseNum($("#dKm").value), via: $("#dVia").value.trim(), notes: $("#dNotes").value.trim() };
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
const isTripCat = c => c in TRIP_CATS;
const tripExpenses = () => expenses().filter(e => isTripCat(e.cat));
const prepExpenses = () => Object.entries(S.prep || {}).map(([id, e]) => ({ id, ...e })).sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.created || 0) - (a.created || 0));
const sumAmt = l => l.reduce((s, e) => s + (Number(e.amount) || 0), 0);
function myTripCost(rid) { // o que cabe a cada um: o que pagou sozinho + metade dos divididos
  const l = tripExpenses(), n = riderIds().length || 1;
  return sumAmt(l.filter(e => !e.shared && e.rider === rid)) + sumAmt(l.filter(e => e.shared)) / n;
}
function catBars(list, cats) {
  const byCat = {}; list.forEach(e => byCat[e.cat] = (byCat[e.cat] || 0) + (Number(e.amount) || 0));
  if (!Object.keys(byCat).length) return "";
  const max = Math.max(1, ...Object.values(byCat));
  return `<div class="card stack"><h3>Por categoria</h3>${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="catrow"><span>${esc(cats[k] || CATEGORIES[k] || k)}</span><span class="b"><i style="width:${v / max * 100}%"></i></span><span class="num">${brl0(v)}</span></div>`).join("")}</div>`;
}
function expRows(list, kind) {
  return list.map(e => `<button class="exp" data-act="editExp" data-kind="${kind}" data-id="${e.id}">
      <span class="t">${esc(e.desc || CATEGORIES[e.cat] || "Gasto")}</span><span class="v">${brl(e.amount)}</span>
      <span class="m">${e.date ? wd(e.date) + " " + fmtD(e.date) + " · " : ""}${esc(CATEGORIES[e.cat] || "")}${kind === "trip" ? " · " + esc(rname(e.rider)) : ""}${e.liters ? ` · ${num(e.liters, 2)} L a ${brl(e.ppl)}` : ""}</span>
      <span class="m">${e.shared ? `<span class="chip s-est">dividido</span>` : ""}</span></button>`).join("");
}
function gastos() {
  const tabs = `<div class="seg tabs2" role="tablist"><button data-act="gtab" data-v="trip" aria-pressed="${gastosTab === "trip"}">Gastos da viagem</button><button data-act="gtab" data-v="prep" aria-pressed="${gastosTab === "prep"}">Minha preparação</button></div>`;
  if (gastosTab === "prep") {
    const list = prepExpenses(), tot = sumAmt(list);
    const err = ST.mode === "cloud" && ST.prepError ? `<div class="warnbox">${esc(ST.prepError)}</div>` : "";
    return `<h2>Gastos</h2>${tabs}${err}
    <div class="infobox">🔒 <b>Só você vê esta aba.</b> ${ST.mode === "cloud" ? `O ${esc(rname(riderIds().find(i => i !== me()) || ""))} não tem acesso aos seus gastos de preparação, e você não vê os dele.` : "No modo local ela fica só neste aparelho."}</div>
    <div class="stats"><div class="stat"><div class="v" style="font-size:1.6rem">${brl0(tot)}</div><div class="k">sua preparação</div></div>
      <div class="stat"><div class="v" style="font-size:1.6rem">${list.length}</div><div class="k">${list.length === 1 ? "gasto lançado" : "gastos lançados"}</div></div></div>
    ${catBars(list, PREP_CATS)}
    <div class="stack">${list.length ? expRows(list, "prep") : `<div class="card"><p class="muted">Nada lançado ainda. Use “+ Gasto” para registrar revisão, peças, pneus, equipamento, bagagem…</p></div>`}</div>
    <button class="fab" data-act="newExp" data-kind="prep">+ Gasto</button>`;
  }
  const all = tripExpenses(); const list = expFilter === "todos" ? all : all.filter(e => e.rider === expFilter);
  const fuelL = list.filter(e => e.cat === "combustivel").reduce((s, e) => s + (Number(e.liters) || 0), 0);
  const st = settlement();
  return `<h2>Gastos</h2>${tabs}
  <div class="between"><span class="muted" style="font-size:.88rem">Os dois veem. Marque “dividir” no que for dos dois.</span>${riderSeg("ef")}</div>
  <div class="stats">
    <div class="stat"><div class="v" style="font-size:1.6rem">${brl0(sumAmt(list))}</div><div class="k">${expFilter === "todos" ? "total da viagem" : "pago por " + esc(rname(expFilter))}</div></div>
    <div class="stat"><div class="v" style="font-size:1.6rem">${brl0(sumAmt(list.filter(e => e.shared)))}</div><div class="k">dividido</div></div>
    <div class="stat"><div class="v" style="font-size:1.6rem">${brl0(myTripCost(me() || riderIds()[0]))}</div><div class="k">sua parte na viagem</div></div>
    <div class="stat"><div class="v" style="font-size:1.6rem">${num(fuelL, 1)} L</div><div class="k">combustível lançado</div></div>
  </div>
  <div class="card"><h3>Acerto de contas</h3><p class="settle" style="margin-top:6px">${esc(settleText())}</p>
    ${st.total ? `<p class="muted" style="font-size:.85rem;margin-top:4px">Divididos: ${brl(st.total)} · ${brl(st.share)} para cada um</p>` : ""}</div>
  ${catBars(list, TRIP_CATS)}
  <div class="stack">${list.length ? expRows(list, "trip") : `<div class="card"><p class="muted">Nenhum gasto da viagem ainda. Use “+ Gasto” para combustível, pousada, comida, pedágio, guia…</p></div>`}</div>
  <button class="fab" data-act="newExp" data-kind="trip">+ Gasto</button>`;
}
function expForm(e, kind) {
  const isNew = !e; const m = me() || riderIds()[0]; const prep = kind === "prep";
  const cats = prep ? PREP_CATS : TRIP_CATS;
  e = e || { rider: m, cat: prep ? "moto" : "combustivel", date: todayISO(), amount: "", desc: "", shared: false, liters: "", ppl: S.trip.gasPrice };
  const readonly = !prep && !isNew && !canEdit(e.rider);
  const riders = riderIds().filter(id => ST.mode === "local" || id === m || id === e.rider);
  openSheet(`<h3>${isNew ? "Novo gasto" : readonly ? "Gasto" : "Editar gasto"}</h3>
   <p class="muted" style="font-size:.85rem">${prep ? "🔒 Preparação: só você vê. Para o que comprar ou consertar antes de sair." : "Gasto da viagem: os dois veem. Para o que acontecer durante a viagem; o que for da preparação vai na aba Minha preparação."}</p>
   <form id="expF" class="stack">
    <fieldset ${readonly ? "disabled" : ""} style="border:0;padding:0;margin:0;display:grid;gap:12px;min-width:0">
    <div class="grid2">${prep ? "" : `<label class="field"><span>Quem pagou</span><select id="eRider">${riders.map(id => `<option value="${id}" ${e.rider === id ? "selected" : ""}>${esc(rname(id))}</option>`).join("")}</select></label>`}
    <label class="field"><span>Categoria</span><select id="eCat">${Object.entries(cats).map(([k, l]) => `<option value="${k}" ${e.cat === k ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>
    <label class="field"><span>Descrição</span><input id="eDesc" value="${esc(e.desc)}" placeholder="${prep ? "Ex.: pneu dianteiro, kit relação, luvas" : "Ex.: posto em Salgueiro, pousada, almoço"}"></label>
    <div id="fuelBox" class="grid2" ${e.cat === "combustivel" ? "" : "hidden"}>
      <label class="field"><span>Litros</span><input id="eL" inputmode="decimal" value="${e.liters ?? ""}"></label>
      <label class="field"><span>R$ por litro</span><input id="ePpl" inputmode="decimal" value="${e.ppl ?? ""}"></label></div>
    <div class="grid2"><label class="field"><span>Valor (R$)</span><input id="eAmt" inputmode="decimal" value="${e.amount ?? ""}" required></label>
    <label class="field"><span>Data</span><input id="eDate" type="date" value="${e.date || ""}"></label></div>
    ${prep ? "" : `<label class="check"><input type="checkbox" id="eShared" ${e.shared ? "checked" : ""}> Dividir entre os dois</label>`}
    </fieldset>
    <p class="err" id="eErr" hidden></p>
    <div class="actions">${isNew || readonly ? `<button type="button" class="btn" data-close="1">${readonly ? "Fechar" : "Cancelar"}</button>` : `<button type="button" class="btn danger" id="eDel">Excluir</button>`}${readonly ? "" : `<button class="btn primary">Salvar</button>`}</div>
   </form>`, sh => {
    const cat = sh.querySelector("#eCat"), L = sh.querySelector("#eL"), P = sh.querySelector("#ePpl"), A = sh.querySelector("#eAmt"), shared = sh.querySelector("#eShared");
    let autoAmt = isNew;
    const recalc = () => { const l = parseNum(L.value), p = parseNum(P.value); if (autoAmt && cat.value === "combustivel" && l && p) A.value = (l * p).toFixed(2); };
    L.addEventListener("input", recalc); P.addEventListener("input", recalc); A.addEventListener("input", () => { autoAmt = false; });
    cat.addEventListener("change", () => { sh.querySelector("#fuelBox").hidden = cat.value !== "combustivel"; if (isNew && shared) shared.checked = ["hospedagem", "passeio", "estacionamento"].includes(cat.value); });
    sh.querySelector("#expF").addEventListener("submit", ev => {
      ev.preventDefault(); const amt = parseNum(A.value);
      if (!amt || amt <= 0) { const er = sh.querySelector("#eErr"); er.hidden = false; er.textContent = "Informe o valor do gasto."; return; }
      const id = isNew ? newId() : e.id;
      const data = { cat: cat.value, desc: sh.querySelector("#eDesc").value.trim(), amount: amt, date: sh.querySelector("#eDate").value,
        liters: cat.value === "combustivel" ? parseNum(L.value) : null, ppl: cat.value === "combustivel" ? parseNum(P.value) : null, created: e.created || Date.now() };
      if (prep) store.putPrep(id, data);
      else store.put("expenses", id, { ...data, rider: sh.querySelector("#eRider").value, shared: shared.checked });
      closeSheet(); toast(isNew ? "Gasto lançado" : "Gasto salvo");
    });
    const del = sh.querySelector("#eDel"); let armed = false;
    del && del.addEventListener("click", () => { if (!armed) { armed = true; del.textContent = "Toque de novo para excluir"; return; }
      prep ? store.removePrep(e.id) : store.remove("expenses", e.id); closeSheet(); toast("Gasto excluído"); });
  });
}
// Gastos antigos de manutenção/equipamento (v1.0/1.1) passam para a preparação privada de quem pagou
let migrating = false;
function migrateLegacy() {
  if (migrating) return; const m = me(); if (!m) return;
  if (ST.mode === "cloud" && (!ST.uid || ST.prepError)) return;
  const old = expenses().filter(e => e.rider === m && !isTripCat(e.cat));
  if (!old.length) return; migrating = true;
  Promise.all(old.map(e => { const { id, rider, shared, ...rest } = e;
    return store.putPrep(id, { ...rest, cat: LEGACY_PREP[e.cat] || (e.cat in PREP_CATS ? e.cat : "moto") }).then(() => store.remove("expenses", id)); }))
    .then(() => toast(`${old.length} ${old.length === 1 ? "gasto foi" : "gastos foram"} para Minha preparação`))
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
function openMenu() {
  const conf = Object.values(S.lodging || {}).filter(l => l.status === "confirmada").length;
  const open = PEND.length + Object.keys(S.pend?.custom || {}).length - Object.keys(S.pend?.done || {}).length;
  $("#layer").innerHTML = `<div class="drawer-bg" data-close="1"><nav class="drawer" aria-label="Menu">
    <div class="between"><h3>Menu</h3><button class="x" data-close="1" aria-label="Fechar">×</button></div>
    <div class="menu">
      <a href="#hospedagem">Hospedagem <span class="muted">${conf}/3 confirmadas</span></a>
      <a href="#pendencias">Pendências <span class="muted">${open} abertas</span></a>
      <a href="#pilotos">Pilotos e motos <span class="muted">consumo e autonomia</span></a>
      <a href="#ajustes">Ajustes e sincronização <span class="muted">${ST.mode === "local" ? "modo local" : esc(ST.user || "")}</span></a>
    </div>
    <p class="muted" style="font-size:.8rem">Versão ${esc(self.APP_VERSION || "?")}</p></nav></div>`;
  const bg = $("#layer").firstElementChild;
  bg.addEventListener("click", e => { if (e.target.dataset.close || e.target.closest("a")) $("#layer").innerHTML = ""; });
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
      <button class="btn sm" data-act="newLodge" data-etapa="${k}">+ Opção em ${esc(et.name.split(" ·")[0])}</button></div>`;
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
      <label class="pitem${done[id] ? " done" : ""}" for="pd-${id}"><input type="checkbox" id="pd-${id}" data-act="pd" data-id="${id}" ${done[id] ? "checked" : ""}>
      <div><div class="pt">${esc(t)}</div>${d ? `<div class="pd">${esc(d)}</div>` : ""}</div>${isC ? `<button class="x" data-act="delPend" data-id="${id}" aria-label="Remover">×</button>` : "<span></span>"}</label>`).join("")}</div>`; }).join("")}
  <button class="btn block" data-act="newPend">+ Nova pendência</button>`;
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
  return `${backLink}<h2>Pilotos e motos</h2>${riderIds().map(id => { const r = S.riders[id], f = fuelPlan(id);
    return `<div class="card stack"><div class="between"><h3>${esc(r.name)}</h3>${id === me() ? `<span class="chip s-ok">você</span>` : ""}</div>
      <dl class="kv"><dt>Moto</dt><dd>${esc(r.moto || "—")}</dd><dt>Consumo</dt><dd class="num">${r.consumo ? num(r.consumo, 1) + " km/L" : `<span class="chip s-pend">informar</span>`}</dd>
      <dt>Tanque</dt><dd class="num">${r.tanque ? num(r.tanque, 1) + " L" : "—"}</dd>
      ${f?.autonomia ? `<dt>Autonomia</dt><dd class="num">≈ ${num(f.autonomia)} km por tanque</dd>` : ""}
      ${f ? `<dt>Na viagem</dt><dd class="num">${num(f.litros)} L · ${brl0(f.custo)}</dd>` : ""}
      ${ST.mode === "cloud" ? `<dt>Conta</dt><dd>${esc(r.email || "não ligada")}</dd>` : ""}</dl>
      ${canEdit(id) ? `<button class="btn sm" data-act="editRider" data-id="${id}" style="justify-self:start">Editar</button>` : ""}</div>`; }).join("")}
    <p class="note">A autonomia é teórica (tanque × consumo). Com bagagem e serra ela cai; planeje parar a cada 200–250 km.</p>`;
}
function riderForm(id) {
  const r = S.riders[id];
  openSheet(`<h3>${esc(r.name)}</h3><form id="rF" class="stack">
    <label class="field"><span>Nome</span><input id="rN" value="${esc(r.name)}" required></label>
    <label class="field"><span>Moto</span><input id="rM" value="${esc(r.moto || "")}"></label>
    <div class="grid2"><label class="field"><span>Consumo (km/L)</span><input id="rC" inputmode="decimal" value="${r.consumo ?? ""}"><small>Média na estrada</small></label>
    <label class="field"><span>Tanque (L)</span><input id="rT" inputmode="decimal" value="${r.tanque ?? ""}"></label></div>
    <div class="actions"><button type="button" class="btn" data-close="1">Cancelar</button><button class="btn primary">Salvar</button></div></form>`, sh => {
    sh.querySelector("#rF").addEventListener("submit", ev => { ev.preventDefault();
      store.merge("riders/" + id, { name: $("#rN").value.trim() || r.name, moto: $("#rM").value.trim(), consumo: parseNum($("#rC").value), tanque: parseNum($("#rT").value) }); closeSheet(); toast("Salvo"); });
  });
}

function ajustes() {
  const local = ST.mode === "local";
  return `${backLink}<h2>Ajustes</h2>
  <form class="card stack" id="setF">
    <h3>Viagem</h3>
    <div class="grid2"><label class="field"><span>Gasolina (R$/L)</span><input id="sGas" inputmode="decimal" value="${S.trip.gasPrice ?? ""}"><small>Usado nas estimativas e como padrão ao abastecer</small></label>
    <label class="field"><span>Fim das férias</span><input id="sFer" type="date" value="${S.trip.feriasFim || ""}"></label></div>
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
      <span class="ptmark">${p.order || ""}</span>
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

/* ---------- eventos ---------- */
$("#view").addEventListener("click", e => {
  const vr = e.target.closest("[data-vr]"); if (vr) viewRider = vr.dataset.vr;
  const b = e.target.closest("[data-act]"); if (!b) return;
  const act = b.dataset.act, id = b.dataset.id;
  if (act === "pd") return; // tratado no change
  if (b.tagName === "BUTTON") e.preventDefault();
  if (act === "editDay") dayForm(S.trip.days.find(d => d.id === id));
  else if (act === "shiftDates") shiftForm();
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
  else if (act === "gtab") { gastosTab = b.dataset.v; render(); }
  else if (act === "newExp") expForm(null, b.dataset.kind);
  else if (act === "editExp") expForm(b.dataset.kind === "prep" ? prepExpenses().find(x => x.id === id) : expenses().find(x => x.id === id), b.dataset.kind);
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
  if (t.id === "impFile" && t.files[0]) { const r = new FileReader(); r.onload = () => { try { store.importJSON(r.result); toast("Backup restaurado"); } catch (er) { toast("Arquivo inválido: " + er.message); } }; r.readAsText(t.files[0]); }
});
$("#view").addEventListener("submit", e => {
  if (e.target.id !== "setF") return; e.preventDefault();
  store.merge("trip", { gasPrice: parseNum($("#sGas").value) ?? S.trip.gasPrice, feriasFim: $("#sFer").value || null }); toast("Ajustes salvos");
});

/* ---------- início ---------- */
route = location.hash.slice(1) || "inicio";
store.start((state, status) => { S = state; ST = status; render(); });
