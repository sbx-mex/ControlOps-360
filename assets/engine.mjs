"use strict";

export const STRUCTURES = Object.freeze({
  sales: ["IDTienda", "FechaHora", "Ticket", "SecTrans", "SecDtl", "Id", "IDProducto", "Cantidad", "Total", "CantidadAjustada"],
  usage: ["IDTienda", "Fecha", "IDArticulo", "NombreArticulo", "UsoIdeal"],
  product: ["IDProducto", "Descripcion"],
  store: ["IDTienda", "Tienda"],
  stock: ["IDArticulo", "NombreArticuloStock", "PickPack", "UnidadStock"],
  compostable: ["inven_itm_name", "Compostable"],
});

export const REQUIRED_HEADERS = STRUCTURES.sales;
export const OPTIONAL_HEADERS = Object.freeze([
  "PrecioLista", "NivelPrecio", "ModoOrden", "ModoOrdenDesc", "IDEmpleado", "IdTerminal",
]);

export const DAY_LABELS = Object.freeze(["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]);
const ORDER_FACTOR = Object.freeze({ 2: 5, 3: 4, 4: 3, 5: 2 });
const DAY_MS = 86_400_000;

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

export function matchStructure(headers, type = "sales") {
  const required = STRUCTURES[type] || STRUCTURES.sales;
  const available = new Set(headers.map(normalize));
  const missing = required.filter((header) => !available.has(normalize(header)));
  const optional = OPTIONAL_HEADERS.filter((header) => available.has(normalize(header)));
  return {
    compatible: missing.length === 0,
    missing,
    matchedRequired: required.length - missing.length,
    matchedOptional: optional.length,
    type,
  };
}

export function classifyStructure(headers) {
  return Object.keys(STRUCTURES).filter((type) => matchStructure(headers, type).compatible);
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
  return String(value).trim().replace(/\.0$/, "");
}

export function numberValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value == null || value === "") return null;
  const text = String(value).trim().replace(/[$\s]/g, "");
  const normalized = text.includes(",") && text.includes(".") ? text.replace(/,/g, "") : text.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function pad(value) { return String(value).padStart(2, "0"); }

export function dateParts(value) {
  let date = null;
  if (typeof value === "number" && Number.isFinite(value)) {
    date = new Date(Math.round((value - 25569) * DAY_MS));
  } else {
    const text = String(value ?? "").trim();
    const local = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (local) {
      const year = Number(local[3]) < 100 ? 2000 + Number(local[3]) : Number(local[3]);
      date = new Date(Date.UTC(year, Number(local[2]) - 1, Number(local[1]), Number(local[4] || 0), Number(local[5] || 0)));
    } else if (text) {
      const parsed = new Date(text);
      if (!Number.isNaN(parsed.getTime())) date = parsed;
    }
  }
  if (!date || Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  return {
    ms: Date.UTC(year, month - 1, day, hour, minute),
    dayMs: Date.UTC(year, month - 1, day),
    dateKey: `${year}-${pad(month)}-${pad(day)}`,
    dateLabel: `${pad(day)}/${pad(month)}/${year}`,
    dateTimeLabel: `${pad(day)}/${pad(month)}/${year} ${pad(hour)}:${pad(minute)}`,
    weekday: (date.getUTCDay() + 6) % 7,
    minuteOfDay: hour * 60 + minute,
    slot: hour * 2 + Math.floor(minute / 30),
  };
}

function valueAt(row, indexes, header, aliases = []) {
  for (const candidate of [header, ...aliases]) {
    const index = indexes.get(normalize(candidate));
    if (index != null) return row[index];
  }
  return "";
}

export function createDataset() {
  return {
    salesKeys: new Set(),
    usageKeys: new Set(),
    salesFacts: [],
    usageFacts: [],
    productCatalog: new Map(),
    storeCatalog: new Map(),
    stockCatalog: new Map(),
    compostableCatalog: new Map(),
    sourceRows: 0,
    uniqueRows: 0,
    duplicateRows: 0,
    invalidRows: 0,
    missingProductRows: 0,
    transactionCount: 0,
  };
}

export function addRows(dataset, headers, rows, source = {}) {
  const structure = matchStructure(headers, "sales");
  if (!structure.compatible) throw new Error(`Faltan columnas: ${structure.missing.join(", ")}`);
  const indexes = headerMap(headers);
  const before = { sourceRows: dataset.sourceRows, uniqueRows: dataset.uniqueRows, duplicateRows: dataset.duplicateRows, invalidRows: dataset.invalidRows };
  const transactionKeys = new Set(dataset.salesFacts.map((fact) => fact.transactionKey));

  for (const row of rows) {
    dataset.sourceRows += 1;
    const store = cleanId(valueAt(row, indexes, "IDTienda"));
    const ticket = cleanId(valueAt(row, indexes, "Ticket"));
    const secTrans = cleanId(valueAt(row, indexes, "SecTrans"));
    const secDtl = cleanId(valueAt(row, indexes, "SecDtl"));
    const id = cleanId(valueAt(row, indexes, "Id"));
    const product = cleanId(valueAt(row, indexes, "IDProducto"));
    const date = dateParts(valueAt(row, indexes, "FechaHora"));
    if (![store, ticket, secTrans, secDtl, id].every(Boolean) || !date) {
      dataset.invalidRows += 1;
      continue;
    }
    const key = [store, date.dateKey, ticket, secTrans, secDtl, id, product || "__SIN_PRODUCTO__"].join("\u001f");
    if (dataset.salesKeys.has(key)) {
      dataset.duplicateRows += 1;
      continue;
    }
    const transactionKey = [store, date.dateKey, ticket, secTrans].join("\u001f");
    const quantity = numberValue(valueAt(row, indexes, "Cantidad")) ?? 0;
    const adjusted = numberValue(valueAt(row, indexes, "CantidadAjustada")) ?? quantity;
    const total = numberValue(valueAt(row, indexes, "Total")) ?? 0;
    const mode = String(valueAt(row, indexes, "ModoOrdenDesc") || valueAt(row, indexes, "ModoOrden") || "Sin dato").trim();
    dataset.salesKeys.add(key);
    dataset.salesFacts.push({
      key, store, ticket, secTrans, product: product || "Sin IDProducto", quantity, adjusted, total, mode,
      transactionKey, negative: quantity < 0 || adjusted < 0 || total < 0, ...date,
      fileName: source.fileName || "", sourceName: source.sourceName || "",
    });
    dataset.uniqueRows += 1;
    if (!product) dataset.missingProductRows += 1;
    if (!transactionKeys.has(transactionKey)) {
      transactionKeys.add(transactionKey);
      dataset.transactionCount += 1;
    }
  }
  return Object.fromEntries(Object.keys(before).map((key) => [key, dataset[key] - before[key]]));
}

export function addUsageRows(dataset, headers, rows, source = {}) {
  const structure = matchStructure(headers, "usage");
  if (!structure.compatible) throw new Error(`Faltan columnas: ${structure.missing.join(", ")}`);
  const indexes = headerMap(headers);
  let added = 0;
  for (const row of rows) {
    dataset.sourceRows += 1;
    const store = cleanId(valueAt(row, indexes, "IDTienda"));
    const item = cleanId(valueAt(row, indexes, "IDArticulo"));
    const name = String(valueAt(row, indexes, "NombreArticulo") || "").trim();
    const date = dateParts(valueAt(row, indexes, "Fecha"));
    const use = numberValue(valueAt(row, indexes, "UsoIdeal"));
    if (!store || !item || !name || !date || use == null) {
      dataset.invalidRows += 1;
      continue;
    }
    const key = [store, date.dateKey, item].join("\u001f");
    if (dataset.usageKeys.has(key)) {
      dataset.duplicateRows += 1;
      continue;
    }
    dataset.usageKeys.add(key);
    dataset.usageFacts.push({
      key, store, item, name, use, ...date,
      family: String(valueAt(row, indexes, "NombreClasificador", ["ClasificadorIngrediente"]) || "Sin clasificar").trim(),
      unit: String(valueAt(row, indexes, "Unidad", ["DescripcionUM"]) || "").trim(),
      fileName: source.fileName || "", sourceName: source.sourceName || "",
    });
    added += 1;
  }
  return added;
}

function compostableValue(value) {
  const key = normalize(value);
  if (["si", "yes", "true", "1", "compostable"].includes(key)) return true;
  if (["no", "false", "0", "estandar", "standard"].includes(key)) return false;
  return null;
}

export function addReferenceRows(dataset, type, headers, rows) {
  const indexes = headerMap(headers);
  let added = 0;
  for (const row of rows) {
    if (type === "product") {
      const id = cleanId(valueAt(row, indexes, "IDProducto"));
      if (!id) continue;
      dataset.productCatalog.set(id, {
        id,
        name: String(valueAt(row, indexes, "Descripcion") || id).trim(),
        family: String(valueAt(row, indexes, "DescripcionFam") || "").trim(),
        category: String(valueAt(row, indexes, "CatDescripcion") || "").trim(),
      });
    } else if (type === "store") {
      const id = cleanId(valueAt(row, indexes, "IDTienda", ["st_num", "CC", "CeCo"]));
      const name = String(valueAt(row, indexes, "Tienda", ["NombreTienda", "st_name"]) || "").trim();
      if (!id || !name) continue;
      dataset.storeCatalog.set(id, name);
    } else if (type === "stock") {
      const id = cleanId(valueAt(row, indexes, "IDArticulo"));
      if (!id) continue;
      const pickPack = String(valueAt(row, indexes, "PickPack") || "").trim();
      const packNumber = numberValue(pickPack.match(/\d+(?:[.,]\d+)?/)?.[0]);
      dataset.stockCatalog.set(id, {
        name: String(valueAt(row, indexes, "NombreArticuloStock") || "").trim(),
        family: String(valueAt(row, indexes, "ClasificacionStock", ["GrupoMayor"]) || "").trim(),
        pickPack: packNumber ?? 1,
        stockUnit: String(valueAt(row, indexes, "UnidadStock") || "").trim(),
        orderUnit: pickPack || String(valueAt(row, indexes, "UnidadMayor") || "").trim(),
      });
    } else if (type === "compostable") {
      const name = String(valueAt(row, indexes, "inven_itm_name", ["NombreArticulo"]) || "").trim();
      const status = compostableValue(valueAt(row, indexes, "Compostable"));
      if (!name || status == null) continue;
      dataset.compostableCatalog.set(normalize(name), status);
    }
    added += 1;
  }
  return added;
}

export function mergeDataset(target, source) {
  const result = { sourceRows: source.sourceRows, uniqueRows: 0, duplicateRows: source.duplicateRows, invalidRows: source.invalidRows };
  target.sourceRows += source.sourceRows;
  target.invalidRows += source.invalidRows;
  target.duplicateRows += source.duplicateRows;
  const tx = new Set(target.salesFacts.map((fact) => fact.transactionKey));
  for (const fact of source.salesFacts) {
    if (target.salesKeys.has(fact.key)) {
      target.duplicateRows += 1;
      result.duplicateRows += 1;
      continue;
    }
    target.salesKeys.add(fact.key);
    target.salesFacts.push(fact);
    target.uniqueRows += 1;
    result.uniqueRows += 1;
    if (fact.product === "Sin IDProducto") target.missingProductRows += 1;
    if (!tx.has(fact.transactionKey)) {
      tx.add(fact.transactionKey);
      target.transactionCount += 1;
    }
  }
  for (const fact of source.usageFacts) {
    if (target.usageKeys.has(fact.key)) {
      target.duplicateRows += 1;
      result.duplicateRows += 1;
      continue;
    }
    target.usageKeys.add(fact.key);
    target.usageFacts.push(fact);
  }
  for (const name of ["productCatalog", "storeCatalog", "stockCatalog", "compostableCatalog"]) {
    for (const [key, value] of source[name]) target[name].set(key, value);
  }
  return result;
}

function storeName(dataset, store) {
  return dataset.storeCatalog.get(store) || `CeCo ${store}`;
}

function productInfo(dataset, product) {
  const known = dataset.productCatalog.get(product);
  return known ? { ...known, known: true } : { id: product, name: `Sin catálogo · ${product}`, family: "", category: "", known: false };
}

export function getFilterOptions(dataset) {
  const stores = new Set([...dataset.salesFacts.map((fact) => fact.store), ...dataset.usageFacts.map((fact) => fact.store)]);
  const dates = dataset.salesFacts.map((fact) => fact.dayMs);
  return {
    stores: [...stores].sort((a, b) => a.localeCompare(b, "es", { numeric: true })).map((id) => ({ id, name: storeName(dataset, id) })),
    modes: [...new Set(dataset.salesFacts.map((fact) => fact.mode))].sort((a, b) => a.localeCompare(b, "es")),
    minDate: dates.length ? new Date(Math.min(...dates)).toISOString().slice(0, 10) : "",
    maxDate: dates.length ? new Date(Math.max(...dates)).toISOString().slice(0, 10) : "",
  };
}

function timeLabel(slot) {
  const minutes = slot * 30;
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

function peakWindow(transactions, startSlot, endSlot, weekday = null) {
  const dates = new Map();
  for (const transaction of transactions) {
    if (weekday != null && transaction.weekday !== weekday) continue;
    if (!dates.has(transaction.dateKey)) dates.set(transaction.dateKey, new Uint32Array(48));
    dates.get(transaction.dateKey)[transaction.slot] += 1;
  }
  if (!dates.size) return { label: "—", average: 0, total: 0, days: 0, startSlot };
  let best = { startSlot, total: -1 };
  for (let slot = startSlot; slot <= endSlot - 4; slot += 1) {
    let total = 0;
    for (const counts of dates.values()) total += counts[slot] + counts[slot + 1] + counts[slot + 2] + counts[slot + 3];
    if (total > best.total) best = { startSlot: slot, total };
  }
  return {
    ...best,
    label: `${timeLabel(best.startSlot)}–${timeLabel(best.startSlot + 4)}`,
    average: best.total / dates.size,
    days: dates.size,
  };
}

function dateBoundary(value, end = false) {
  if (!value) return end ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed + (end ? DAY_MS - 1 : 0) : (end ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
}

export function buildExecutiveSummary(dataset, filters = {}) {
  const from = dateBoundary(filters.from);
  const to = dateBoundary(filters.to, true);
  const query = normalize(filters.query);
  const weekday = filters.weekday === "" || filters.weekday == null ? null : Number(filters.weekday);
  const facts = dataset.salesFacts.filter((fact) => {
    if (filters.store && fact.store !== filters.store) return false;
    if (fact.ms < from || fact.ms > to) return false;
    if (weekday != null && fact.weekday !== weekday) return false;
    if (filters.mode && fact.mode !== filters.mode) return false;
    if (query) {
      const product = productInfo(dataset, fact.product);
      if (!normalize(`${fact.product} ${product.name} ${product.family} ${product.category}`).includes(query)) return false;
    }
    return true;
  });

  const transactions = new Map();
  const products = new Map();
  const modes = new Map();
  let sales = 0;
  let units = 0;
  let exceptions = 0;
  for (const fact of facts) {
    sales += fact.total;
    units += fact.adjusted;
    if (fact.negative) exceptions += 1;
    if (!transactions.has(fact.transactionKey)) transactions.set(fact.transactionKey, fact);
    const product = products.get(fact.product) || { ...productInfo(dataset, fact.product), units: 0, sales: 0, rows: 0 };
    product.units += fact.adjusted;
    product.sales += fact.total;
    product.rows += 1;
    products.set(fact.product, product);
    const mode = modes.get(fact.mode) || { name: fact.mode, sales: 0, units: 0, transactions: new Set() };
    mode.sales += fact.total;
    mode.units += fact.adjusted;
    mode.transactions.add(fact.transactionKey);
    modes.set(fact.mode, mode);
  }
  const txList = [...transactions.values()];
  const am = peakWindow(txList, 10, 30);
  const pm = peakWindow(txList, 30, 46);
  const peakByWeekday = DAY_LABELS.map((day, index) => ({
    day,
    am: peakWindow(txList, 10, 30, index),
    pm: peakWindow(txList, 30, 46, index),
  }));
  const topProducts = [...products.values()].sort((a, b) => Number(b.known) - Number(a.known) || b.sales - a.sales || b.units - a.units).slice(0, 50);
  const modeRows = [...modes.values()].map((item) => ({
    name: item.name,
    sales: item.sales,
    units: item.units,
    orders: item.transactions.size,
    share: sales ? item.sales / sales : 0,
  })).sort((a, b) => b.sales - a.sales);
  const strongest = am.total >= pm.total ? am : pm;
  const focus = [];
  if (strongest.total > 0) focus.push(`Refuerza ${strongest.label}: concentra ${Math.round((strongest.total / Math.max(1, transactions.size)) * 100)}% de las órdenes. Meta: +5.`);
  if (modeRows[0]) focus.push(`${modeRows[0].name} lidera con ${Math.round(modeRows[0].share * 100)}% de la venta.`);
  if (topProducts[0]) focus.push(`${topProducts[0].name} es el producto de mayor venta en el filtro.`);
  const dayValues = facts.map((fact) => fact.dayMs);
  return {
    facts,
    sales,
    units,
    orders: transactions.size,
    averageTicket: transactions.size ? sales / transactions.size : 0,
    upt: transactions.size ? units / transactions.size : 0,
    exceptions,
    am,
    pm,
    peakByWeekday,
    topProducts,
    modes: modeRows,
    focus,
    dateFrom: dayValues.length ? new Date(Math.min(...dayValues)).toISOString().slice(0, 10) : "",
    dateTo: dayValues.length ? new Date(Math.max(...dayValues)).toISOString().slice(0, 10) : "",
  };
}

function inferredCompostable(dataset, fact) {
  const exact = dataset.compostableCatalog.get(normalize(fact.name)) ?? dataset.compostableCatalog.get(normalize(fact.name).replace(/^\d{5,6}/, ""));
  if (exact != null) return exact;
  const value = normalize(`${fact.name} ${fact.family}`);
  if (/(compostable|biodegradable|bagazo|ecocomp|cpla)/.test(value)) return true;
  return null;
}

export function buildUsageSummary(dataset, filters = {}, overrides = {}) {
  const storeFacts = dataset.usageFacts.filter((fact) => !filters.store || fact.store === filters.store);
  if (!storeFacts.length) return { items: [], days: 0, dateFrom: "", dateTo: "", orders: Number(filters.orders) || 2 };
  const maxDay = Math.max(...storeFacts.map((fact) => fact.dayMs));
  const minAvailable = Math.min(...storeFacts.map((fact) => fact.dayMs));
  const start = Math.max(minAvailable, maxDay - 20 * DAY_MS);
  const days = Math.max(1, Math.round((maxDay - start) / DAY_MS) + 1);
  const grouped = new Map();
  for (const fact of storeFacts) {
    if (fact.dayMs < start || fact.dayMs > maxDay) continue;
    const item = grouped.get(fact.item) || { id: fact.item, name: fact.name, family: fact.family, unit: fact.unit, totalUse: 0, dates: new Set(), store: fact.store, compostable: inferredCompostable(dataset, fact) };
    item.totalUse += fact.use;
    item.dates.add(fact.dateKey);
    grouped.set(fact.item, item);
  }
  const orders = [2, 3, 4, 5].includes(Number(filters.orders)) ? Number(filters.orders) : 2;
  const factor = ORDER_FACTOR[orders];
  const query = normalize(filters.usageQuery);
  const type = filters.compostable || "all";
  const stockByName = new Map([...dataset.stockCatalog.values()].filter((item) => item.name).map((item) => [normalize(item.name).replace(/^\d{5,6}/, ""), item]));
  const items = [...grouped.values()].map((item) => {
    const stock = dataset.stockCatalog.get(item.id) || stockByName.get(normalize(item.name).replace(/^\d{5,6}/, "")) || {};
    const calculated = item.totalUse / days;
    const override = numberValue(overrides[`${item.store}|${item.id}`]);
    const minimum = override != null && override >= 0 ? override : calculated;
    const pack = Math.max(1, Number(stock.pickPack) || 1);
    return {
      ...item,
      name: stock.name || item.name,
      family: stock.family || item.family,
      unit: stock.stockUnit || item.unit,
      orderUnit: stock.orderUnit || "Unidad",
      pack,
      calculated,
      minimum,
      maximum: minimum * factor,
      maxOrderUnits: Math.ceil((minimum * factor) / pack),
      overridden: override != null && override >= 0,
    };
  }).filter((item) => {
    if (type === "yes" && item.compostable !== true) return false;
    if (type === "no" && item.compostable !== false) return false;
    return !query || normalize(`${item.id} ${item.name} ${item.family}`).includes(query);
  }).sort((a, b) => b.maximum - a.maximum || a.name.localeCompare(b.name, "es"));
  return {
    items,
    days,
    orders,
    factor,
    dateFrom: new Date(start).toISOString().slice(0, 10),
    dateTo: new Date(maxDay).toISOString().slice(0, 10),
  };
}

export function rollupRows(map, { by = "rows", direction = "desc", limit = 100 } = {}) {
  const sign = direction === "asc" ? 1 : -1;
  return [...map.values()].sort((a, b) => sign * ((a[by] ?? 0) - (b[by] ?? 0))).slice(0, limit);
}
