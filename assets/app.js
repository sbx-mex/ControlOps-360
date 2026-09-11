"use strict";

const MODULES = [
  {
    id: "auditoria",
    title: "Auditoría Tienda",
    short: "Negativos",
    description: "Identifica transacciones con cantidades, importes o ajustes menores que cero para su revisión.",
    sheets: ["Auditoria Tienda", "Auditoria_Tienda", "Transacciones"],
    hints: ["auditoria", "transaccion"],
  },
  {
    id: "inventario",
    title: "Inventario 21 días",
    short: "Solo lectura",
    description: "Consulta clasificación y días de stock sin modificar la tabla base de 21 días.",
    sheets: ["Dias Stock", "Días Stock", "Clasificacion", "Clasificación", "Base 21 dias", "Base 21 días"],
    hints: ["gestion inventario", "inventario 2.0"],
  },
  {
    id: "historico",
    title: "Histórico Inventario",
    short: "Uso y merma",
    description: "Reúne uso, merma y variación. La integración final anexará únicamente llaves nuevas.",
    sheets: ["Uso", "Merma", "Variacion", "Variación"],
    hints: ["historico inventario", "histórico inventario"],
  },
  {
    id: "maxmin",
    title: "Máx & Mín",
    short: "Pick Pack / Unidad",
    description: "Permite cambiar entre Pick Pack y Unidad para revisar mínimos, máximos y número de pedidos.",
    sheets: ["Pick_Pack", "Pick Pack", "Unidad"],
    hints: ["max min", "max&min", "maximos minimos", "máximos mínimos"],
  },
  {
    id: "peak",
    title: "Peak Hour 2.0",
    short: "Periodo foco",
    description: "Concentra Dashboard_PeakHour y Foco_PH por semana, día y franja horaria.",
    sheets: ["Dashboard_PeakHour", "Foco_PH"],
    hints: ["peak hour", "peakhour"],
  },
  {
    id: "bebida",
    title: "Bebida & Alimento",
    short: "3 pestañas",
    description: "Prepara las tres pestañas del reporte para su futura salida Reporte_Normalizado_v2.",
    sheets: ["Bebidas", "Alimentos", "Resumen"],
    hints: ["bebida alimento", "bebidas alimentos"],
  },
];

const state = {
  files: [],
  moduleData: Object.fromEntries(MODULES.map((module) => [module.id, { files: [], sheets: {}, errors: [] }])),
  selectedModule: null,
  selectedSheets: {},
  demo: false,
};

const elements = {
  fileInput: document.getElementById("fileInput"),
  uploadButton: document.getElementById("uploadButton"),
  demoButton: document.getElementById("demoButton"),
  resetButton: document.getElementById("resetButton"),
  dropZone: document.getElementById("dropZone"),
  moduleNav: document.getElementById("moduleNav"),
  emptyState: document.getElementById("emptyState"),
  moduleView: document.getElementById("moduleView"),
  moduleEyebrow: document.getElementById("moduleEyebrow"),
  moduleTitle: document.getElementById("moduleTitle"),
  moduleDescription: document.getElementById("moduleDescription"),
  moduleStatus: document.getElementById("moduleStatus"),
  moduleControls: document.getElementById("moduleControls"),
  moduleNotice: document.getElementById("moduleNotice"),
  tableTitle: document.getElementById("tableTitle"),
  tableMeta: document.getElementById("tableMeta"),
  dataTable: document.getElementById("dataTable"),
  tableEmpty: document.getElementById("tableEmpty"),
  exportButton: document.getElementById("exportButton"),
  toast: document.getElementById("toast"),
  filesMetric: document.getElementById("filesMetric"),
  filesDetail: document.getElementById("filesDetail"),
  modulesMetric: document.getElementById("modulesMetric"),
  modulesDetail: document.getElementById("modulesDetail"),
  alertsMetric: document.getElementById("alertsMetric"),
  alertsDetail: document.getElementById("alertsDetail"),
  rowsMetric: document.getElementById("rowsMetric"),
};

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatNumber(value) {
  return new Intl.NumberFormat("es-MX").format(value || 0);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => { elements.toast.hidden = true; }, 3200);
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
    let offset = this.view.getUint32(end + 16, true);

    for (let index = 0; index < entryCount; index += 1) {
      if (this.view.getUint32(offset, true) !== 0x02014b50) throw new Error("Directorio ZIP incompleto.");
      const method = this.view.getUint16(offset + 10, true);
      const compressedSize = this.view.getUint32(offset + 20, true);
      const uncompressedSize = this.view.getUint32(offset + 24, true);
      const nameLength = this.view.getUint16(offset + 28, true);
      const extraLength = this.view.getUint16(offset + 30, true);
      const commentLength = this.view.getUint16(offset + 32, true);
      const localOffset = this.view.getUint32(offset + 42, true);
      const nameBytes = new Uint8Array(this.buffer, offset + 46, nameLength);
      const name = this.decoder.decode(nameBytes);
      this.entries.set(name, { method, compressedSize, uncompressedSize, localOffset });
      offset += 46 + nameLength + extraLength + commentLength;
    }
  }

  has(name) { return this.entries.has(name); }

  async bytes(name) {
    const entry = this.entries.get(name);
    if (!entry) throw new Error(`No se encontró ${name}`);
    const local = entry.localOffset;
    if (this.view.getUint32(local, true) !== 0x04034b50) throw new Error("Entrada ZIP dañada.");
    const nameLength = this.view.getUint16(local + 26, true);
    const extraLength = this.view.getUint16(local + 28, true);
    const start = local + 30 + nameLength + extraLength;
    const compressed = new Uint8Array(this.buffer.slice(start, start + entry.compressedSize));
    if (entry.method === 0) return compressed;
    if (entry.method !== 8) throw new Error(`Compresión ZIP no compatible: ${entry.method}`);
    if (!("DecompressionStream" in window)) throw new Error("Este navegador no permite descomprimir Excel localmente. Actualiza Chrome.");
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

function columnIndex(reference) {
  const letters = String(reference).match(/[A-Z]+/i)?.[0]?.toUpperCase() || "A";
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function cellText(cell, sharedStrings) {
  const type = cell.getAttribute("t");
  if (type === "inlineStr") {
    return [...cell.getElementsByTagName("t")].map((node) => node.textContent || "").join("");
  }
  const value = cell.getElementsByTagName("v")[0]?.textContent ?? "";
  if (type === "s") return sharedStrings[Number(value)] ?? "";
  if (type === "b") return value === "1" ? "Sí" : "No";
  if (type === "str") return value;
  if (value !== "" && Number.isFinite(Number(value))) return Number(value);
  return value;
}

function uniqueHeaders(row, width) {
  const used = new Map();
  return Array.from({ length: width }, (_, index) => {
    const base = String(row[index] ?? "").trim() || `Columna ${index + 1}`;
    const key = normalize(base);
    const count = (used.get(key) || 0) + 1;
    used.set(key, count);
    return count === 1 ? base : `${base} ${count}`;
  });
}

async function parseSheet(zip, path, sharedStrings) {
  const xml = parseXml(await zip.text(path), path);
  const matrix = [];
  for (const row of xml.getElementsByTagName("row")) {
    const rowIndex = Math.max(0, Number(row.getAttribute("r") || matrix.length + 1) - 1);
    const values = [];
    for (const cell of row.getElementsByTagName("c")) {
      values[columnIndex(cell.getAttribute("r"))] = cellText(cell, sharedStrings);
    }
    matrix[rowIndex] = values;
  }

  const populated = matrix.filter((row) => Array.isArray(row) && row.some((value) => value !== "" && value != null));
  if (!populated.length) return { headers: [], rows: [], sourceRows: 0 };
  const headerPosition = populated.slice(0, 30).findIndex((row) => row.filter((value) => value !== "" && value != null).length >= 2);
  const resolvedHeaderPosition = headerPosition < 0 ? 0 : headerPosition;
  const body = populated.slice(resolvedHeaderPosition + 1);
  const width = Math.min(30, Math.max(populated[resolvedHeaderPosition].length, ...body.slice(0, 200).map((row) => row.length)));
  const headers = uniqueHeaders(populated[resolvedHeaderPosition], width);
  const rows = body
    .filter((row) => row.some((value) => value !== "" && value != null))
    .map((row) => headers.map((_, index) => row[index] ?? ""));
  return { headers, rows, sourceRows: body.length };
}

async function inspectExcel(file) {
  const zip = new ZipWorkbook(await file.arrayBuffer());
  if (!zip.has("xl/workbook.xml") || !zip.has("xl/_rels/workbook.xml.rels")) {
    throw new Error("El archivo no contiene un libro de Excel compatible.");
  }

  const workbookXml = parseXml(await zip.text("xl/workbook.xml"), "workbook.xml");
  const relationsXml = parseXml(await zip.text("xl/_rels/workbook.xml.rels"), "relaciones del libro");
  const relations = new Map(
    [...relationsXml.getElementsByTagName("Relationship")].map((node) => [node.getAttribute("Id"), node.getAttribute("Target")])
  );
  const sheets = [...workbookXml.getElementsByTagName("sheet")].map((node) => {
    const id = node.getAttribute("r:id") || node.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const target = relations.get(id) || "";
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    return { name: node.getAttribute("name") || "Hoja", path };
  });

  let sharedStrings = [];
  if (zip.has("xl/sharedStrings.xml")) {
    const sharedXml = parseXml(await zip.text("xl/sharedStrings.xml"), "sharedStrings.xml");
    sharedStrings = [...sharedXml.getElementsByTagName("si")].map((item) =>
      [...item.getElementsByTagName("t")].map((node) => node.textContent || "").join("")
    );
  }

  const fileName = normalize(file.name.replace(/\.(xlsx|xlsm)$/i, ""));
  const matches = MODULES.filter((module) => {
    const expected = new Set(module.sheets.map(normalize));
    return sheets.some((sheet) => expected.has(normalize(sheet.name))) || module.hints.some((hint) => fileName.includes(normalize(hint)));
  });

  const parsedByModule = {};
  for (const module of matches) {
    const expected = new Set(module.sheets.map(normalize));
    let selected = sheets.filter((sheet) => expected.has(normalize(sheet.name)));
    if (!selected.length) selected = sheets.slice(0, 3);
    parsedByModule[module.id] = {};
    for (const sheet of selected) {
      if (!zip.has(sheet.path)) continue;
      parsedByModule[module.id][sheet.name] = await parseSheet(zip, sheet.path, sharedStrings);
    }
  }

  return { name: file.name, size: file.size, sheets: sheets.map((sheet) => sheet.name), parsedByModule, matchedModules: matches.map((module) => module.id) };
}

function mergeWorkbook(result) {
  state.files.push({ name: result.name, size: result.size, sheets: result.sheets, matchedModules: result.matchedModules });
  for (const moduleId of result.matchedModules) {
    const bucket = state.moduleData[moduleId];
    bucket.files.push(result.name);
    for (const [sheetName, data] of Object.entries(result.parsedByModule[moduleId] || {})) {
      let uniqueName = sheetName;
      let count = 2;
      while (bucket.sheets[uniqueName]) uniqueName = `${sheetName} (${count++})`;
      bucket.sheets[uniqueName] = data;
    }
  }
}

function isNegativeRow(headers, row) {
  const indicators = /(cantidad|importe|monto|total|ajuste|diferencia|variacion)/;
  return headers.some((header, index) => indicators.test(normalize(header)) && typeof row[index] === "number" && row[index] < 0);
}

function auditRows() {
  const bucket = state.moduleData.auditoria;
  const output = [];
  for (const [sheetName, data] of Object.entries(bucket.sheets)) {
    for (const row of data.rows) {
      if (isNegativeRow(data.headers, row)) output.push({ sheetName, headers: data.headers, row });
    }
  }
  return output;
}

function totalRows() {
  return Object.values(state.moduleData).reduce((total, bucket) =>
    total + Object.values(bucket.sheets).reduce((sum, sheet) => sum + sheet.rows.length, 0), 0);
}

function renderNav() {
  elements.moduleNav.innerHTML = MODULES.map((module, index) => {
    const bucket = state.moduleData[module.id];
    const ready = Object.keys(bucket.sheets).length > 0;
    const warning = bucket.errors.length > 0;
    const selected = state.selectedModule === module.id;
    return `<button class="module-button${selected ? " active" : ""}${ready ? " ready" : ""}${warning ? " warning" : ""}" type="button" data-module="${module.id}" aria-pressed="${selected}">
      <span class="module-number">${index + 1}</span>
      <span class="module-label"><strong>${escapeHtml(module.title)}</strong><small>${ready ? `${Object.keys(bucket.sheets).length} hoja(s)` : module.short}</small></span>
      <span class="module-dot" aria-hidden="true"></span>
    </button>`;
  }).join("");
  elements.moduleNav.querySelectorAll("[data-module]").forEach((button) => {
    button.addEventListener("click", () => selectModule(button.dataset.module));
  });
}

function renderMetrics() {
  const detected = MODULES.filter((module) => Object.keys(state.moduleData[module.id].sheets).length).length;
  const alerts = auditRows().length;
  elements.filesMetric.textContent = state.demo ? "Demo" : state.files.length;
  elements.filesDetail.textContent = state.demo ? "Datos ilustrativos" : state.files.length ? `${state.files.length} archivo(s) local(es)` : "Sin archivos";
  elements.modulesMetric.textContent = `${detected}/6`;
  elements.modulesDetail.textContent = detected === 6 ? "Motor completo" : detected ? "Mapeo parcial" : "Esperando fuentes";
  elements.alertsMetric.textContent = formatNumber(alerts);
  elements.alertsDetail.textContent = alerts ? "Requieren revisión" : "Sin alertas";
  elements.alertsMetric.closest(".metric-card").classList.toggle("has-alert", alerts > 0);
  elements.rowsMetric.textContent = formatNumber(totalRows());
}

function sheetButtons(moduleId, sheetNames) {
  if (sheetNames.length <= 1) return "";
  const selected = state.selectedSheets[moduleId] || sheetNames[0];
  return `<div class="segmented" role="group" aria-label="Seleccionar pestaña">${sheetNames.map((name) =>
    `<button class="segment${name === selected ? " active" : ""}" type="button" data-sheet="${escapeHtml(name)}">${escapeHtml(name)}</button>`
  ).join("")}</div>`;
}

function renderTable(data, options = {}) {
  const headers = data?.headers || [];
  const rows = data?.rows || [];
  const limit = Math.min(headers.length, 12);
  elements.dataTable.querySelector("thead").innerHTML = headers.length
    ? `<tr>${headers.slice(0, limit).map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join("")}</tr>`
    : "";
  elements.dataTable.querySelector("tbody").innerHTML = rows.slice(0, 60).map((row) =>
    `<tr class="${options.highlightNegatives && isNegativeRow(headers, row) ? "negative" : ""}">${row.slice(0, limit).map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`
  ).join("");
  elements.dataTable.parentElement.hidden = !headers.length || !rows.length;
  elements.tableEmpty.hidden = headers.length > 0 && rows.length > 0;
  elements.tableMeta.textContent = rows.length ? `${formatNumber(rows.length)} registros · muestra de hasta 60` : "Sin registros detectados";
}

function renderModule(moduleId) {
  const module = MODULES.find((item) => item.id === moduleId);
  const bucket = state.moduleData[moduleId];
  const sheetNames = Object.keys(bucket.sheets);
  const ready = sheetNames.length > 0;
  elements.emptyState.hidden = true;
  elements.moduleView.hidden = false;
  elements.moduleEyebrow.textContent = `Módulo ${MODULES.indexOf(module) + 1} de 6`;
  elements.moduleTitle.textContent = module.title;
  elements.moduleDescription.textContent = module.description;
  elements.moduleStatus.textContent = ready ? "Listo" : "Pendiente";
  elements.moduleStatus.className = `status-pill ${ready ? "ready" : "warning"}`;
  elements.moduleControls.innerHTML = sheetButtons(moduleId, sheetNames);
  elements.moduleControls.querySelectorAll("[data-sheet]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedSheets[moduleId] = button.dataset.sheet;
      renderModule(moduleId);
    });
  });

  let selectedSheet = state.selectedSheets[moduleId];
  if (!selectedSheet || !bucket.sheets[selectedSheet]) selectedSheet = sheetNames[0];
  state.selectedSheets[moduleId] = selectedSheet;
  let data = selectedSheet ? bucket.sheets[selectedSheet] : null;

  if (!ready) {
    elements.moduleNotice.className = "module-notice warning";
    elements.moduleNotice.textContent = `Falta cargar un archivo con alguna de estas hojas: ${module.sheets.join(", ")}.`;
    elements.tableTitle.textContent = "Vista previa";
  } else if (moduleId === "auditoria") {
    const alerts = auditRows();
    const headers = alerts[0]?.headers || data.headers;
    data = { headers, rows: alerts.map((item) => item.row) };
    elements.moduleNotice.className = `module-notice ${alerts.length ? "danger" : ""}`;
    elements.moduleNotice.textContent = alerts.length ? `${alerts.length} transacción(es) negativa(s) requieren validación.` : "No se detectaron valores negativos en las columnas numéricas revisadas.";
    elements.tableTitle.textContent = "Transacciones negativas";
  } else if (moduleId === "inventario") {
    elements.moduleNotice.className = "module-notice";
    elements.moduleNotice.textContent = "Consulta local: la base original permanece sin cambios.";
    elements.tableTitle.textContent = selectedSheet || "Inventario";
  } else if (moduleId === "historico") {
    elements.moduleNotice.className = "module-notice";
    elements.moduleNotice.textContent = "Vista previa del corte. La función append-only se activará al conectar el libro maestro real.";
    elements.tableTitle.textContent = selectedSheet || "Histórico";
  } else if (moduleId === "maxmin") {
    elements.moduleNotice.className = "module-notice";
    elements.moduleNotice.textContent = `Modo activo: ${selectedSheet}. La conversión usará el factor de empaque oficial.`;
    elements.tableTitle.textContent = `Máximos y mínimos · ${selectedSheet}`;
  } else if (moduleId === "peak") {
    elements.moduleNotice.className = "module-notice";
    elements.moduleNotice.textContent = `Fuente visible: ${selectedSheet}.`;
    elements.tableTitle.textContent = selectedSheet || "Peak Hour";
  } else {
    elements.moduleNotice.className = "module-notice";
    elements.moduleNotice.textContent = `Pestaña activa: ${selectedSheet}. La normalización final agregará TipoProducto y origen.`;
    elements.tableTitle.textContent = selectedSheet || "Bebida & Alimento";
  }
  renderTable(data, { highlightNegatives: moduleId === "auditoria" });
}

function selectModule(moduleId) {
  state.selectedModule = moduleId;
  renderNav();
  renderModule(moduleId);
}

function renderAll() {
  renderNav();
  renderMetrics();
  if (state.selectedModule) renderModule(state.selectedModule);
  else {
    elements.emptyState.hidden = false;
    elements.moduleView.hidden = true;
  }
}

function resetState() {
  state.files = [];
  state.moduleData = Object.fromEntries(MODULES.map((module) => [module.id, { files: [], sheets: {}, errors: [] }]));
  state.selectedModule = null;
  state.selectedSheets = {};
  state.demo = false;
  elements.fileInput.value = "";
  renderAll();
  showToast("La sesión local se limpió.");
}

function demoSheet(headers, rows) { return { headers, rows, sourceRows: rows.length }; }

function loadDemo() {
  resetState();
  state.demo = true;
  state.moduleData.auditoria.sheets.Transacciones = demoSheet(
    ["CeCo", "Fecha", "Transacción", "Concepto", "Cantidad", "Importe"],
    [["TIENDA DEMO", "10/09/2026", "T-001", "Ajuste inventario", -2, -248.5], ["TIENDA DEMO", "10/09/2026", "T-002", "Recepción", 12, 1490]]
  );
  state.moduleData.inventario.sheets["Días Stock"] = demoSheet(
    ["Código", "Artículo", "Clasificación", "Días stock", "Unidad"],
    [["301427", "Leche entera", "Alta rotación", 4.2, "Litro"], ["306035", "Leche light", "Media rotación", 6.8, "Litro"]]
  );
  state.moduleData.historico.sheets.Uso = demoSheet(
    ["Código", "Artículo", "Sem 25", "Sem 26", "Sem 27", "Promedio"],
    [["301427", "Leche entera", 16.4, 18.7, 21.3, 18.8], ["306035", "Leche light", 16.8, 21.8, 21.2, 19.9]]
  );
  state.moduleData.historico.sheets.Merma = demoSheet(["Código", "Artículo", "Merma"], [["301427", "Leche entera", 1.2]]);
  state.moduleData.historico.sheets.Variación = demoSheet(["Código", "Artículo", "Variación"], [["301427", "Leche entera", -0.8]]);
  state.moduleData.maxmin.sheets.Pick_Pack = demoSheet(
    ["Artículo", "Empaque", "Mín", "Máx", "Pedidos"],
    [["Leche entera", "Caja 6 piezas", 3, 12, 3], ["Leche light", "Caja 6 piezas", 2, 9, 3]]
  );
  state.moduleData.maxmin.sheets.Unidad = demoSheet(
    ["Artículo", "Empaque", "Mín", "Máx", "Pedidos"],
    [["Leche entera", "Litro", 18, 72, 3], ["Leche light", "Litro", 12, 54, 3]]
  );
  state.moduleData.peak.sheets.Dashboard_PeakHour = demoSheet(
    ["Día", "Peak Hour", "Real", "Diferencia", "Periodo"],
    [["Lunes", 74, 69, -5, "09:30–11:30"], ["Martes", 88, 91, 3, "08:30–10:30"]]
  );
  state.moduleData.peak.sheets.Foco_PH = demoSheet(["Día", "Inicio", "Fin"], [["Lunes", "09:30", "11:30"]]);
  state.moduleData.bebida.sheets.Bebidas = demoSheet(["Artículo", "Unidades", "Venta"], [["Latte", 128, 8450]]);
  state.moduleData.bebida.sheets.Alimentos = demoSheet(["Artículo", "Unidades", "Venta"], [["Croissant", 54, 3510]]);
  state.moduleData.bebida.sheets.Resumen = demoSheet(["TipoProducto", "Unidades", "Venta"], [["Bebida", 128, 8450], ["Alimento", 54, 3510]]);
  state.selectedModule = "auditoria";
  renderAll();
  showToast("Demostración cargada. Los datos son ilustrativos.");
}

async function handleFiles(fileList) {
  const files = [...fileList].filter((file) => /\.(xlsx|xlsm)$/i.test(file.name));
  if (!files.length) {
    showToast("Selecciona archivos .xlsx o .xlsm.");
    return;
  }
  if (state.demo) resetState();
  elements.uploadButton.disabled = true;
  elements.uploadButton.textContent = "Analizando…";
  let successful = 0;
  for (const file of files) {
    try {
      const result = await inspectExcel(file);
      mergeWorkbook(result);
      successful += 1;
    } catch (error) {
      state.files.push({ name: file.name, size: file.size, sheets: [], matchedModules: [], error: error.message });
    }
  }
  elements.uploadButton.disabled = false;
  elements.uploadButton.textContent = "Cargar Excel";
  const firstReady = MODULES.find((module) => Object.keys(state.moduleData[module.id].sheets).length);
  if (firstReady) state.selectedModule = firstReady.id;
  renderAll();
  showToast(`${successful} de ${files.length} archivo(s) analizado(s).`);
}

function exportDiagnostic() {
  const report = {
    project: "ControlOps 360",
    generatedAt: new Date().toISOString(),
    privacy: "Metadatos generados localmente; no incluye valores de las tablas.",
    demo: state.demo,
    files: state.files.map((file) => ({ name: file.name, size: file.size, sheets: file.sheets, matchedModules: file.matchedModules, error: file.error || null })),
    modules: MODULES.map((module) => ({
      id: module.id,
      title: module.title,
      status: Object.keys(state.moduleData[module.id].sheets).length ? "LISTO_PARA_MAPEO" : "PENDIENTE",
      files: state.moduleData[module.id].files,
      sheets: Object.entries(state.moduleData[module.id].sheets).map(([name, data]) => ({ name, rows: data.rows.length, columns: data.headers.length })),
    })),
    alerts: { negativeTransactions: auditRows().length },
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `ControlOps360_Diagnostico_${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("Diagnóstico exportado sin datos operativos.");
}

elements.uploadButton.addEventListener("click", () => elements.fileInput.click());
elements.dropZone.addEventListener("click", () => elements.fileInput.click());
elements.dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); elements.fileInput.click(); }
});
elements.fileInput.addEventListener("change", () => handleFiles(elements.fileInput.files));
elements.demoButton.addEventListener("click", loadDemo);
elements.resetButton.addEventListener("click", resetState);
elements.exportButton.addEventListener("click", exportDiagnostic);

for (const eventName of ["dragenter", "dragover"]) {
  elements.dropZone.addEventListener(eventName, (event) => { event.preventDefault(); elements.dropZone.classList.add("dragover"); });
}
for (const eventName of ["dragleave", "drop"]) {
  elements.dropZone.addEventListener(eventName, (event) => { event.preventDefault(); elements.dropZone.classList.remove("dragover"); });
}
elements.dropZone.addEventListener("drop", (event) => handleFiles(event.dataTransfer.files));

renderAll();
