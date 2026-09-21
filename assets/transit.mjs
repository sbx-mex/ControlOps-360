const PROVIDERS = [
  ['COMERCIALIZADORA DE LACTEOS', 'LALA'],
  ['CAFE SIRENA', 'Maquila'],
  ['DISTRIBUIDORA E IMPORTADORA', 'DIA'],
];

const ORDER_LINE = /^\s*(\d{3,})\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s+(CAJ|PQT|PZA|BOT|BTE|ROL|GAL|SOB|KG|LT)\s+(\d{5,})\s*$/i;
const STORE_STOP_WORDS = new Set(['sb','starbucks','coffee','mexico','mx','tienda','sucursal','de','del','la','las','los','y','sa','cv']);

export function compactCode(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.replace(/^0+(?=\d)/, '');
}

function toIso(value) {
  const [day, month, year] = String(value).split('/').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (!day || !month || !year || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function storeTokens(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(token => token && !STORE_STOP_WORDS.has(token));
}

export function similarStoreName(left, right) {
  const a = storeTokens(left), b = storeTokens(right);
  if (!a.length || !b.length) return false;
  const matches = a.filter(token => b.some(other => token === other || (token.startsWith(other) || other.startsWith(token)) && (Math.min(token.length, other.length) >= 4 || Math.min(token.length, other.length) >= 3 && a.length > 1 && b.length > 1))).length;
  return matches / Math.max(a.length, b.length) >= 0.6;
}

function extractStoreName(lines) {
  const candidates = [];
  const contact = lines.findIndex(line => /Persona de contacto\s*\/\s*Tel/i.test(line));
  if (contact >= 0) {
    const inlineParts = lines[contact].split('/');
    if (inlineParts.length >= 3) candidates.push(inlineParts.at(-1).trim());
    candidates.push(...lines.slice(contact + 1, contact + 4).map(line => line.includes('/') ? line.split('/').at(-1).trim() : line.trim()));
  }
  const supply = lines.findIndex(line => /S[ií]rvase suministrar a/i.test(line));
  if (supply >= 0) candidates.push(...lines.slice(supply + 1, supply + 6));
  return candidates.find(value => {
    const text = String(value || '').trim();
    return storeTokens(text).length && !/^(?:B?\d+|Direcci[oó]n|Av\.|Calle|Carretera|CP\b|\d{5}\b)/i.test(text) && !/STARBUCKS COFFEE|SAPI|RFC/i.test(text);
  })?.trim() || '';
}

function pageLines(items) {
  const buckets = new Map();
  for (const item of items) {
    const text = String(item.str || '').trim();
    if (!text) continue;
    const x = item.transform?.[4] ?? 0;
    const y = Math.round((item.transform?.[5] ?? 0) * 2) / 2;
    if (!buckets.has(y)) buckets.set(y, []);
    buckets.get(y).push({x, text});
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, pieces]) => pieces.sort((a, b) => a.x - b.x).map(piece => piece.text).join(' '));
}

async function sha256(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function parseTransitLines(lines, sourceName = 'pedido.pdf') {
  const fullText = lines.join('\n');
  const provider = lines.find(line => PROVIDERS.some(([name]) => line.toUpperCase().includes(name)))
    ?.replace(/\s+Pedido.*$/i, '').trim() || 'Proveedor no identificado';
  const providerAlias = PROVIDERS.find(([name]) => provider.toUpperCase().includes(name))?.[1] || 'DIA';
  const orderMatch = fullText.match(/(\d{8,12})\s*\/\s*(\d{2}\/\d{2}\/\d{4})/);
  const deliveryMatch = fullText.match(/Fecha de entrega(?:\s+D[ií]a)?\s*(\d{2}\/\d{2}\/\d{4})/i);
  const storeCeco = fullText.match(/\b(?:CeCo|Centro\s+de\s+costo|ID\s*tienda)\s*[:#-]?\s*(\d{5})\b/i)?.[1] || String(sourceName).match(/(?:^|[_\s-])(\d{5})(?:[_\s-]|$)/)?.[1] || '';
  const storeName = extractStoreName(lines);
  const parsed = [];
  for (const line of lines) {
    if (/N[º°]?\s*Material|Núm\.\s*pedido|Fecha de entrega/i.test(line)) continue;
    const match = line.match(ORDER_LINE);
    if (!match) continue;
    parsed.push({
      material: match[1].padStart(6, '0'),
      description: match[2].replace(/\s+/g, ' ').trim(),
      quantity: Number(match[3].replace(',', '.')),
      unit: match[4].toUpperCase(),
      sap: match[5],
    });
  }
  const orderDate = orderMatch ? toIso(orderMatch[2]) : '';
  const deliveryDate = deliveryMatch ? toIso(deliveryMatch[1]) : '';
  if (!orderMatch || !orderDate || !deliveryDate || !parsed.length) {
    throw new Error(`No pude reconocer ${sourceName}. Usa un PDF de pedido SAP con texto seleccionable.`);
  }
  return {id: orderMatch[1], purchaseOrder: orderMatch[1], provider, providerAlias, orderDate, deliveryDate, storeCeco, storeName, lines: parsed, sourceName};
}

export function validateTransitStore(order, expectedStore = {}) {
  const expectedCeco = compactCode(expectedStore.ceco), pdfCeco = compactCode(order.storeCeco), expectedName = String(expectedStore.name || '').trim(), pdfName = String(order.storeName || '').trim();
  const reasons=[];let cecoMatch=false,nameMatch=false;
  if (!expectedCeco&&!expectedName) reasons.push('Los Motores no informan una tienda para comparar.');
  if (!pdfCeco&&!pdfName) reasons.push('El PDF no informa CeCo ni un nombre de tienda reconocible.');
  if (pdfCeco&&expectedCeco) {cecoMatch=pdfCeco===expectedCeco;if(!cecoMatch)reasons.push(`El PDF indica CeCo ${pdfCeco}; los Motores muestran ${expectedCeco}.`);}
  if (pdfName&&expectedName) {nameMatch=similarStoreName(pdfName,expectedName);if(!nameMatch)reasons.push(`El PDF indica “${pdfName}”; los Motores muestran “${expectedName}”.`);}
  if(!cecoMatch&&!nameMatch&&!reasons.length)reasons.push('No hay un dato comparable entre el PDF y los Motores.');
  return {cecoMatch,nameMatch,status:reasons.length?'review':'verified',reasons};
}

export function validateTransitOrder(order, today, usedPurchaseOrders = new Set(), usedFingerprints = new Set(), expectedStore = null) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error('Define una fecha de captura válida antes de cargar tránsito.');
  const storeValidation=expectedStore?validateTransitStore(order, expectedStore):null;
  if (order.deliveryDate < today) throw new Error(`El pedido ${order.purchaseOrder} tiene entrega anterior a la fecha de captura.`);
  if (usedPurchaseOrders.has(order.purchaseOrder)) throw new Error(`El pedido ${order.purchaseOrder} ya fue cargado; el tránsito no se duplicó.`);
  if (order.fileFingerprint && usedFingerprints.has(order.fileFingerprint)) throw new Error(`${order.sourceName} ya fue cargado; se conservó una sola copia.`);
  if (!order.lines.every(line => compactCode(line.sap) && compactCode(line.material) && Number.isFinite(line.quantity) && line.quantity >= 0)) {
    throw new Error(`${order.sourceName} contiene líneas incompletas o cantidades inválidas.`);
  }
  return {store:storeValidation};
}

export async function parseOrderPdf(file) {
  if (!file || file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name || '')) throw new Error('Selecciona un archivo PDF de pedido.');
  if (file.size > 25 * 1024 * 1024) throw new Error('El PDF supera el límite seguro de 25 MB.');
  const buffer = await file.arrayBuffer();
  const fileFingerprint = await sha256(buffer);
  const pdfjs = await import('./vendor/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).toString();
  const document = await pdfjs.getDocument({data: buffer}).promise;
  const lines = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    lines.push(...pageLines(content.items));
  }
  return {...parseTransitLines(lines, file.name), fileFingerprint};
}
