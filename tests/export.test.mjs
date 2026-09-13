import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import test from "node:test";
import { createExecutivePdf, createExecutiveWorkbook } from "../assets/export.mjs";

const summary = {
  sales: 12345.67,
  orders: 100,
  averageTicket: 123.45,
  units: 180,
  upt: 1.8,
  am: { label: "07:00–09:00", average: 28 },
  pm: { label: "18:00–20:00", average: 31 },
  peakByWeekday: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => ({ day, am: { label: "07:00–09:00", average: 28 }, pm: { label: "18:00–20:00", average: 31 } })),
  topProducts: [{ id: "10", name: "Latte", family: "Espresso", units: 40, sales: 3000 }],
  modes: [{ name: "Mostrador", orders: 100, units: 180, sales: 12345.67, share: 1 }],
  focus: ["Refuerza 18:00–20:00. Meta: +5."],
  dateFrom: "2026-08-24",
  dateTo: "2026-09-13",
};
const usage = { days: 21, orders: 4, factor: 3, items: [{ id: "20", store: "38101", name: "Vaso", family: "Vasos", compostable: true, applicable: true, blocked: false, sap: "149443", dia: "013895", totalUse: 42, minimum: 2, maximum: 6, orderUnit: "CAJ", maxOrderUnits: 1 }] };
const context = {
  storeLabel: "38101 · Prueba",
  cups: { quantity: 40, targetName: "Vaso Compostable Caliente 12 oz" },
  audit: { hasData: true, negativeCount: 2, negativeTotal: -100, voidCount: 3, voidTotal: 140, paymentCount: 10, paymentTotal: 1000, topReason: { name: "Error", amount: 140 }, topPayment: { name: "Efectivo", amount: 800 } },
  baking: { items: [{ group: "Pan", product: "Croissant", thaw: "4 h", bake: "15 min", temperature: "180 C", maxTray: 6, together: "Sí" }] },
  orderDraft: { "38101|20": 1 },
};

test("genera un XLSX OpenXML válido para Excel", async () => {
  const bytes = createExecutiveWorkbook(summary, usage, context);
  assert.equal(new DataView(bytes.buffer).getUint32(0, true), 0x04034b50);
  assert.ok(bytes.length > 2000);
  assert.match(new TextDecoder().decode(bytes), /Auditoría/);
  assert.match(new TextDecoder().decode(bytes), /Horneo/);
  if (process.env.CONTROLOPS_EXPORT_FIXTURES) await writeFile(process.env.CONTROLOPS_EXPORT_FIXTURES + "/resumen.xlsx", bytes);
});

test("genera un PDF ejecutivo de una página", async () => {
  const bytes = createExecutivePdf(summary, usage, context);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 8)), "%PDF-1.4");
  assert.match(new TextDecoder().decode(bytes), /\/MediaBox \[0 0 792 612\]/);
  if (process.env.CONTROLOPS_EXPORT_FIXTURES) await writeFile(process.env.CONTROLOPS_EXPORT_FIXTURES + "/resumen.pdf", bytes);
});
