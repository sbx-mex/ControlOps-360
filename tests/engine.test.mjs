import assert from "node:assert/strict";
import test from "node:test";
import { addRows, createDataset, isAcSource, matchStructure, mergeDataset } from "../assets/engine.mjs";

const headers = [
  "IDTienda", "FechaHora", "Ticket", "SecTrans", "SecDtl", "Id", "IDProducto",
  "Cantidad", "PrecioLista", "Total", "NivelPrecio", "ModoOrden", "ModoOrdenDesc",
  "IDEmpleado", "IdTerminal", "CantidadAjustada",
];

const row = [
  38101, 45550.5, 100, 1, 1, 9, 1234, 2, 50, 100, 1, 3, "Mostrador", 77, 2, 2,
];

test("reconoce estructura sin usar nombre del archivo", () => {
  assert.equal(matchStructure(headers).compatible, true);
  assert.equal(matchStructure(headers.filter((header) => header !== "IDProducto")).compatible, false);
});

test("selecciona solamente nombres de fuente terminados en _ac", () => {
  assert.equal(isAcSource("detalleventa_ac"), true);
  assert.equal(isAcSource("DETALLEVENTA-AC"), true);
  assert.equal(isAcSource("detalleventa_base"), false);
});

test("consolida archivos y omite llaves repetidas", () => {
  const dataset = createDataset();
  const firstFile = createDataset();
  const secondFile = createDataset();
  addRows(firstFile, headers, [row], { fileName: "Normalizados.xlsm", sourceName: "detalleventa_ac" });
  addRows(secondFile, headers, [row], { fileName: "Normalizados (1).xlsm", sourceName: "detalleventa_ac" });
  const first = mergeDataset(dataset, firstFile);
  const second = mergeDataset(dataset, secondFile);
  assert.equal(first.uniqueRows, 1);
  assert.equal(second.uniqueRows, 0);
  assert.equal(second.duplicateRows, 1);
  assert.equal(dataset.uniqueRows, 1);
  assert.equal(dataset.transactionCount, 1);
  assert.deepEqual([...dataset.stores], ["38101"]);
});

test("identifica excepciones negativas", () => {
  const dataset = createDataset();
  const negative = [...row];
  negative[15] = -1;
  addRows(dataset, headers, [negative]);
  assert.equal(dataset.exceptions.length, 1);
});

test("conserva filas sin IDProducto y las hace visibles", () => {
  const dataset = createDataset();
  const missingProduct = [...row];
  missingProduct[6] = "";
  addRows(dataset, headers, [missingProduct]);
  assert.equal(dataset.uniqueRows, 1);
  assert.equal(dataset.invalidRows, 0);
  assert.equal(dataset.missingProductRows, 1);
  assert.equal(dataset.products.has("Sin IDProducto"), true);
});
