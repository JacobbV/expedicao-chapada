// Armazenamento: modo local (só no aparelho) ou nuvem (Firebase Firestore com cache offline).
// A interface é a mesma nos dois modos, e o resto do app não precisa saber qual está ativo.
import { TRIP_ID, TRIP_SEED, RIDERS_SEED, LODGING_SEED, POINTS_SEED } from "./data.js";
import { firebaseConfig } from "../firebase-config.js";

const LS_KEY = "expedicao-chapada-v1";
const FB = "https://www.gstatic.com/firebasejs/10.12.2/";

function emptyState() {
  return { trip: null, riders: {}, checklist: {}, pend: { done: {} }, expenses: {}, lodging: {}, points: {} };
}
function seedState() {
  const s = emptyState();
  s.trip = structuredClone(TRIP_SEED);
  s.riders = structuredClone(RIDERS_SEED);
  s.checklist = { jaco: { items: {} }, kaique: { items: {} } };
  for (const l of LODGING_SEED) { const { id, ...rest } = l; s.lodging[id] = rest; }
  s.points = seedPoints(); s.trip.pointsSeeded = true;
  return s;
}
function seedPoints() {
  const out = {};
  for (const p of POINTS_SEED) { const { id, ...rest } = p; out[id] = rest; }
  return out;
}
function isObj(v) { return v && typeof v === "object" && !Array.isArray(v); }
function deepMerge(target, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete target[k];
    else if (isObj(v)) { if (!isObj(target[k])) target[k] = {}; deepMerge(target[k], v); }
    else target[k] = v;
  }
  return target;
}
function getByKey(state, key) {
  if (key === "trip") return state.trip;
  if (key === "meta/pend") return state.pend;
  const [col, id] = key.split("/");
  return state[col]?.[id];
}
function setByKey(state, key, val) {
  if (key === "trip") state.trip = val;
  else if (key === "meta/pend") state.pend = val;
  else { const [col, id] = key.split("/"); (state[col] ||= {})[id] = val; }
}
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------- modo local ---------- */
function localStore() {
  let state, cb;
  const status = { mode: "local", online: navigator.onLine, pending: false, user: null, ready: true };
  const persist = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {} };
  const emit = () => cb && cb(state, status);
  return {
    status,
    start(onChange) {
      cb = onChange;
      try { state = JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch (e) { state = null; }
      if (!state || !state.trip) { state = seedState(); persist(); }
      if (!state.trip.pointsSeeded) { state.points = { ...seedPoints(), ...(state.points || {}) }; state.trip.pointsSeeded = true; persist(); }
      addEventListener("online", () => { status.online = true; emit(); });
      addEventListener("offline", () => { status.online = false; emit(); });
      emit();
    },
    merge(key, patch) { const cur = structuredClone(getByKey(state, key) || {}); setByKey(state, key, deepMerge(cur, patch)); persist(); emit(); return Promise.resolve(); },
    put(col, id, data) { state[col][id] = data; persist(); emit(); return Promise.resolve(); },
    remove(col, id) { delete state[col][id]; persist(); emit(); return Promise.resolve(); },
    exportJSON() { return JSON.stringify(state, null, 2); },
    importJSON(txt) { const s = JSON.parse(txt); if (!s.trip) throw new Error("Arquivo sem dados da viagem"); state = s; persist(); emit(); },
    resetAll() { state = seedState(); persist(); emit(); },
  };
}

/* ---------- modo nuvem (Firebase) ---------- */
function cloudStore() {
  const state = emptyState();
  const status = { mode: "cloud", online: navigator.onLine, pending: false, user: null, ready: false, authReady: false, error: "" };
  const pendingBy = {};
  let cb, fs, db, auth, authMod, unsubs = [], seeded = false;
  const emit = () => { status.pending = Object.values(pendingBy).some(Boolean); cb && cb(state, status); };
  const base = ["trips", TRIP_ID];

  function refFor(key) {
    if (key === "trip") return fs.doc(db, ...base);
    const [col, id] = key.split("/");
    return fs.doc(db, ...base, col, id);
  }
  function toFs(patch) {
    const out = {};
    for (const [k, v] of Object.entries(patch)) out[k] = v === null ? fs.deleteField() : isObj(v) ? toFs(v) : v;
    return out;
  }
  async function seedIfNeeded() {
    if (seeded) return; seeded = true;
    const b = fs.writeBatch(db);
    b.set(refFor("trip"), TRIP_SEED);
    for (const [id, r] of Object.entries(RIDERS_SEED)) b.set(refFor("riders/" + id), r, { merge: true });
    b.set(refFor("checklist/jaco"), { items: {} }, { merge: true });
    b.set(refFor("checklist/kaique"), { items: {} }, { merge: true });
    b.set(refFor("meta/pend"), { done: {} }, { merge: true });
    for (const l of LODGING_SEED) { const { id, ...rest } = l; b.set(fs.doc(db, ...base, "lodging", id), rest); }
    await b.commit();
  }
  let pointsSeeding = false;
  async function seedPointsIfNeeded() {
    if (pointsSeeding || !state.trip || state.trip.pointsSeeded) return; pointsSeeding = true;
    const b = fs.writeBatch(db);
    for (const p of POINTS_SEED) { const { id, ...rest } = p; b.set(fs.doc(db, ...base, "points", id), rest, { merge: true }); }
    b.set(refFor("trip"), { pointsSeeded: true }, { merge: true });
    await b.commit();
  }
  function listen() {
    unsubs.forEach(u => u()); unsubs = [];
    const opt = { includeMetadataChanges: true };
    unsubs.push(fs.onSnapshot(refFor("trip"), opt, s => {
      pendingBy.trip = s.metadata.hasPendingWrites;
      if (s.exists()) { state.trip = s.data(); status.ready = true; if (!s.metadata.fromCache && !state.trip.pointsSeeded) seedPointsIfNeeded().catch(() => {}); }
      else if (!s.metadata.fromCache) seedIfNeeded().catch(e => { status.error = e.message; emit(); });
      emit();
    }, e => { status.error = e.code === "permission-denied" ? "Sem permissão: confira o e-mail nas regras do Firestore." : e.message; emit(); }));
    const cols = [["riders", "riders"], ["checklist", "checklist"], ["meta", null], ["expenses", "expenses"], ["lodging", "lodging"], ["points", "points"]];
    for (const [col, target] of cols) {
      unsubs.push(fs.onSnapshot(fs.collection(db, ...base, col), opt, qs => {
        pendingBy[col] = qs.metadata.hasPendingWrites;
        const map = {};
        qs.forEach(d => { map[d.id] = d.data(); });
        if (target) state[target] = map; else state.pend = map.pend || { done: {} };
        if (col === "points" && !qs.metadata.fromCache) seedPointsIfNeeded().catch(e => { status.error = e.message; emit(); });
        emit();
      }, () => {}));
    }
  }
  const w = p => p.catch(e => { status.error = e.message; emit(); });
  return {
    status,
    async start(onChange) {
      cb = onChange;
      addEventListener("online", () => { status.online = true; emit(); });
      addEventListener("offline", () => { status.online = false; emit(); });
      try {
        const [appMod, fsMod, aMod] = await Promise.all([
          import(FB + "firebase-app.js"), import(FB + "firebase-firestore.js"), import(FB + "firebase-auth.js")]);
        fs = fsMod; authMod = aMod;
        const app = appMod.initializeApp(firebaseConfig);
        db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
        auth = aMod.getAuth(app);
        await aMod.setPersistence(auth, aMod.browserLocalPersistence);
        aMod.onAuthStateChanged(auth, u => {
          status.user = u ? u.email : null; status.authReady = true;
          if (u) listen(); else { unsubs.forEach(x => x()); unsubs = []; }
          emit();
        });
      } catch (e) {
        status.error = "Não consegui carregar o Firebase. Abra o app uma vez com internet."; status.authReady = true; emit();
      }
    },
    async signIn(email, pw) { await authMod.signInWithEmailAndPassword(auth, email, pw); },
    async signOut() { await authMod.signOut(auth); },
    merge(key, patch) { return w(fs.setDoc(refFor(key), toFs(patch), { merge: true })); },
    put(col, id, data) { return w(fs.setDoc(fs.doc(db, ...base, col, id), data)); },
    remove(col, id) { return w(fs.deleteDoc(fs.doc(db, ...base, col, id))); },
    exportJSON() { return JSON.stringify(state, null, 2); },
  };
}

export function createStore() {
  const ok = firebaseConfig && firebaseConfig.apiKey && !String(firebaseConfig.apiKey).startsWith("COLE");
  return ok ? cloudStore() : localStore();
}
