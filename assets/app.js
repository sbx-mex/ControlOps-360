"use strict";

import { addRows, createDataset, isAcSource, matchStructure, mergeDataset, rollupRows } from "./engine.mjs";

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_ENTRY_BYTES = 220 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED = 700 * 1024 * 1024;
const PREVIEW_LIMIT = 100;

const state = {
  dataset: createDataset(),
  files: [],
  fingerprints: new Set(),
  activeView: "summary",
  loading: false,
};

const elements = Object.fromEntries([
  "fileInput", "uploadButton", "resetButton", "dropZone", "emptyState", "dashboard", "filesMetric",
  "storesMetric", "rowsMetric", "duplicatesMetric", "transactionsMetric", "productsMetric", "exceptionsMetric",
  "fileList", "viewNav", "viewTitle", "viewMeta", "dataTable", "tableEmpty", "toast", "progressText",
].map((id) => [id, document.getElementById(id)]));

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value || 0);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => { elements.toast.hidden = true; }, 4200);
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
      this.entries.set(name, { method, compressedSize, uncompressedSize, localOffset });
      offset += 46 + nameLength + extraLength + commentLength;
    }
  }

  has(name) { return this.entries.has(name); }

  async bytes(name) {
    const entry = this.entries.get(name);
    if (!entry) throw new Error(`No se encontró ${name}.`);
    const local = entry.localOffset;
    if (this.view.getUint32(local, true) !== 0x04034b50) throw new Error("Entrada ZIP dañada.");
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

function resolvePath(base, target) {
  if (target.startsWith("/")) return target.slice(1);
  const parts = `${dirname(base)}/${target}`.split("/");
  const resolved = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") resolved.pop();
    else resolved.push(part);
  }
  return resolved.join("/");
}

function relationPath(path) {
  const name = path.split("/").at(-1);
  return `${dirname(path)}/_rels/${name}.rels`;
}

function relationships(xml) {
  return new Map([...xml.getElementsByTagName("Relationship")].map((node) => [
    node.getAttribute("Id"), node.getAttribute("Target"),
  ]));
}

function columnIndex(reference) {
  const letters = String(reference).match(/[A-Z]+/i)?.[0]?.toUpperCase() || "A";
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function parseRange(reference) {
  const [start, end = start] = String(reference || "A1:A1").split(":");
  const row = (cell) => Number(cell.match(/\d+/)?.[0] || 1);
  return { startRow: row(start), endRow: row(end), startCol: columnIndex(start), endCol: columnIndex(end) };
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
  const relationFile = "xl/_rels/workbook.xml.rels";
  const rels = relationships(parseXml(await zip.text(relationFile), relationFile));
  return [...workbook.getElementsByTagName("sheet")].map((node) => {
    const id = node.getAttribute("r:id") || node.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    return {
      name: node.getAttribute("name") || "Hoja",
      path: resolvePath("xl/workbook.xml", rels.get(id) || ""),
    };
  });
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
      const structure = matchStructure(headers);
      candidates.push({
        sheetName: sheet.name,
        sheetPath: sheet.path,
        sourceName: root.getAttribute("displayName") || root.getAttribute("name") || sheet.name,
        ref: root.getAttribute("ref") || "A1:A1",
        headers,
        structure,
      });
    }
  }
  return candidates;
}

async function sharedStrings(zip) {
  if (!zip.has("xl/sharedStrings.xml")) return [];
  const xml = parseXml(await zip.text("xl/sharedStrings.xml"), "sharedStrings.xml");
  return [...xml.getElementsByTagName("si")].map((item) =>
    [...item.getElementsByTagName("t")].map((node) => node.textContent || "").join(""));
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
      setProgress(`${candidate.sheetName}: ${formatNumber(processed)} filas leídas`);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
  }
  if (batch.length) onBatch(batch);
  return processed;
}

async function inspectXlsm(file) {
  if (!/\.xlsm$/i.test(file.name)) throw new Error("Solo se aceptan archivos .xlsm.");
  if (file.size > MAX_FILE_BYTES) throw new Error("El archivo supera el límite de 100 MB.");
  const buffer = await file.arrayBuffer();
  const fingerprint = await sha256(buffer);
  if (state.fingerprints.has(fingerprint)) throw new Error("Este mismo archivo ya fue cargado, aunque tenga otro nombre.");
  const zip = new ZipWorkbook(buffer);
  if (!zip.has("xl/workbook.xml") || !zip.has("xl/_rels/workbook.xml.rels") || !zip.has("xl/vbaProject.bin")) {
    throw new Error("No es un libro .xlsm compatible con macros.");
  }

  const sheets = await workbookSheets(zip);
  const candidates = await tableCandidates(zip, sheets);
  const compatible = candidates.filter((candidate) => candidate.structure.compatible);
  const selected = compatible.filter((candidate) => isAcSource(candidate.sheetName));
  if (!selected.length) {
    const best = [...candidates].sort((a, b) => b.structure.matchedRequired - a.structure.matchedRequired)[0];
    const detail = best?.structure.missing?.length ? ` Faltan: ${best.structure.missing.join(", ")}.` : "";
    throw new Error(`No se encontró una pestaña _ac con la estructura requerida.${detail}`);
  }

  const strings = await sharedStrings(zip);
  const fileDataset = createDataset();
  const sources = [];
  for (const candidate of selected) {
    const beforeRows = fileDataset.sourceRows;
    await rowsFromTable(zip, candidate, strings, (rows) => {
      addRows(fileDataset, candidate.headers, rows, { fileName: file.name, sourceName: candidate.sourceName });
    });
    sources.push({ name: candidate.sourceName, sheet: candidate.sheetName, rows: fileDataset.sourceRows - beforeRows });
  }
  const totals = mergeDataset(state.dataset, fileDataset);
  state.fingerprints.add(fingerprint);
  return { name: file.name, compatible: true, fingerprint: fingerprint.slice(0, 12), sources, ...totals };
}

function metric(id, value) { elements[id].textContent = formatNumber(value); }

function renderMetrics() {
  metric("filesMetric", state.files.filter((file) => file.compatible).length);
  metric("storesMetric", state.dataset.stores.size);
  metric("rowsMetric", state.dataset.uniqueRows);
  metric("duplicatesMetric", state.dataset.duplicateRows);
  metric("transactionsMetric", state.dataset.transactionCount);
  metric("productsMetric", state.dataset.products.size);
  metric("exceptionsMetric", state.dataset.exceptionCount);
}

function renderFiles() {
  elements.fileList.innerHTML = state.files.map((file) => `<li class="file-row ${file.compatible ? "ready" : "error"}">
    <span class="file-status" aria-hidden="true">${file.compatible ? "✓" : "!"}</span>
    <span><strong>${escapeHtml(file.name)}</strong><small>${file.compatible
      ? `${file.sources.map((source) => escapeHtml(source.sheet)).join(", ")} · ${formatNumber(file.uniqueRows)} únicas · ${formatNumber(file.duplicateRows)} duplicadas`
      : escapeHtml(file.error)}</small></span>
  </li>`).join("");
}

function objectRows(items, columns) {
  return items.map((item) => columns.map((column) => item[column.key]));
}

function viewData(view) {
  const dataset = state.dataset;
  if (view === "exceptions") {
    const columns = ["Archivo", "IDTienda", "FechaHora", "Ticket", "IDProducto", "Cantidad", "CantidadAjustada", "Total"]
      .map((key) => ({ key, label: key }));
    return { title: "Excepciones", note: "Valores negativos detectados en cantidad, cantidad ajustada o total.", columns, rows: objectRows(dataset.exceptions, columns) };
  }
  if (view === "products") {
    const columns = [{ key: "id", label: "IDProducto" }, { key: "rows", label: "Registros" }, { key: "adjusted", label: "Cantidad ajustada" }, { key: "total", label: "Total" }];
    return { title: "Productos", note: "Productos ordenados por número de registros.", columns, rows: objectRows(rollupRows(dataset.products), columns) };
  }
  if (view === "hours") {
    const columns = [{ key: "id", label: "Hora" }, { key: "rows", label: "Registros" }, { key: "adjusted", label: "Cantidad ajustada" }, { key: "total", label: "Total" }];
    const items = [...dataset.hours.values()].sort((a, b) => Number(a.id) - Number(b.id));
    return { title: "Distribución por hora", note: "Lectura por hora de FechaHora.", columns, rows: objectRows(items, columns) };
  }
  if (view === "modes") {
    const columns = [{ key: "id", label: "Modo de orden" }, { key: "rows", label: "Registros" }, { key: "adjusted", label: "Cantidad ajustada" }, { key: "total", label: "Total" }];
    return { title: "Modo de orden", note: "Distribución consolidada de los archivos compatibles.", columns, rows: objectRows(rollupRows(dataset.modes), columns) };
  }
  if (view === "records") {
    const columns = ["Archivo", "Fuente", "IDTienda", "FechaHora", "Ticket", "IDProducto", "Cantidad", "CantidadAjustada", "Total", "ModoOrdenDesc"]
      .map((key) => ({ key, label: key }));
    return { title: "Muestra de registros", note: "Primeros registros únicos; la fuente original no se modifica.", columns, rows: objectRows(dataset.preview, columns) };
  }
  const columns = [{ key: "metric", label: "Lectura" }, { key: "value", label: "Resultado" }];
  const items = [
    { metric: "Filas leídas desde _ac", value: dataset.sourceRows },
    { metric: "Filas únicas", value: dataset.uniqueRows },
    { metric: "Duplicados omitidos", value: dataset.duplicateRows },
    { metric: "Filas sin IDProducto", value: dataset.missingProductRows },
    { metric: "Filas con llave incompleta", value: dataset.invalidRows },
    { metric: "Transacciones", value: dataset.transactionCount },
    { metric: "Productos", value: dataset.products.size },
    { metric: "Tiendas", value: dataset.stores.size },
    { metric: "Excepciones negativas", value: dataset.exceptionCount },
  ];
  return { title: "Resumen de lectura", note: "Consolidado exclusivo de tablas _ac compatibles, sin duplicar la llave operativa.", columns, rows: objectRows(items, columns) };
}

function renderView() {
  elements.viewNav.querySelectorAll("[data-view]").forEach((button) => {
    const selected = button.dataset.view === state.activeView;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  const view = viewData(state.activeView);
  elements.viewTitle.textContent = view.title;
  elements.viewMeta.textContent = `${view.note} ${formatNumber(view.rows.length)} fila(s) visibles.`;
  elements.dataTable.querySelector("thead").innerHTML = `<tr>${view.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr>`;
  elements.dataTable.querySelector("tbody").innerHTML = view.rows.slice(0, PREVIEW_LIMIT).map((row) => `<tr>${row.map((value, index) => {
    const label = view.columns[index].label;
    const numeric = typeof value === "number";
    const shown = numeric ? formatNumber(value, /cantidad|total/i.test(label) ? 2 : 0) : value;
    return `<td class="${numeric ? "number" : ""}">${escapeHtml(shown)}</td>`;
  }).join("")}</tr>`).join("");
  elements.tableEmpty.hidden = view.rows.length > 0;
  elements.dataTable.parentElement.hidden = view.rows.length === 0;
}

function render() {
  const hasFiles = state.files.length > 0;
  elements.emptyState.hidden = hasFiles;
  elements.dashboard.hidden = !hasFiles;
  if (hasFiles) {
    renderMetrics();
    renderFiles();
    renderView();
  }
}

function reset() {
  state.dataset = createDataset();
  state.files = [];
  state.fingerprints = new Set();
  state.activeView = "summary";
  elements.fileInput.value = "";
  setProgress();
  render();
  showToast("La lectura local se limpió.");
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
    setProgress(`Archivo ${index + 1} de ${files.length}: ${file.name}`);
    try {
      state.files.push(await inspectXlsm(file));
      compatible += 1;
    } catch (error) {
      state.files.push({ name: file.name, compatible: false, error: error.message || "No fue posible leer el archivo." });
    }
    render();
  }
  state.loading = false;
  elements.uploadButton.disabled = false;
  elements.uploadButton.textContent = "Cargar XLSM";
  elements.fileInput.value = "";
  setProgress();
  render();
  showToast(`${compatible} de ${files.length} archivo(s) compatible(s).`);
}

elements.uploadButton.addEventListener("click", () => elements.fileInput.click());
elements.dropZone.addEventListener("click", () => elements.fileInput.click());
elements.dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); elements.fileInput.click(); }
});
elements.fileInput.addEventListener("change", () => handleFiles(elements.fileInput.files));
elements.resetButton.addEventListener("click", reset);
elements.viewNav.addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (!button) return;
  state.activeView = button.dataset.view;
  renderView();
});
for (const eventName of ["dragenter", "dragover"]) {
  elements.dropZone.addEventListener(eventName, (event) => { event.preventDefault(); elements.dropZone.classList.add("dragover"); });
}
for (const eventName of ["dragleave", "drop"]) {
  elements.dropZone.addEventListener(eventName, (event) => { event.preventDefault(); elements.dropZone.classList.remove("dragover"); });
}
elements.dropZone.addEventListener("drop", (event) => handleFiles(event.dataTransfer.files));

render();
