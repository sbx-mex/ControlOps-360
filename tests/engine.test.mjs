import assert from "node:assert/strict";
import test from "node:test";
import {
  addAuditRows, addReferenceRows, addRows, addUsageRows, buildAuditSummary, buildCupSummary, buildExecutiveSummary, buildUsageSummary,
  classifyStructure, createDataset, isAcSource, matchStructure, mergeDataset,
} from "../assets/engine.mjs";

const headers = [
  "IDTienda", "FechaHora", "Ticket", "SecTrans", "SecDtl", "Id", "IDProducto",
  "Cantidad", "PrecioLista", "Total", "NivelPrecio", "ModoOrden", "ModoOrdenDesc",
  "IDEmpleado", "IdTerminal", "CantidadAjustada",
];

function salesRow({ date = 45550.5, ticket = 100, detail = 1, id = 9, product = 1234, quantity = 2, total = 100, mode = "Mostrador" } = {}) {
  return [38101, date, ticket, 1, detail, id, product, quantity, 50, total, 1, 3, mode, 77, 2, quantity];
}

test("reconoce venta y uso por columnas, no por archivo", () => {
  assert.equal(matchStructure(headers).compatible, true);
  assert.equal(matchStructure(headers.filter((header) => header !== "IDProducto")).compatible, false);
  assert.deepEqual(classifyStructure(["IDTienda", "Fecha", "IDArticulo", "NombreArticulo", "UsoIdeal"]), ["usage"]);
});

test("selecciona solamente nombres de fuente terminados en _ac", () => {
  assert.equal(isAcSource("detalleventa_ac"), true);
  assert.equal(isAcSource("USO-AC"), true);
  assert.equal(isAcSource("detalleventa_base"), false);
});

test("consolida archivos renombrados y omite la misma llave", () => {
  const dataset = createDataset();
  const first = createDataset();
  const second = createDataset();
  addRows(first, headers, [salesRow()], { fileName: "Normalizados.xlsm", sourceName: "detalleventa_ac" });
  addRows(second, headers, [salesRow()], { fileName: "Normalizados (1).xlsm", sourceName: "detalleventa_ac" });
  assert.equal(mergeDataset(dataset, first).uniqueRows, 1);
  assert.equal(mergeDataset(dataset, second).duplicateRows, 1);
  assert.equal(dataset.salesFacts.length, 1);
  assert.equal(dataset.transactionCount, 1);
});

test("calcula KPI y Peak Hour con cuatro medias horas consecutivas", () => {
  const dataset = createDataset();
  const rows = [];
  [45550.25, 45550.2708333333, 45550.2916666667, 45550.3125].forEach((date, index) => {
    rows.push(salesRow({ date, ticket: 100 + index, detail: 1, id: 20 + index, total: 50 }));
  });
  addRows(dataset, headers, rows);
  const result = buildExecutiveSummary(dataset);
  assert.equal(result.orders, 4);
  assert.equal(result.sales, 200);
  assert.equal(result.averageTicket, 50);
  assert.equal(result.am.label, "06:00–08:00");
  assert.equal(result.am.average, 4);
});

test("enriquece producto para un resumen entendible", () => {
  const dataset = createDataset();
  addRows(dataset, headers, [salesRow()]);
  addReferenceRows(dataset, "product", ["IDProducto", "Descripcion", "DescripcionFam"], [[1234, "Latte", "Espresso"]]);
  assert.equal(buildExecutiveSummary(dataset).topProducts[0].name, "Latte");
});

test("acumula 21 días y permite mínimo editable", () => {
  const dataset = createDataset();
  const usageHeaders = ["IDTienda", "Fecha", "IDArticulo", "NombreArticulo", "NombreClasificador", "Unidad", "UsoIdeal"];
  const rows = Array.from({ length: 21 }, (_, index) => [38101, 45530 + index, 10, "Vaso compostable", "Vasos", "PZA", 2]);
  addUsageRows(dataset, usageHeaders, rows);
  const base = buildUsageSummary(dataset, { store: "38101", orders: 4 });
  assert.equal(base.days, 21);
  assert.equal(base.items[0].minimum, 2);
  assert.equal(base.items[0].maximum, 6);
  assert.equal(base.items[0].compostable, true);
  const edited = buildUsageSummary(dataset, { store: "38101", orders: 4 }, { "38101|10": 3 });
  assert.equal(edited.items[0].maximum, 9);
});

test("conserva filas sin IDProducto y detecta negativos", () => {
  const dataset = createDataset();
  addRows(dataset, headers, [salesRow({ product: "", quantity: -1 })]);
  const result = buildExecutiveSummary(dataset);
  assert.equal(dataset.missingProductRows, 1);
  assert.equal(result.exceptions, 1);
});

test("resume auditoría por estructura _ac", () => {
  const dataset = createDataset();
  addAuditRows(dataset, "auditVoid", ["IDTienda", "FechaHora", "Ticket", "IDProducto", "IdVoid", "VoidReason", "Total"], [[38101, 45550.5, 100, 20, 1, "Error captura", -90]]);
  const audit = buildAuditSummary(dataset, { store: "38101" });
  assert.equal(audit.voidCount, 1);
  assert.equal(audit.voidTotal, 90);
  assert.equal(audit.topReason.name, "Error captura");
});

test("WOE bloquea vasos que no aplican al CeCo", () => {
  const dataset = createDataset();
  addUsageRows(dataset, ["IDTienda", "Fecha", "IDArticulo", "NombreArticulo", "UsoIdeal"], [[38101, 45550, 10, "Vaso Compostable Caliente 12 oz", 10]]);
  addReferenceRows(dataset, "woe", ["Nombre Micros", "#SAP", "#DIA", "Descripcion WOE", "UMB WOE Cantidad pedido", "Comentario Para Revision"], [["Vaso Compostable Caliente 12 oz", 149443, "013895", "Vaso", 1000, "Compostable: Si"]]);
  const usage = buildUsageSummary(dataset, { store: "38101", storeType: false });
  assert.equal(usage.items[0].applicable, false);
  assert.equal(usage.items[0].sap, "149443");
});

test("Normalizados convierte Bebida Alta Caliente a vaso 12 oz", () => {
  const dataset = createDataset();
  addRows(dataset, headers, [salesRow({ product: 27 })]);
  dataset.salesFacts[0].priceLevel = 2;
  addReferenceRows(dataset, "product", ["IDProducto", "Descripcion"], [[27, "Cappuccino"]]);
  addReferenceRows(dataset, "woe", ["Nombre Micros", "#SAP", "#DIA", "Descripcion WOE", "UMB WOE Cantidad pedido", "Comentario Para Revision"], [["Vaso de Papel 12 oz", 149227, "000873", "Vaso", 1000, "Compostable: No"]]);
  const summary = buildExecutiveSummary(dataset, { store: "38101" });
  const cups = buildCupSummary(dataset, summary, { store: "38101", storeType: false });
  assert.equal(cups.quantity, 2);
  assert.equal(cups.ready, true);
});
