"use strict";

import {
  addAuditRows, addReferenceRows, addRows, addUsageRows, buildAuditSummary, buildBakingSummary, buildCupSummary, buildExecutiveSummary, buildUsageSummary,
  classifyStructure, createDataset, getFilterOptions, isAcSource, mergeDataset, normalize,
} from "./engine.mjs";
import { createExecutivePdf, createExecutiveWorkbook, downloadBytes } from "./export.mjs";

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_ENTRY_BYTES = 220 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED = 700 * 1024 * 1024;
const OVERRIDE_KEY = "controlops360-minimos-v3";
const STORE_TYPE_KEY = "controlops360-tipo-tienda-v4";
const ORDER_KEY = "controlops360-pedido-v4";

const state = {
  dataset: createDataset(),
  files: [],
  fingerprints: new Set(),
  loading: false,
  initializedFilters: false,
  summary: null,
  usage: null,
  audit: null,
  baking: null,
  cups: null,
  overrides: loadOverrides(),
  storeTypes: loadJson(STORE_TYPE_KEY),
  orderDraft: loadJson(ORDER_KEY),
  activeModule: "menu",
};

const ids = [
  "fileInput", "uploadButton", "resetButton", "excelButton", "pdfButton", "dropZone", "emptyState", "dashboard", "moduleNav", "menuModule", "filterPanel", "activeModuleTitle",
  "progressText", "storeFilter", "dateFrom", "dateTo", "weekdayFilter", "modeFilter", "productFilter", "clearFilters",
  "storeTitle", "periodTitle", "sourceSummary", "fileList", "salesMetric", "ordersMetric", "ticketMetric", "uptMetric",
  "peakAmTime", "peakAmOrders", "peakPmTime", "peakPmOrders", "focusList", "peakTable", "productTable", "productCount",
  "channelBars", "salesModule", "auditModule", "auditNegative", "auditNegativeAmount", "auditVoids", "auditVoidAmount", "auditPayments", "auditPaymentAmount", "auditReason", "auditPaymentMode",
  "inventoryPanel", "usagePeriod", "usageTotalHeader", "ordersFilter", "compostableFilter", "usageFilter", "usageTable", "storeType", "storeTypeStatus", "orderCount", "orderTotal",
  "cupPanel", "cupQuantity", "cupTarget", "cupStatus", "bakingModule", "bakingFilter", "bakingCount", "bakingTable", "aboutModule", "toast",
];
const elements = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
const MONEY = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const NUMBER = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

function loadOverrides() {
  try { return JSON.parse(localStorage.getItem(OVERRIDE_KEY) || "{}"); } catch (_) { return {}; }
}

function loadJson(key) {
  try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch (_) { return {}; }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => { elements.toast.hidden = true; }, 3800);
}

function setProgress(message = "") {
  elements.progressText.textContent = message;
  elements.progressText.hidden = !message;
}

function findEndOfCentralDirectory(view) {
  const minimum = Math.max(0, view.byteLength - 65557);
  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error("El archivo no tiene una estructura ZIP válida.");
}

class ZipWorkbook {
  constructor(buffer) {
    this.buffer = buffer;
    this.view = new DataView(buffer);
    this.entries = new Map();
    this.decoder = new TextDecoder("utf-8");
    this.indexEntries();
  }

  indexEntries() {
    const end = findEndOfCentralDirectory(this.view);
    const entryCount = this.view.getUint16(end + 10, true);
    if (entryCount > 10000) throw new Error("El libro contiene demasiados componentes.");
    let offset = this.view.getUint32(end + 16, true);
    let uncompressedTotal = 0;
    for (let index = 0; index < entryCount; index += 1) {
      if (this.view.getUint32(offset, true) !== 0x02014b50) throw new Error("Directorio ZIP incompleto.");
      const method = this.view.getUint16(offset + 10, true);
      const compressedSize = this.view.getUint32(offset + 20, true);
      const uncompressedSize = this.view.getUint32(offset + 24, true);
      const nameLength = this.view.getUint16(offset + 28, true);
      const extraLength = this.view.getUint16(offset + 30, true);
      const commentLength = this.view.getUint16(offset + 32, true);
      const localOffset = this.view.getUint32(offset + 42, true);
      const name = this.decoder.decode(new Uint8Array(this.buffer, offset + 46, nameLength));
      if (uncompressedSize > MAX_ENTRY_BYTES) throw new Error("Una sección del libro excede el límite seguro.");
      uncompressedTotal += uncompressedSize;
      if (uncompressedTotal > MAX_TOTAL_UNCOMPRESSED) throw new Error("El libro excede el límite seguro de descompresión.");
      this.entries.set(name, { method, compressedSize, localOffset });
      offset += 46 + nameLength + extraLength + commentLength;
    }
  }

  has(name) { return this.entries.has(name); }

  async bytes(name) {
    const entry = this.entries.get(name);
    if (!entry) throw new Error(`No se encontró ${name}.`);
    const local = entry.localOffset;
    const nameLength = this.view.getUint16(local + 26, true);
    const extraLength = this.view.getUint16(local + 28, true);
    const start = local + 30 + nameLength + extraLength;
    const compressed = new Uint8Array(this.buffer.slice(start, start + entry.compressedSize));
    if (entry.method === 0) return compressed;
    if (entry.method !== 8) throw new Error(`Compresión ZIP no compatible: ${entry.method}.`);
    if (!("DecompressionStream" in window)) throw new Error("Actualiza Chrome para leer este archivo.");
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async text(name) { return this.decoder.decode(await this.bytes(name)); }
}

function parseXml(text, label) {
  const xml = new DOMParser().parseFromString(text, "application/xml");
  if (xml.getElementsByTagName("parsererror").length) throw new Error(`No se pudo leer ${label}.`);
  return xml;
}

function dirname(path) { return path.split("/").slice(0, -1).join("/"); }
function relationPath(path) { return `${dirname(path)}/_rels/${path.split("/").at(-1)}.rels`; }

function resolvePath(base, target) {
  if (target.startsWith("/")) return target.slice(1);
  const parts = `${dirname(base)}/${target}`.split("/");
  const resolved = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") resolved.pop(); else resolved.push(part);
  }
  return resolved.join("/");
}

function relationships(xml) {
  return new Map([...xml.getElementsByTagName("Relationship")].map((node) => [node.getAttribute("Id"), node.getAttribute("Target")]));
}

function columnIndex(reference) {
  const letters = String(reference).match(/[A-Z]+/i)?.[0]?.toUpperCase() || "A";
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function parseRange(reference) {
  const [start, end = start] = String(reference || "A1:A1").split(":");
  const row = (cell) => Number(cell.match(/\d+/)?.[0] || 1);
  return { startRow: row(start), endRow: row(end), startCol: columnIndex(start) };
}

function cellText(cell, sharedStrings) {
  const type = cell.getAttribute("t");
  if (type === "inlineStr") return [...cell.getElementsByTagName("t")].map((node) => node.textContent || "").join("");
  const value = cell.getElementsByTagName("v")[0]?.textContent ?? "";
  if (type === "s") return sharedStrings[Number(value)] ?? "";
  if (type === "b") return value === "1" ? "Sí" : "No";
  if (type === "str") return value;
  return value !== "" && Number.isFinite(Number(value)) ? Number(value) : value;
}

async function sha256(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function workbookSheets(zip) {
  const workbook = parseXml(await zip.text("xl/workbook.xml"), "workbook.xml");
  const rels = relationships(parseXml(await zip.text("xl/_rels/workbook.xml.rels"), "workbook.xml.rels"));
  return [...workbook.getElementsByTagName("sheet")].map((node) => {
    const id = node.getAttribute("r:id") || node.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    return { name: node.getAttribute("name") || "Hoja", path: resolvePath("xl/workbook.xml", rels.get(id) || "") };
  });
}

function structuralTypes(headers) {
  const types = classifyStructure(headers);
  const available = new Set(headers.map(normalize));
  if (available.has("idtienda") && ["tienda", "nombretienda", "stname"].some((item) => available.has(item)) && !types.includes("store")) types.push("store");
  if (["idtienda", "ceco", "cc"].some((item) => available.has(item)) && available.has("compostable")) types.push("storePolicy");
  return types;
}

async function tableCandidates(zip, sheets) {
  const candidates = [];
  for (const sheet of sheets) {
    const relPath = relationPath(sheet.path);
    if (!zip.has(relPath)) continue;
    const rels = relationships(parseXml(await zip.text(relPath), relPath));
    for (const target of rels.values()) {
      const tablePath = resolvePath(sheet.path, target);
      if (!/^xl\/tables\/[^/]+\.xml$/i.test(tablePath) || !zip.has(tablePath)) continue;
      const xml = parseXml(await zip.text(tablePath), tablePath);
      const root = xml.documentElement;
      const headers = [...xml.getElementsByTagName("tableColumn")].map((node) => node.getAttribute("name") || "");
      const types = structuralTypes(headers);
      const roles = types.filter((type) => {
        if (["sales", "usage", "auditTicket", "auditVoid", "auditPayment"].includes(type)) return isAcSource(sheet.name);
        return ["product", "store", "stock", "compostable", "woe", "baking", "storePolicy"].includes(type);
      });
      if (roles.length) candidates.push({
        sheetName: sheet.name,
        sheetPath: sheet.path,
        sourceName: root.getAttribute("displayName") || root.getAttribute("name") || sheet.name,
        ref: root.getAttribute("ref") || "A1:A1",
        headers,
        roles,
      });
    }
  }
  return candidates;
}

async function sharedStrings(zip) {
  if (!zip.has("xl/sharedStrings.xml")) return [];
  const xml = parseXml(await zip.text("xl/sharedStrings.xml"), "sharedStrings.xml");
  return [...xml.getElementsByTagName("si")].map((item) => [...item.getElementsByTagName("t")].map((node) => node.textContent || "").join(""));
}

async function rowsFromTable(zip, candidate, strings, onBatch) {
  const range = parseRange(candidate.ref);
  const xml = parseXml(await zip.text(candidate.sheetPath), candidate.sheetPath);
  const batch = [];
  let processed = 0;
  for (const rowNode of xml.getElementsByTagName("row")) {
    const rowNumber = Number(rowNode.getAttribute("r") || 0);
    if (rowNumber <= range.startRow || rowNumber > range.endRow) continue;
    const row = Array(candidate.headers.length).fill("");
    for (const cell of rowNode.getElementsByTagName("c")) {
      const index = columnIndex(cell.getAttribute("r")) - range.startCol;
      if (index >= 0 && index < row.length) row[index] = cellText(cell, strings);
    }
    if (!row.some((value) => value !== "" && value != null)) continue;
    batch.push(row);
    processed += 1;
    if (batch.length >= 2500) {
      onBatch(batch.splice(0));
      setProgress(`${candidate.sheetName}: ${NUMBER.format(processed)} filas`);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
  }
  if (batch.length) onBatch(batch);
  return processed;
}

const ROLE_LABEL = { sales: "Normalizados", usage: "Max & Min", auditTicket: "Auditoría", auditVoid: "Voids", auditPayment: "Pagos", product: "Productos", store: "CeCo", stock: "Presentaciones", compostable: "Compostable", woe: "WOE", baking: "Horneo", storePolicy: "Aplicabilidad" };

function operationalStores(dataset) {
  return new Set([...dataset.salesFacts, ...dataset.usageFacts, ...dataset.auditTickets, ...dataset.auditVoids, ...dataset.auditPayments].map((fact) => fact.store));
}

function validateCeCo(local) {
  const incoming = operationalStores(local);
  const current = operationalStores(state.dataset);
  if (incoming.size > 1) throw new Error("El archivo contiene más de un CeCo.");
  if (current.size && incoming.size && [...incoming][0] !== [...current][0]) throw new Error(`CeCo ${[...incoming][0]} no coincide con ${[...current][0]}.`);
  if (incoming.size && local.storeCatalog.size && !local.storeCatalog.has([...incoming][0])) throw new Error("El CeCo de datos no coincide con la tabla Tienda.");
}

async function inspectWorkbook(file) {
  const macro = /\.xlsm$/i.test(file.name);
  const parameter = /\.xlsx$/i.test(file.name);
  if (!macro && !parameter) throw new Error("Usa XLSM o un parámetro XLSX.");
  if (file.size > MAX_FILE_BYTES) throw new Error("El archivo supera 100 MB.");
  const buffer = await file.arrayBuffer();
  const fingerprint = await sha256(buffer);
  if (state.fingerprints.has(fingerprint)) throw new Error("Archivo repetido, aunque tenga otro nombre.");
  const zip = new ZipWorkbook(buffer);
  if (!zip.has("xl/workbook.xml") || !zip.has("xl/_rels/workbook.xml.rels") || (macro && !zip.has("xl/vbaProject.bin"))) throw new Error("El libro no es válido.");
  const candidates = await tableCandidates(zip, await workbookSheets(zip));
  const allowed = macro ? ["sales", "usage", "auditTicket", "auditVoid", "auditPayment", "product", "store", "stock", "compostable", "woe", "baking", "storePolicy"] : ["woe", "baking", "storePolicy", "compostable"];
  const useful = candidates.some((candidate) => candidate.roles.some((role) => allowed.includes(role)));
  if (!useful) throw new Error(parameter ? "El XLSX no es un parámetro compatible." : "No contiene tablas _ac compatibles.");
  const strings = await sharedStrings(zip);
  const local = createDataset();
  const sources = [];
  for (const candidate of candidates) {
    const counts = Object.fromEntries(candidate.roles.map((role) => [role, 0]));
    const rows = await rowsFromTable(zip, candidate, strings, (batch) => {
      for (const role of candidate.roles.filter((item) => allowed.includes(item))) {
        if (role === "sales") counts[role] += addRows(local, candidate.headers, batch, { fileName: file.name, sourceName: candidate.sourceName }).uniqueRows;
        else if (role === "usage") counts[role] += addUsageRows(local, candidate.headers, batch, { fileName: file.name, sourceName: candidate.sourceName });
        else if (["auditTicket", "auditVoid", "auditPayment"].includes(role)) counts[role] += addAuditRows(local, role, candidate.headers, batch, { fileName: file.name, sourceName: candidate.sourceName });
        else counts[role] += addReferenceRows(local, role, candidate.headers, batch);
      }
    });
    sources.push({ name: candidate.sourceName, sheet: candidate.sheetName, roles: candidate.roles, rows, counts });
  }
  validateCeCo(local);
  const merged = mergeDataset(state.dataset, local);
  state.fingerprints.add(fingerprint);
  return { name: file.name, compatible: true, sources, fingerprint: fingerprint.slice(0, 12), ...merged };
}

function currentFilters() {
  const store = elements.storeFilter.value;
  const policy = state.dataset.storePolicies.get(store);
  const saved = state.storeTypes[store];
  const storeType = policy ?? (saved === true || saved === false ? saved : elements.storeType.value === "yes" ? true : elements.storeType.value === "no" ? false : null);
  return {
    store,
    from: elements.dateFrom.value,
    to: elements.dateTo.value,
    weekday: elements.weekdayFilter.value,
    mode: elements.modeFilter.value,
    query: elements.productFilter.value,
    orders: elements.ordersFilter.value,
    compostable: elements.compostableFilter.value,
    usageQuery: elements.usageFilter.value,
    storeType,
  };
}

function syncSelect(select, items, label, valueOf = (item) => item, textOf = (item) => item) {
  const previous = select.value;
  select.innerHTML = `<option value="">${escapeHtml(label)}</option>${items.map((item) => `<option value="${escapeHtml(valueOf(item))}">${escapeHtml(textOf(item))}</option>`).join("")}`;
  if ([...select.options].some((option) => option.value === previous)) select.value = previous;
}

function initializeFilters() {
  const options = getFilterOptions(state.dataset);
  syncSelect(elements.storeFilter, options.stores, "Todas", (item) => item.id, (item) => `${item.id} · ${item.name}`);
  syncSelect(elements.modeFilter, options.modes, "Todos");
  if (!state.initializedFilters) {
    if (options.stores.length === 1) elements.storeFilter.value = options.stores[0].id;
    elements.dateFrom.value = options.minDate;
    elements.dateTo.value = options.maxDate;
    state.initializedFilters = true;
  }
  const store = elements.storeFilter.value;
  const policy = state.dataset.storePolicies.get(store);
  const saved = state.storeTypes[store];
  elements.storeType.value = (policy ?? saved) === true ? "yes" : (policy ?? saved) === false ? "no" : "";
  elements.storeType.disabled = policy === true || policy === false;
}

function storeLabel() {
  const selected = elements.storeFilter.selectedOptions[0];
  return elements.storeFilter.value ? selected.textContent : "Todas las tiendas";
}

function renderFiles() {
  const ready = state.files.filter((file) => file.compatible).length;
  elements.sourceSummary.textContent = `${ready} archivo${ready === 1 ? "" : "s"} compatible${ready === 1 ? "" : "s"}`;
  elements.fileList.innerHTML = state.files.map((file) => `<li class="${file.compatible ? "" : "error"}"><strong>${escapeHtml(file.name)}</strong><small>${file.compatible
    ? [...new Set(file.sources.flatMap((source) => source.roles).map((role) => ROLE_LABEL[role]))].join(" · ")
    : escapeHtml(file.error)}</small></li>`).join("");
}

function renderPeak(summary) {
  elements.peakAmTime.textContent = summary.am.label;
  elements.peakAmOrders.textContent = `${NUMBER.format(summary.am.average)} órdenes/día`;
  elements.peakPmTime.textContent = summary.pm.label;
  elements.peakPmOrders.textContent = `${NUMBER.format(summary.pm.average)} órdenes/día`;
  elements.peakTable.innerHTML = summary.peakByWeekday.map((row) => `<tr><td><strong>${row.day}</strong></td><td>${row.am.label}</td><td class="number">${NUMBER.format(row.am.average)}</td><td>${row.pm.label}</td><td class="number">${NUMBER.format(row.pm.average)}</td></tr>`).join("");
}

function renderProducts(summary) {
  elements.productCount.textContent = `${NUMBER.format(summary.topProducts.length)} productos`;
  elements.productTable.innerHTML = summary.topProducts.slice(0, 8).map((row) => `<tr><td><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.id)}${row.family ? ` · ${escapeHtml(row.family)}` : ""}</small></td><td class="number">${NUMBER.format(row.units)}</td><td class="number"><strong>${MONEY.format(row.sales)}</strong></td></tr>`).join("") || '<tr><td colspan="3">Sin datos en el filtro.</td></tr>';
}

function renderChannels(summary) {
  elements.channelBars.innerHTML = summary.modes.slice(0, 8).map((row) => `<div class="channel-row"><span>${escapeHtml(row.name)}</span><div class="channel-track"><div class="channel-fill" style="width:${Math.max(1, row.share * 100)}%"></div></div><strong>${Math.round(row.share * 100)}% · ${MONEY.format(row.sales)}</strong></div>`).join("") || "<span>Sin datos en el filtro.</span>";
}

function typeChip(value) {
  if (value === true) return '<span class="type-chip yes">Compostable</span>';
  if (value === false) return '<span class="type-chip">No compostable</span>';
  return '<span class="type-chip">Sin clasificar</span>';
}

function renderUsage(usage) {
  if (!state.dataset.usageFacts.length) return;
  elements.usagePeriod.textContent = `${usage.dateFrom || "—"} a ${usage.dateTo || "—"} · ${usage.days} días · factor ×${usage.factor || "—"}`;
  elements.usageTotalHeader.textContent = `Uso ${usage.days} días`;
  elements.storeTypeStatus.textContent = usage.policy === true ? "CeCo compostable" : usage.policy === false ? "CeCo no compostable" : "Define tipo para vasos y tapas";
  const store = elements.storeFilter.value;
  const selected = usage.items.filter((row) => Number(state.orderDraft[`${store}|${row.id}`]) > 0 && row.applicable && !row.blocked);
  elements.orderCount.textContent = NUMBER.format(selected.length);
  elements.orderTotal.textContent = NUMBER.format(selected.reduce((sum, row) => sum + Number(state.orderDraft[`${store}|${row.id}`]), 0));
  elements.usageTable.innerHTML = usage.items.slice(0, 180).map((row) => {
    const key = `${row.store}|${row.id}`;
    const status = row.blocked ? `<span class="type-chip blocked">${escapeHtml(row.blockedReason)}</span>` : row.applicable ? '<span class="type-chip yes">Sí</span>' : '<span class="type-chip blocked">No</span>';
    const value = Number(state.orderDraft[key]) || 0;
    return `<tr class="${row.applicable && !row.blocked ? "" : "row-disabled"}"><td><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.id)}${row.sap ? ` · SAP ${escapeHtml(row.sap)}` : ""}${row.dia ? ` · DIA ${escapeHtml(row.dia)}` : ""}</small></td><td>${status}</td><td class="number">${NUMBER.format(row.totalUse)}</td><td><input class="minimum-input" inputmode="decimal" aria-label="Uso mínimo diario de ${escapeHtml(row.name)}" data-key="${escapeHtml(key)}" value="${Number(row.minimum.toFixed(2))}"></td><td class="number"><strong>${NUMBER.format(row.maximum)}</strong></td><td>${escapeHtml(row.orderUnit)}<small>${NUMBER.format(row.pack)} por pedido · máx. ${NUMBER.format(row.maxOrderUnits)}</small></td><td><input class="order-input" inputmode="numeric" aria-label="Pedido de ${escapeHtml(row.name)}" data-key="${escapeHtml(key)}" data-max="${row.maxOrderUnits}" value="${value}" ${row.applicable && !row.blocked ? "" : "disabled"}></td></tr>`;
  }).join("") || '<tr><td colspan="7">Sin artículos en el filtro.</td></tr>';
}

function renderAudit(audit) {
  elements.auditNegative.textContent = NUMBER.format(audit.negativeCount);
  elements.auditNegativeAmount.textContent = MONEY.format(audit.negativeTotal);
  elements.auditVoids.textContent = NUMBER.format(audit.voidCount);
  elements.auditVoidAmount.textContent = MONEY.format(audit.voidTotal);
  elements.auditPayments.textContent = NUMBER.format(audit.paymentCount);
  elements.auditPaymentAmount.textContent = MONEY.format(audit.paymentTotal);
  elements.auditReason.textContent = audit.topReason.name;
  elements.auditPaymentMode.textContent = `${audit.topPayment.name} · ${MONEY.format(audit.topPayment.amount)}`;
}

function renderCups(cups) {
  elements.cupPanel.hidden = !state.dataset.salesFacts.length;
  elements.cupQuantity.textContent = `${NUMBER.format(cups.quantity)} bebidas`;
  elements.cupTarget.textContent = cups.targetName;
  elements.cupStatus.textContent = cups.ready ? `${NUMBER.format(cups.quantity)} vasos · ${cups.target?.dia ? `DIA ${cups.target.dia}` : `SAP ${cups.target?.sap || "—"}`}` : "Carga WOE y define el tipo de tienda";
}

function renderBaking(baking) {
  elements.bakingCount.textContent = `${NUMBER.format(baking.count)} productos`;
  elements.bakingTable.innerHTML = baking.items.slice(0, 200).map((row) => `<tr><td><strong>${escapeHtml(row.product)}</strong><small>${escapeHtml(row.group)}</small></td><td>${escapeHtml(row.thaw || "—")}</td><td>${escapeHtml(row.bake || "—")}</td><td>${escapeHtml(row.temperature || "—")}</td><td class="number">${row.maxTray == null ? "—" : NUMBER.format(row.maxTray)}</td><td>${escapeHtml(row.together || "—")}</td></tr>`).join("") || '<tr><td colspan="6">Sin coincidencias.</td></tr>';
}

function renderModules() {
  const available = {
    sales: Boolean(state.dataset.salesFacts.length),
    audit: Boolean(state.dataset.auditTickets.length || state.dataset.auditVoids.length || state.dataset.auditPayments.length),
    order: Boolean(state.dataset.usageFacts.length),
    baking: Boolean(state.dataset.bakingCatalog.size),
    about: true,
  };
  if (state.activeModule !== "menu" && !available[state.activeModule]) state.activeModule = "menu";
  for (const button of elements.menuModule.querySelectorAll("button[data-open-module]")) button.hidden = !available[button.dataset.openModule];
  for (const view of document.querySelectorAll("[data-view]")) view.hidden = view.dataset.view !== state.activeModule;
  const titles = { sales: "Peak Hour", audit: "Auditoría", order: "Pedido", baking: "Horneo", about: "Acerca de" };
  elements.moduleNav.hidden = state.activeModule === "menu";
  elements.activeModuleTitle.textContent = titles[state.activeModule] || "Análisis";
  elements.filterPanel.hidden = !["sales", "audit"].includes(state.activeModule);
  for (const field of elements.filterPanel.querySelectorAll(".sales-only")) field.hidden = state.activeModule !== "sales";
}

function render() {
  const hasData = state.dataset.salesFacts.length || state.dataset.usageFacts.length || state.dataset.auditTickets.length || state.dataset.auditVoids.length || state.dataset.auditPayments.length || state.dataset.bakingCatalog.size;
  const hasFiles = state.files.length > 0;
  elements.emptyState.hidden = hasFiles;
  elements.dashboard.hidden = !hasFiles;
  elements.excelButton.hidden = !hasData;
  elements.pdfButton.hidden = !hasData;
  if (!hasFiles) return;
  initializeFilters();
  const filters = currentFilters();
  const summary = buildExecutiveSummary(state.dataset, filters);
  const usage = buildUsageSummary(state.dataset, filters, state.overrides);
  const audit = buildAuditSummary(state.dataset, filters);
  const baking = buildBakingSummary(state.dataset, elements.bakingFilter.value);
  const cups = buildCupSummary(state.dataset, summary, filters);
  state.summary = summary;
  state.usage = usage;
  state.audit = audit;
  state.baking = baking;
  state.cups = cups;
  elements.storeTitle.textContent = storeLabel();
  elements.periodTitle.textContent = summary.dateFrom ? `${summary.dateFrom} a ${summary.dateTo}` : "Sin venta en el filtro";
  elements.salesMetric.textContent = MONEY.format(summary.sales);
  elements.ordersMetric.textContent = NUMBER.format(summary.orders);
  elements.ticketMetric.textContent = MONEY.format(summary.averageTicket);
  elements.uptMetric.textContent = NUMBER.format(summary.upt);
  elements.focusList.innerHTML = (summary.focus.length ? summary.focus : ["Sin datos en el filtro."]).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  renderFiles();
  renderPeak(summary);
  renderProducts(summary);
  renderChannels(summary);
  renderUsage(usage);
  renderAudit(audit);
  renderCups(cups);
  renderBaking(baking);
  renderModules();
}

function reset() {
  state.dataset = createDataset();
  state.files = [];
  state.fingerprints = new Set();
  state.initializedFilters = false;
  state.summary = null;
  state.usage = null;
  state.audit = null;
  state.baking = null;
  state.cups = null;
  state.activeModule = "menu";
  elements.fileInput.value = "";
  elements.productFilter.value = "";
  elements.usageFilter.value = "";
  elements.bakingFilter.value = "";
  setProgress();
  render();
}

function clearFilters() {
  const options = getFilterOptions(state.dataset);
  elements.storeFilter.value = options.stores.length === 1 ? options.stores[0].id : "";
  elements.dateFrom.value = options.minDate;
  elements.dateTo.value = options.maxDate;
  elements.weekdayFilter.value = "";
  elements.modeFilter.value = "";
  elements.productFilter.value = "";
  elements.compostableFilter.value = "all";
  elements.usageFilter.value = "";
  render();
}

async function handleFiles(fileList) {
  const files = [...fileList];
  if (!files.length || state.loading) return;
  state.loading = true;
  elements.uploadButton.disabled = true;
  elements.uploadButton.textContent = "Leyendo…";
  let compatible = 0;
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    setProgress(`${index + 1} de ${files.length} · ${file.name}`);
    try {
      state.files.push(await inspectWorkbook(file));
      compatible += 1;
    } catch (error) {
      state.files.push({ name: file.name, compatible: false, error: error.message || "No fue posible leer el archivo." });
    }
    render();
  }
  state.loading = false;
  elements.uploadButton.disabled = false;
  elements.uploadButton.textContent = "Cargar archivos";
  elements.fileInput.value = "";
  setProgress();
  render();
  showToast(`${compatible} archivo${compatible === 1 ? "" : "s"} listo${compatible === 1 ? "" : "s"}.`);
}

function exportContext() { return { storeLabel: storeLabel(), audit: state.audit, baking: state.baking, cups: state.cups, orderDraft: state.orderDraft }; }

function safeFilename(extension) {
  const store = (elements.storeFilter.value || "Consolidado").replace(/[^a-zA-Z0-9_-]+/g, "-");
  return `Resumen_${store}_${state.summary?.dateTo || "actual"}.${extension}`;
}

function exportExcel() {
  if (!state.summary) return;
  downloadBytes(createExecutiveWorkbook(state.summary, state.usage, exportContext()), safeFilename("xlsx"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  showToast("Resumen Excel exportado.");
}

function exportPdf() {
  if (!state.summary) return;
  downloadBytes(createExecutivePdf(state.summary, state.usage, exportContext()), safeFilename("pdf"), "application/pdf");
  showToast("Resumen PDF exportado.");
}

elements.uploadButton.addEventListener("click", () => elements.fileInput.click());
elements.dropZone.addEventListener("click", () => elements.fileInput.click());
elements.dropZone.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); elements.fileInput.click(); } });
elements.fileInput.addEventListener("change", () => handleFiles(elements.fileInput.files));
elements.resetButton.addEventListener("click", reset);
elements.clearFilters.addEventListener("click", clearFilters);
elements.excelButton.addEventListener("click", exportExcel);
elements.pdfButton.addEventListener("click", exportPdf);

for (const element of [elements.storeFilter, elements.dateFrom, elements.dateTo, elements.weekdayFilter, elements.modeFilter, elements.ordersFilter, elements.compostableFilter]) {
  element.addEventListener("change", render);
}
for (const element of [elements.productFilter, elements.usageFilter, elements.bakingFilter]) {
  element.addEventListener("input", () => { window.clearTimeout(element.renderTimer); element.renderTimer = window.setTimeout(render, 120); });
}
elements.usageTable.addEventListener("change", (event) => {
  const input = event.target.closest(".minimum-input");
  const order = event.target.closest(".order-input");
  if (!input && !order) return;
  const target = input || order;
  const value = Number(String(target.value).replace(",", "."));
  if (!Number.isFinite(value) || value < 0 || (order && (!Number.isInteger(value) || value > Number(order.dataset.max)))) { showToast(order ? `Pedido máximo: ${order.dataset.max}.` : "Uso mínimo no válido."); render(); return; }
  if (input) {
    state.overrides[input.dataset.key] = value;
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(state.overrides));
  } else {
    state.orderDraft[order.dataset.key] = value;
    localStorage.setItem(ORDER_KEY, JSON.stringify(state.orderDraft));
  }
  render();
});
elements.storeType.addEventListener("change", () => {
  const store = elements.storeFilter.value;
  if (!store || state.dataset.storePolicies.has(store)) return;
  if (elements.storeType.value === "") delete state.storeTypes[store];
  else state.storeTypes[store] = elements.storeType.value === "yes";
  localStorage.setItem(STORE_TYPE_KEY, JSON.stringify(state.storeTypes));
  render();
});
elements.moduleNav.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-module]");
  if (!button || button.hidden) return;
  state.activeModule = button.dataset.module;
  renderModules();
});
elements.menuModule.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-open-module]");
  if (!button || button.hidden) return;
  state.activeModule = button.dataset.openModule;
  renderModules();
});
for (const eventName of ["dragenter", "dragover"]) elements.dropZone.addEventListener(eventName, (event) => { event.preventDefault(); elements.dropZone.classList.add("dragover"); });
for (const eventName of ["dragleave", "drop"]) elements.dropZone.addEventListener(eventName, (event) => { event.preventDefault(); elements.dropZone.classList.remove("dragover"); });
elements.dropZone.addEventListener("drop", (event) => handleFiles(event.dataTransfer.files));

render();
