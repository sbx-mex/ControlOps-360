"use strict";

export const REQUIRED_HEADERS = Object.freeze([
  "IDTienda",
  "FechaHora",
  "Ticket",
  "SecTrans",
  "SecDtl",
  "Id",
  "IDProducto",
  "Cantidad",
  "Total",
  "CantidadAjustada",
]);

export const OPTIONAL_HEADERS = Object.freeze([
  "PrecioLista",
  "NivelPrecio",
  "ModoOrden",
  "ModoOrdenDesc",
  "IDEmpleado",
  "IdTerminal",
]);

const DISPLAY_HEADERS = Object.freeze([
  "IDTienda",
  "FechaHora",
  "Ticket",
  "IDProducto",
  "Cantidad",
  "CantidadAjustada",
  "Total",
  "ModoOrdenDesc",
]);

export function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toLowerCase();
}

export function isAcSource(...values) {
  return values.some((value) => /(?:^|[\s_-])ac$/i.test(String(value ?? "").trim()));
}

export function matchStructure(headers) {
  const available = new Set(headers.map(normalize));
  const missing = REQUIRED_HEADERS.filter((header) => !available.has(normalize(header)));
  const optional = OPTIONAL_HEADERS.filter((header) => available.has(normalize(header)));
  return {
    compatible: missing.length === 0,
    missing,
    matchedRequired: REQUIRED_HEADERS.length - missing.length,
    matchedOptional: optional.length,
  };
}

function headerMap(headers) {
  const map = new Map();
  headers.forEach((header, index) => {
    const key = normalize(header);
    if (key && !map.has(key)) map.set(key, index);
  });
  return map;
}

function cleanId(value) {
  if (value == null || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  return String(value).trim();
}

function numberValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value == null || value === "") return null;
  const text = String(value).trim().replace(/[$\s]/g, "");
  const normalized = text.includes(",") && text.includes(".")
    ? text.replace(/,/g, "")
    : text.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateLabel(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = Math.round((value - 25569) * 86400000);
    const date = new Date(milliseconds);
    if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat("es-MX", {
      timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).format(date);
  }
  return String(value ?? "").trim();
}

function hourValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor((((value % 1) + 1) % 1) * 24) % 24;
  }
  const text = String(value ?? "").trim();
  const time = text.match(/(?:^|[ T])(\d{1,2}):\d{2}/);
  if (time) return Math.min(23, Number(time[1]));
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getHours();
}

function addRollup(map, key, adjusted, total) {
  const label = key || "Sin dato";
  const item = map.get(label) || { id: label, rows: 0, adjusted: 0, total: 0 };
  item.rows += 1;
  item.adjusted += adjusted ?? 0;
  item.total += total ?? 0;
  map.set(label, item);
}

export function createDataset() {
  return {
    seenRows: new Set(),
    facts: new Map(),
    seenTransactions: new Set(),
    stores: new Set(),
    products: new Map(),
    hours: new Map(),
    modes: new Map(),
    exceptions: [],
    exceptionCount: 0,
    preview: [],
    sourceRows: 0,
    uniqueRows: 0,
    duplicateRows: 0,
    invalidRows: 0,
    missingProductRows: 0,
    transactionCount: 0,
  };
}

function applyFact(dataset, key, fact, keepFact = true) {
  dataset.seenRows.add(key);
  if (keepFact) dataset.facts.set(key, fact);
  dataset.uniqueRows += 1;
  dataset.stores.add(fact.store);
  if (fact.productMissing) dataset.missingProductRows += 1;
  if (!dataset.seenTransactions.has(fact.transactionKey)) {
    dataset.seenTransactions.add(fact.transactionKey);
    dataset.transactionCount += 1;
  }
  addRollup(dataset.products, fact.product, fact.adjusted, fact.total);
  if (fact.hour != null) addRollup(dataset.hours, String(fact.hour).padStart(2, "0"), fact.adjusted, fact.total);
  addRollup(dataset.modes, fact.mode, fact.adjusted, fact.total);
  if (dataset.preview.length < 200 && fact.display) dataset.preview.push(fact.display);
  if (fact.negative) {
    dataset.exceptionCount += 1;
    if (dataset.exceptions.length < 300 && fact.display) dataset.exceptions.push(fact.display);
  }
}

export function addRows(dataset, headers, rows, source = {}) {
  const structure = matchStructure(headers);
  if (!structure.compatible) throw new Error(`Faltan columnas: ${structure.missing.join(", ")}`);
  const indexes = headerMap(headers);
  const at = (row, header) => row[indexes.get(normalize(header))];
  const start = {
    sourceRows: dataset.sourceRows,
    uniqueRows: dataset.uniqueRows,
    duplicateRows: dataset.duplicateRows,
    invalidRows: dataset.invalidRows,
  };

  for (const row of rows) {
    dataset.sourceRows += 1;
    const store = cleanId(at(row, "IDTienda"));
    const ticket = cleanId(at(row, "Ticket"));
    const secTrans = cleanId(at(row, "SecTrans"));
    const secDtl = cleanId(at(row, "SecDtl"));
    const id = cleanId(at(row, "Id"));
    const productValue = cleanId(at(row, "IDProducto"));
    if (![store, ticket, secTrans, secDtl, id].every(Boolean)) {
      dataset.invalidRows += 1;
      continue;
    }

    const key = [store, ticket, secTrans, secDtl, id, productValue || "__SIN_IDPRODUCTO__"].join("\u001f");
    if (dataset.seenRows.has(key)) {
      dataset.duplicateRows += 1;
      continue;
    }

    const date = at(row, "FechaHora");
    const transactionKey = [store, dateLabel(date), ticket, secTrans].join("\u001f");
    const quantity = numberValue(at(row, "Cantidad"));
    const adjusted = numberValue(at(row, "CantidadAjustada"));
    const total = numberValue(at(row, "Total"));
    const effectiveAdjusted = adjusted ?? quantity ?? 0;
    const hour = hourValue(date);
    const mode = String(at(row, "ModoOrdenDesc") ?? "").trim() || cleanId(at(row, "ModoOrden"));

    const display = Object.fromEntries(DISPLAY_HEADERS.map((header) => {
      const raw = at(row, header);
      return [header, header === "FechaHora" ? dateLabel(raw) : raw];
    }));
    display.Archivo = source.fileName || "";
    display.Fuente = source.sourceName || "";
    const negative = (quantity ?? 0) < 0 || (adjusted ?? 0) < 0 || (total ?? 0) < 0;
    applyFact(dataset, key, {
      store,
      product: productValue || "Sin IDProducto",
      productMissing: !productValue,
      adjusted: effectiveAdjusted,
      total,
      hour,
      mode,
      transactionKey,
      display: dataset.preview.length < 200 || negative ? display : null,
      negative,
    });
  }

  return {
    sourceRows: dataset.sourceRows - start.sourceRows,
    uniqueRows: dataset.uniqueRows - start.uniqueRows,
    duplicateRows: dataset.duplicateRows - start.duplicateRows,
    invalidRows: dataset.invalidRows - start.invalidRows,
  };
}

export function mergeDataset(target, source) {
  const result = {
    sourceRows: source.sourceRows,
    uniqueRows: 0,
    duplicateRows: source.duplicateRows,
    invalidRows: source.invalidRows,
  };
  target.sourceRows += source.sourceRows;
  target.invalidRows += source.invalidRows;
  target.duplicateRows += source.duplicateRows;
  for (const [key, fact] of source.facts) {
    if (target.seenRows.has(key)) {
      target.duplicateRows += 1;
      result.duplicateRows += 1;
      continue;
    }
    applyFact(target, key, fact, false);
    result.uniqueRows += 1;
  }
  return result;
}

export function rollupRows(map, { by = "rows", direction = "desc", limit = 100 } = {}) {
  const sign = direction === "asc" ? 1 : -1;
  return [...map.values()]
    .sort((a, b) => sign * ((a[by] ?? 0) - (b[by] ?? 0)) || String(a.id).localeCompare(String(b.id), "es"))
    .slice(0, limit);
}
