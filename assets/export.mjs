"use strict";

const encoder = new TextEncoder();
const MONEY = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const NUMBER = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

function xmlEscape(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function cellReference(column, row) {
  let value = column + 1;
  let letters = "";
  while (value) {
    value -= 1;
    letters = String.fromCharCode(65 + (value % 26)) + letters;
    value = Math.floor(value / 26);
  }
  return `${letters}${row}`;
}

function worksheetXml(rows) {
  const width = Math.max(1, ...rows.map((row) => row.length));
  const sheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const ref = cellReference(columnIndex, rowIndex + 1);
      const style = rowIndex === 0 ? ' s="1"' : (columnIndex > 0 && typeof value === "number" ? ' s="2"' : "");
      if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"${style}><v>${value}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${Array.from({ length: width }, (_, index) => `<col min="${index + 1}" max="${index + 1}" width="${index === 0 ? 28 : 20}" customWidth="1"/>`).join("")}</cols><sheetData>${sheetRows}</sheetData>${rows.length > 1 ? `<autoFilter ref="A1:${cellReference(width - 1, rows.length)}"/>` : ""}</worksheet>`;
}

let crcTable;
function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function little(view, offset, value, bytes) {
  if (bytes === 2) view.setUint16(offset, value, true);
  else view.setUint32(offset, value, true);
}

function concat(chunks) {
  const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}

function zipStore(entries) {
  const localChunks = [];
  const centralChunks = [];
  let localOffset = 0;
  for (const [name, content] of entries) {
    const nameBytes = encoder.encode(name);
    const data = typeof content === "string" ? encoder.encode(content) : content;
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    little(lv, 0, 0x04034b50, 4); little(lv, 4, 20, 2); little(lv, 6, 0x0800, 2);
    little(lv, 8, 0, 2); little(lv, 10, 0, 2); little(lv, 12, 0, 2); little(lv, 14, crc, 4);
    little(lv, 18, data.length, 4); little(lv, 22, data.length, 4); little(lv, 26, nameBytes.length, 2);
    local.set(nameBytes, 30);
    localChunks.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    little(cv, 0, 0x02014b50, 4); little(cv, 4, 20, 2); little(cv, 6, 20, 2); little(cv, 8, 0x0800, 2);
    little(cv, 10, 0, 2); little(cv, 12, 0, 2); little(cv, 14, 0, 2); little(cv, 16, crc, 4);
    little(cv, 20, data.length, 4); little(cv, 24, data.length, 4); little(cv, 28, nameBytes.length, 2);
    little(cv, 42, localOffset, 4);
    central.set(nameBytes, 46);
    centralChunks.push(central);
    localOffset += local.length + data.length;
  }
  const central = concat(centralChunks);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  little(ev, 0, 0x06054b50, 4); little(ev, 8, entries.length, 2); little(ev, 10, entries.length, 2);
  little(ev, 12, central.length, 4); little(ev, 16, localOffset, 4);
  return concat([...localChunks, central, end]);
}

function safeSheetName(value, used) {
  const base = String(value).replace(/[\\/*?:\[\]]/g, " ").trim().slice(0, 31) || "Hoja";
  let name = base;
  let index = 2;
  while (used.has(name)) name = `${base.slice(0, 27)} ${index++}`;
  used.add(name);
  return name;
}

export function createExecutiveWorkbook(summary, usage, context = {}) {
  const focusRows = summary.focus.length ? summary.focus.map((item) => ["Acción", item]) : [["Acción", "Sin datos en el filtro"]];
  const sheets = [
    { name: "Resumen", rows: [
      ["Resumen ejecutivo", context.storeLabel || "Todas las tiendas"],
      ["Periodo", `${summary.dateFrom || "—"} a ${summary.dateTo || "—"}`],
      ["Venta neta", summary.sales], ["Órdenes", summary.orders], ["Ticket promedio", summary.averageTicket],
      ["Unidades", summary.units], ["UPT", summary.upt], ["Peak AM", summary.am.label],
      ["Órdenes promedio AM", summary.am.average], ["Peak PM", summary.pm.label], ["Órdenes promedio PM", summary.pm.average],
      ["", ""], ...focusRows,
    ] },
    { name: "Peak Hour", rows: [["Día", "Peak AM", "Órdenes prom. AM", "Peak PM", "Órdenes prom. PM"], ...summary.peakByWeekday.map((row) => [row.day, row.am.label, row.am.average, row.pm.label, row.pm.average])] },
    { name: "Productos", rows: [["ID", "Producto", "Familia", "Unidades", "Venta"], ...summary.topProducts.map((row) => [row.id, row.name, row.family || row.category, row.units, row.sales])] },
    { name: "Canales", rows: [["Canal", "Órdenes", "Unidades", "Venta", "% venta"], ...summary.modes.map((row) => [row.name, row.orders, row.units, row.sales, row.share])] },
  ];
  if (context.cups?.quantity) sheets[0].rows.push(["Bebida Alta Caliente", context.cups.quantity], ["Vaso aplicable", context.cups.targetName]);
  if (context.audit?.hasData) sheets.push({ name: "Auditoría", rows: [
    ["Indicador", "Resultado"],
    ["Tickets negativos", context.audit.negativeCount], ["Importe negativo", context.audit.negativeTotal],
    ["Tickets con void", context.audit.voidCount], ["Importe void", context.audit.voidTotal],
    ["Pagos leídos", context.audit.paymentCount], ["Importe pagos", context.audit.paymentTotal],
    ["Riesgo principal", context.audit.topReason.name], ["Forma de pago principal", context.audit.topPayment.name],
  ] });
  if (usage.items.length) sheets.push({ name: "Uso acumulado", rows: [
    ["Artículo", "Nombre", "SAP", "DIA", "Aplica", `Uso ${usage.days} días`, "Uso mínimo diario", "Máximo", "Unidad pedido", "Máx. pedido"],
    ...usage.items.map((row) => [row.id, row.name, row.sap, row.dia, row.blocked ? "Definir tienda" : row.applicable ? "Sí" : "No", row.totalUse, row.minimum, row.maximum, row.orderUnit, row.maxOrderUnits]),
  ] });
  const orderRows = (usage.items || []).filter((row) => row.applicable && !row.blocked && Number(context.orderDraft?.[`${row.store}|${row.id}`]) > 0);
  if (orderRows.length) sheets.push({ name: "Pedido", rows: [
    ["Artículo", "Nombre", "SAP", "DIA", "Unidad", "Cantidad"],
    ...orderRows.map((row) => [row.id, row.name, row.sap, row.dia, row.orderUnit, Number(context.orderDraft[`${row.store}|${row.id}`])]),
  ] });
  if (context.baking?.items?.length) sheets.push({ name: "Horneo", rows: [
    ["Grupo", "Producto", "Descongelación", "Horneo", "Temperatura", "Máximo por charola", "Compatible"],
    ...context.baking.items.map((row) => [row.group, row.product, row.thaw, row.bake, row.temperature, row.maxTray ?? "", row.together]),
  ] });
  const used = new Set();
  sheets.forEach((sheet) => { sheet.name = safeSheetName(sheet.name, used); });
  const entries = [];
  entries.push(["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`]);
  entries.push(["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`]);
  entries.push(["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets></workbook>`]);
  entries.push(["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`]);
  entries.push(["xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Aptos"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF006241"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`]);
  sheets.forEach((sheet, index) => entries.push([`xl/worksheets/sheet${index + 1}.xml`, worksheetXml(sheet.rows)]));
  return zipStore(entries);
}

function pdfEscape(value) {
  const winAnsi = { 0x2013: 150, 0x2014: 151, 0x2022: 149, 0x2026: 133, 0x2018: 145, 0x2019: 146, 0x201c: 147, 0x201d: 148 };
  return String(value ?? "").split("").map((char) => {
    const code = char.charCodeAt(0);
    if (code >= 32 && code <= 126 && ![40, 41, 92].includes(code)) return char;
    const latin = code <= 255 ? code : (winAnsi[code] ?? 63);
    return `\\${latin.toString(8).padStart(3, "0")}`;
  }).join("");
}

function trim(value, length = 42) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

export function createExecutivePdf(summary, usage, context = {}) {
  const commands = [];
  const rect = (x, y, width, height, color) => commands.push(`${color} rg ${x} ${y} ${width} ${height} re f`);
  const text = (x, y, size, value, bold = false, color = "0.08 0.20 0.15") => commands.push(`BT /F${bold ? 2 : 1} ${size} Tf ${color} rg ${x} ${y} Td (${pdfEscape(value)}) Tj ET`);
  rect(0, 550, 792, 62, "0 0.30 0.20");
  text(34, 580, 19, "RESUMEN EJECUTIVO", true, "1 1 1");
  text(34, 561, 9, `${context.storeLabel || "Todas las tiendas"}  ·  ${summary.dateFrom || "—"} a ${summary.dateTo || "—"}`, false, "0.82 0.93 0.88");
  const metrics = summary.orders
    ? [["VENTA NETA", MONEY.format(summary.sales)], ["ÓRDENES", NUMBER.format(summary.orders)], ["TICKET PROM.", MONEY.format(summary.averageTicket)], ["UPT", NUMBER.format(summary.upt)]]
    : context.audit?.hasData
      ? [["NEGATIVOS", NUMBER.format(context.audit.negativeCount)], ["VOIDS", NUMBER.format(context.audit.voidCount)], ["PAGOS", NUMBER.format(context.audit.paymentCount)], ["IMPORTE VOID", MONEY.format(context.audit.voidTotal)]]
      : [["DÍAS DE USO", NUMBER.format(usage.days)], ["ARTÍCULOS", NUMBER.format(usage.items.length)], ["MAPEADOS WOE", NUMBER.format(usage.mapped || 0)], ["NO APLICAN", NUMBER.format(usage.excluded || 0)]];
  metrics.forEach(([label, value], index) => {
    const x = 34 + index * 184;
    rect(x, 475, 168, 58, "0.94 0.97 0.95");
    text(x + 12, 513, 8, label, true, "0.25 0.38 0.32");
    text(x + 12, 487, 17, value, true);
  });
  if (summary.orders) {
    text(34, 445, 12, "PEAK HOUR · 4 MEDIAS HORAS CONSECUTIVAS", true);
    rect(34, 393, 352, 40, "0.90 0.95 0.92");
    text(48, 417, 9, "AM 05:00–15:00", true); text(190, 417, 12, summary.am.label, true); text(290, 417, 9, `${NUMBER.format(summary.am.average)} órdenes/día`);
    rect(406, 393, 352, 40, "0.90 0.95 0.92");
    text(420, 417, 9, "PM 15:00–23:00", true); text(562, 417, 12, summary.pm.label, true); text(662, 417, 9, `${NUMBER.format(summary.pm.average)} órdenes/día`);
    text(34, 362, 11, "ENFOQUE GERENTE", true);
    summary.focus.slice(0, 3).forEach((item, index) => text(48, 342 - index * 17, 9, `• ${trim(item, 112)}`));
    text(34, 278, 11, "PEAK POR DÍA", true); text(406, 278, 11, "PRODUCTOS QUE MUEVEN LA VENTA", true);
    summary.peakByWeekday.forEach((row, index) => { const y = 250 - index * 21; text(40, y, 8, `${row.day}  ${row.am.label}  /  ${row.pm.label}`); });
    summary.topProducts.slice(0, 7).forEach((row, index) => text(412, 250 - index * 21, 8, `${trim(row.name, 34)}  ${MONEY.format(row.sales)}`));
  } else if (context.audit?.hasData) {
    text(34, 445, 12, "AUDITORÍA", true);
    text(48, 416, 10, `Riesgo principal: ${trim(context.audit.topReason.name, 70)}`, true);
    text(48, 390, 10, `Forma de pago principal: ${trim(context.audit.topPayment.name, 56)} · ${MONEY.format(context.audit.topPayment.amount)}`);
    text(48, 364, 10, `Importe negativo: ${MONEY.format(context.audit.negativeTotal)} · Importe void: ${MONEY.format(context.audit.voidTotal)}`);
  } else if (usage.items.length) {
    text(34, 445, 12, "PEDIDO · ARTÍCULOS DE MAYOR USO", true);
    usage.items.filter((row) => row.applicable && !row.blocked).slice(0, 10).forEach((row, index) => text(48, 416 - index * 25, 9, `${trim(row.name, 52)} · mín ${NUMBER.format(row.minimum)} · máx ${NUMBER.format(row.maxOrderUnits)} ${row.orderUnit}`));
  } else if (context.baking?.items?.length) {
    text(34, 445, 12, "PARÁMETROS DE HORNEO", true);
    context.baking.items.slice(0, 10).forEach((row, index) => text(48, 416 - index * 25, 9, `${trim(row.product, 45)} · ${trim(row.bake, 30)} · ${trim(row.temperature, 18)}`));
  }
  if (usage.items.length) {
    text(34, 78, 10, `USO ${usage.days} DÍAS · ${usage.orders} PEDIDOS`, true);
    usage.items.slice(0, 4).forEach((row, index) => text(220 + index * 140, 78, 8, `${trim(row.name, 18)}  MÍN ${NUMBER.format(row.minimum)} · MÁX ${NUMBER.format(row.maximum)}`));
  }
  text(34, 28, 7, "ControlOps 360 · Lectura local por estructura _ac", false, "0.35 0.45 0.40");
  const stream = commands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return encoder.encode(pdf);
}

export function downloadBytes(bytes, filename, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}
