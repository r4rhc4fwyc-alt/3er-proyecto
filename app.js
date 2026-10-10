"use strict";

/* ====== Constantes ====== */
const STORAGE_KEY = "planificacion-semanal-v1";
const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const DAYS_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const COLORS = ["#8aa4f8", "#7ed6a8", "#f6c667", "#f58f8f", "#c39bf0", "#6fd3e0", "#f5a76b", "#b8c4d0"];
const HOUR_H = 52; // px, debe coincidir con --hour-h en style.css

/* ====== Estado ====== */
let state = load();
let currentMonday = mondayOf(new Date());
let editingId = null;

function defaultState() {
  return { startHour: 6, endHour: 24, activities: [] };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return Object.assign(defaultState(), JSON.parse(raw));
  } catch (e) { /* almacenamiento no disponible */ }
  return defaultState();
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignorar */ }
}

/* ====== Utilidades de fecha/hora ====== */
function mondayOf(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function iso(d) {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function fmtMin(m) {
  const p = n => String(n).padStart(2, "0");
  return `${p(Math.floor(m / 60) % 24)}:${p(m % 60)}`;
}
function parseTime(s, isEnd) {
  if (!s) return null;
  const [h, m] = s.split(":").map(Number);
  const v = h * 60 + m;
  return isEnd && v === 0 ? 1440 : v; // "00:00" como fin = medianoche
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
const $ = id => document.getElementById(id);

/* ====== Actividades visibles en una semana ====== */
function activitiesFor(monday, dayIdx) {
  const key = iso(monday);
  return state.activities.filter(a => {
    if (!a.days.includes(dayIdx)) return false;
    if (a.kind === "once") return a.weekStart === key;
    return !(a.skipWeeks || []).includes(key);
  });
}

/* Reparte actividades solapadas en "carriles" para que no se tapen */
function layout(items) {
  items = items.slice().sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  let cluster = [], clusterEnd = -1;
  const flush = () => {
    const lanes = [];
    cluster.forEach(it => {
      let lane = lanes.findIndex(end => end <= it.start);
      if (lane === -1) { lane = lanes.length; lanes.push(0); }
      lanes[lane] = it.end;
      it.lane = lane;
    });
    cluster.forEach(it => { it.lanes = lanes.length; out.push(it); });
    cluster = [];
  };
  items.forEach(it => {
    if (cluster.length && it.start >= clusterEnd) { flush(); clusterEnd = -1; }
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  });
  if (cluster.length) flush();
  return out;
}

/* ====== Render ====== */
function render() {
  const { startHour, endHour } = state;
  const startMin = startHour * 60, endMin = endHour * 60;
  const body = (endHour - startHour) * HOUR_H;
  const todayKey = iso(new Date());
  const sunday = addDays(currentMonday, 6);

  const fmt = (d, o) => d.toLocaleDateString("es", o);
  const sameMonth = currentMonday.getMonth() === sunday.getMonth();
  $("weekLabel").textContent = sameMonth
    ? `${currentMonday.getDate()} – ${sunday.getDate()} de ${fmt(sunday, { month: "long" })} ${sunday.getFullYear()}`
    : `${currentMonday.getDate()} ${fmt(currentMonday, { month: "short" })} – ${sunday.getDate()} ${fmt(sunday, { month: "short" })} ${sunday.getFullYear()}`;

  const root = $("schedule");
  root.innerHTML = "";
  root.style.setProperty("--hour-h", HOUR_H + "px");

  // Cabeceras
  const corner = document.createElement("div");
  corner.className = "col-head corner";
  root.appendChild(corner);
  for (let i = 0; i < 7; i++) {
    const d = addDays(currentMonday, i);
    const h = document.createElement("div");
    h.className = "col-head" + (iso(d) === todayKey ? " is-today" : "");
    h.innerHTML = `${DAYS[i]}<small>${d.getDate()} ${fmt(d, { month: "short" })}</small>`;
    root.appendChild(h);
  }

  // Columna de horas
  const time = document.createElement("div");
  time.className = "time-col";
  time.style.height = body + "px";
  for (let h = startHour; h < endHour; h++) {
    const l = document.createElement("div");
    l.className = "time-label";
    l.style.top = (h - startHour) * HOUR_H + "px";
    l.textContent = h === startHour ? "" : fmtMin(h * 60);
    if (h === startHour) l.textContent = fmtMin(h * 60);
    time.appendChild(l);
  }
  root.appendChild(time);

  // Columnas de días
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = addDays(currentMonday, i);
    const col = document.createElement("div");
    col.className = "day-col" + (iso(d) === todayKey ? " is-today" : "");
    col.style.height = body + "px";
    col.dataset.day = i;

    col.addEventListener("click", e => {
      if (e.target !== col) return;
      const y = e.offsetY;
      const mins = Math.floor((y / HOUR_H) * 2) * 30 + startMin; // ajusta a 30 min
      openDialog({ days: [i], start: mins, end: Math.min(mins + 60, 1440) });
    });

    const items = activitiesFor(currentMonday, i)
      .map(a => ({ a, start: Math.max(a.start, startMin), end: Math.min(a.end, endMin) }))
      .filter(x => x.end > x.start);

    layout(items).forEach(it => {
      const { a } = it;
      const el = document.createElement("div");
      el.className = "event " + a.kind;
      el.style.background = a.color;
      el.style.top = ((it.start - startMin) / 60) * HOUR_H + "px";
      el.style.height = Math.max(((it.end - it.start) / 60) * HOUR_H - 2, 18) + "px";
      el.style.left = `calc(${(it.lane / it.lanes) * 100}% + 2px)`;
      el.style.width = `calc(${100 / it.lanes}% - 4px)`;
      el.title = `${a.title}\n${fmtMin(a.start)} – ${fmtMin(a.end)}${a.notes ? "\n" + a.notes : ""}`;
      el.innerHTML = `<div class="t"></div><div class="h">${fmtMin(a.start)} – ${fmtMin(a.end)}</div>${a.notes ? '<div class="n"></div>' : ""}`;
      el.querySelector(".t").textContent = a.title;
      if (a.notes) el.querySelector(".n").textContent = a.notes;
      el.addEventListener("click", () => openDialog(a));
      col.appendChild(el);
    });

    if (iso(d) === todayKey) {
      const m = now.getHours() * 60 + now.getMinutes();
      if (m >= startMin && m <= endMin) {
        const line = document.createElement("div");
        line.className = "now-line";
        line.style.top = ((m - startMin) / 60) * HOUR_H + "px";
        col.appendChild(line);
      }
    }
    root.appendChild(col);
  }
}

/* ====== Diálogo ====== */
const dlg = $("dlg");

function buildDialogControls() {
  $("fDays").innerHTML = DAYS_SHORT.map((n, i) =>
    `<label><input type="checkbox" value="${i}"><span>${n}</span></label>`).join("");
  $("fColors").innerHTML = COLORS.map((c, i) =>
    `<label><input type="radio" name="color" value="${c}"${i === 0 ? " checked" : ""}><span style="background:${c}"></span></label>`).join("");
}

function openDialog(a) {
  const isEdit = !!a.id;
  editingId = isEdit ? a.id : null;
  $("dlgTitle").textContent = isEdit ? "Editar actividad" : "Nueva actividad";
  $("fTitle").value = a.title || "";
  $("fNotes").value = a.notes || "";
  $("fStart").value = fmtMin(a.start ?? state.startHour * 60);
  $("fEnd").value = fmtMin(a.end ?? ((a.start ?? state.startHour * 60) + 60));
  document.querySelectorAll('input[name="kind"]').forEach(r => { r.checked = r.value === (a.kind || "fixed"); });
  document.querySelectorAll('#fDays input').forEach(c => { c.checked = (a.days || []).includes(Number(c.value)); });
  const color = a.color || COLORS[0];
  document.querySelectorAll('#fColors input').forEach(r => { r.checked = r.value === color; });
  $("kindWeek").textContent = weekText(a.kind === "once" ? new Date(a.weekStart + "T00:00") : currentMonday);
  $("fError").hidden = true;

  // Botones de borrado
  $("delAll").hidden = !isEdit;
  $("delWeek").hidden = !(isEdit && a.kind === "fixed");
  $("delAll").textContent = isEdit && a.kind === "fixed" ? "Eliminar de todas las semanas" : "Eliminar";

  dlg.showModal();
  $("fTitle").focus();
}

function weekText(monday) {
  const s = addDays(monday, 6);
  return `${monday.getDate()}/${monday.getMonth() + 1} – ${s.getDate()}/${s.getMonth() + 1}`;
}

$("form").addEventListener("submit", e => {
  e.preventDefault();
  const title = $("fTitle").value.trim();
  const days = [...document.querySelectorAll("#fDays input:checked")].map(c => Number(c.value));
  const start = parseTime($("fStart").value, false);
  const end = parseTime($("fEnd").value, true);
  const kind = document.querySelector('input[name="kind"]:checked').value;
  const color = document.querySelector('input[name="color"]:checked').value;
  const notes = $("fNotes").value.trim();

  const err = msg => { $("fError").textContent = msg; $("fError").hidden = false; };
  if (!title) return err("Escribe un nombre.");
  if (!days.length) return err("Elige al menos un día.");
  if (start === null || end === null || end <= start) return err("La hora de fin debe ser posterior a la de inicio.");

  if (editingId) {
    const a = state.activities.find(x => x.id === editingId);
    const wasKind = a.kind;
    Object.assign(a, { title, days, start, end, color, notes, kind });
    if (kind === "once" && wasKind === "fixed") a.weekStart = iso(currentMonday); // pasa a ser solo de esta semana
    if (kind === "fixed") { delete a.weekStart; a.skipWeeks = a.skipWeeks || []; }
  } else {
    const a = { id: uid(), title, days, start, end, color, notes, kind };
    if (kind === "once") a.weekStart = iso(currentMonday); else a.skipWeeks = [];
    state.activities.push(a);
  }
  save();
  dlg.close();
  render();
});

$("cancel").addEventListener("click", () => dlg.close());

$("delAll").addEventListener("click", () => {
  const a = state.activities.find(x => x.id === editingId);
  const msg = a.kind === "fixed"
    ? `¿Eliminar "${a.title}" de TODAS las semanas?`
    : `¿Eliminar "${a.title}"?`;
  if (!confirm(msg)) return;
  state.activities = state.activities.filter(x => x.id !== editingId);
  save(); dlg.close(); render();
});

$("delWeek").addEventListener("click", () => {
  const a = state.activities.find(x => x.id === editingId);
  a.skipWeeks = [...new Set([...(a.skipWeeks || []), iso(currentMonday)])];
  save(); dlg.close(); render();
});

/* ====== Barra de herramientas ====== */
$("prevWeek").addEventListener("click", () => { currentMonday = addDays(currentMonday, -7); render(); });
$("nextWeek").addEventListener("click", () => { currentMonday = addDays(currentMonday, 7); render(); });
$("today").addEventListener("click", () => { currentMonday = mondayOf(new Date()); render(); });
$("addBtn").addEventListener("click", () => openDialog({ days: [], start: 9 * 60, end: 10 * 60 }));

$("copyPrev").addEventListener("click", () => {
  const prev = iso(addDays(currentMonday, -7));
  const cur = iso(currentMonday);
  const src = state.activities.filter(a => a.kind === "once" && a.weekStart === prev);
  if (!src.length) return alert("La semana anterior no tiene actividades 'solo esa semana' para copiar.");
  if (state.activities.some(a => a.kind === "once" && a.weekStart === cur) &&
      !confirm("Esta semana ya tiene actividades propias. ¿Copiar igualmente?")) return;
  src.forEach(a => state.activities.push({ ...a, id: uid(), weekStart: cur, days: [...a.days] }));
  save(); render();
});

/* Rango horario */
function fillHourSelects() {
  const label = h => String(h).padStart(2, "0") + ":00";
  const make = (sel, from, to, val) => {
    sel.innerHTML = "";
    for (let h = from; h <= to; h++) sel.add(new Option(label(h), h));
    sel.value = val;
  };
  make($("startHour"), 0, 23, state.startHour);
  make($("endHour"), 1, 24, state.endHour);
}
function onRangeChange() {
  const s = Number($("startHour").value), e = Number($("endHour").value);
  if (e <= s) { fillHourSelects(); return alert("La hora final debe ser posterior a la inicial."); }
  state.startHour = s; state.endHour = e;
  save(); render();
}
$("startHour").addEventListener("change", onRangeChange);
$("endHour").addEventListener("change", onRangeChange);

/* Exportar / importar / imprimir */
$("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `planificacion-${iso(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});
$("importBtn").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", async e => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!Array.isArray(data.activities)) throw new Error("formato");
    if (!confirm("Esto reemplazará tu planificación actual. ¿Continuar?")) return;
    state = Object.assign(defaultState(), data);
    save(); fillHourSelects(); render();
  } catch (err) {
    alert("El archivo no es una copia válida.");
  }
});
$("printBtn").addEventListener("click", () => window.print());

/* Actualiza la línea de "ahora" cada minuto */
setInterval(() => { if (!dlg.open) render(); }, 60000);

/* ====== Inicio ====== */
buildDialogControls();
fillHourSelects();
render();
