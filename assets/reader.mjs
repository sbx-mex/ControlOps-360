import {addAuditRows,addReferenceRows,addRows,addUsageRows,classifyStructure,createDataset,isAcSource,normalize,FACT_TYPES,CATALOG_FIELDS} from "./engine.mjs";
const MAX_FILE_BYTES=100*1024*1024,MAX_ENTRY_BYTES=220*1024*1024,MAX_TOTAL_UNCOMPRESSED=700*1024*1024;
function findEndOfCentralDirectory(view) {
  const minimum = Math.max(0, view.byteLength - 65557);
  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error("El archivo no tiene una estructura ZIP válida.");
}

export class ZipWorkbook {
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
      const flags = this.view.getUint16(offset + 8, true);
      const expectedCrc = this.view.getUint32(offset + 16, true);
      const compressedSize = this.view.getUint32(offset + 20, true);
      const uncompressedSize = this.view.getUint32(offset + 24, true);
      const nameLength = this.view.getUint16(offset + 28, true);
      const extraLength = this.view.getUint16(offset + 30, true);
      const commentLength = this.view.getUint16(offset + 32, true);
      const localOffset = this.view.getUint32(offset + 42, true);
      const name = this.decoder.decode(new Uint8Array(this.buffer, offset + 46, nameLength));
      if (flags & 1) throw new Error("El libro está cifrado. Guarda una copia sin contraseña.");
      if (this.entries.has(name) || name.startsWith("/") || name.split("/").includes("..")) throw new Error("Ruta ZIP duplicada o no permitida.");
      if (uncompressedSize > MAX_ENTRY_BYTES) throw new Error("Una sección del libro excede el límite seguro.");
      uncompressedTotal += uncompressedSize;
      if (uncompressedTotal > MAX_TOTAL_UNCOMPRESSED) throw new Error("El libro excede el límite seguro de descompresión.");
      this.entries.set(name, { method, compressedSize, localOffset, uncompressedSize, expectedCrc });
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
    let output=compressed;
    if (entry.method !== 0) {
      if (entry.method !== 8) throw new Error(`Compresión ZIP no compatible: ${entry.method}.`);
      if (typeof DecompressionStream === "undefined") throw new Error("Actualiza Chrome o Edge para leer este archivo.");
      const reader = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
      const chunks=[]; let size=0;
      while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;
        if(size>entry.uncompressedSize||size>MAX_ENTRY_BYTES){await reader.cancel();throw new Error("Descompresión fuera del límite seguro.");}chunks.push(chunk.value);
      }
      output=new Uint8Array(size);let at=0;for(const chunk of chunks){output.set(chunk,at);at+=chunk.length;}
    }
    if(output.length!==entry.uncompressedSize||crc32(output)!==entry.expectedCrc)throw new Error("El libro está incompleto o dañado (CRC).");
    return output;
  }

  async text(name) { return this.decoder.decode(await this.bytes(name)); }
}

let crcTable;
function crc32(bytes){if(!crcTable){crcTable=new Uint32Array(256);for(let i=0;i<256;i++){let c=i;for(let bit=0;bit<8;bit++)c=c&1?0xedb88320^(c>>>1):c>>>1;crcTable[i]=c;}}let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}

function parseXml(text, label) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("XML con entidades no permitido.");
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
  if (["1","true"].includes(workbook.getElementsByTagName("workbookPr")[0]?.getAttribute("date1904"))) throw new Error("Guarda el libro con calendario Excel 1900.");
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
  if (["idtienda", "ceco", "cc"].some((item) => available.has(item)) && available.has("compostable") && !types.includes("storePolicy")) types.push("storePolicy");
  return types;
}

async function looseCatalogCandidate(zip,sheet,strings){
  if(normalize(sheet.name)!=="catalogomicros")return null;
  const xml=parseXml(await zip.text(sheet.path),sheet.path),first=[...xml.getElementsByTagName("row")].find(row=>Number(row.getAttribute("r")||0)===1);
  if(!first)return null;const cells=[...first.getElementsByTagName("c")],width=Math.max(0,...cells.map(cell=>columnIndex(cell.getAttribute("r"))+1)),headers=Array(width).fill("");
  for(const cell of cells)headers[columnIndex(cell.getAttribute("r"))]=cellText(cell,strings);
  const roles=structuralTypes(headers).filter(type=>Object.hasOwn(CATALOG_FIELDS,type));if(!roles.includes("microsList"))return null;
  const ref=xml.getElementsByTagName("dimension")[0]?.getAttribute("ref")||`A1:${String.fromCharCode(64+Math.min(width,26))}${xml.getElementsByTagName("row").length}`;
  return {sheetName:sheet.name,sheetPath:sheet.path,sourceName:sheet.name,ref,headers,roles:["microsList"]};
}

async function tableCandidates(zip, sheets, strings) {
  const bySheet = await Promise.all(sheets.map(async (sheet) => {
    const candidates = [];
    const relPath = relationPath(sheet.path);
    const rels = zip.has(relPath)?relationships(parseXml(await zip.text(relPath), relPath)):new Map();
    const tables = await Promise.all([...rels.values()].map(async (target) => {
      const tablePath = resolvePath(sheet.path, target);
      if (!/^xl\/tables\/[^/]+\.xml$/i.test(tablePath) || !zip.has(tablePath)) return null;
      const xml = parseXml(await zip.text(tablePath), tablePath);
      const root = xml.documentElement;
      const headers = [...xml.getElementsByTagName("tableColumn")].map((node) => node.getAttribute("name") || "");
      const types = structuralTypes(headers);
      const roles = types.filter((type) => {
        if (type==="auditLegacy") return normalize(sheet.name)==="basevoid";
        if (["sales", "usage", "auditTicket", "auditVoid", "auditPayment"].includes(type)) return isAcSource(sheet.name);
        return Object.hasOwn(CATALOG_FIELDS, type);
      });
      return roles.length ? {
        sheetName: sheet.name,
        sheetPath: sheet.path,
        sourceName: root.getAttribute("displayName") || root.getAttribute("name") || sheet.name,
        ref: root.getAttribute("ref") || "A1:A1",
        headers,
        roles,
      } : null;
    }));
    candidates.push(...tables.filter(Boolean));const loose=await looseCatalogCandidate(zip,sheet,strings);if(loose&&!candidates.some(candidate=>candidate.roles.includes("microsList")))candidates.push(loose);
    return candidates;
  }));
  return bySheet.flat();
}

async function sharedStrings(zip) {
  if (!zip.has("xl/sharedStrings.xml")) return [];
  const xml = parseXml(await zip.text("xl/sharedStrings.xml"), "sharedStrings.xml");
  return [...xml.getElementsByTagName("si")].map((item) => [...item.getElementsByTagName("t")].map((node) => node.textContent || "").join(""));
}

async function rowsFromTable(zip, candidate, strings, onBatch, progress) {
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
      progress("Leyendo " + candidate.sheetName + "…");
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  if (batch.length) onBatch(batch);
  return processed;
}


export async function inspectWorkbook(file, progress=()=>{}) {
 const macro=/\.xlsm$/i.test(file.name),parameter=/\.xlsx$/i.test(file.name);
 if(!macro&&!parameter)throw new Error("Usa XLSM o un parámetro XLSX.");
 if(file.size>MAX_FILE_BYTES)throw new Error("El archivo supera 100 MB.");
 const buffer=await file.arrayBuffer(),fingerprintPromise=sha256(buffer),zip=new ZipWorkbook(buffer);
 if(!zip.has("xl/workbook.xml")||!zip.has("xl/_rels/workbook.xml.rels")||(macro&&!zip.has("xl/vbaProject.bin")))throw new Error("El libro no es válido.");
 const [sheets,strings,fingerprint]=await Promise.all([workbookSheets(zip),sharedStrings(zip),fingerprintPromise]);
 const candidates=await tableCandidates(zip,sheets,strings);
 const allowed=macro?[...FACT_TYPES,...Object.keys(CATALOG_FIELDS)]:["woe","sapList","microsList","baking","storePolicy","compostable","food","drink","cream"];
 if(!candidates.some(c=>c.roles.some(r=>macro?FACT_TYPES.includes(r):allowed.includes(r))))throw new Error(parameter ? "El XLSX no es un parámetro compatible." : "No contiene tablas operativas compatibles.");
 const local=createDataset(),sources=[];
 for(const candidate of candidates){
  const roles=candidate.roles.filter(r=>allowed.includes(r));
  if(!roles.length)continue;
  progress("Leyendo "+candidate.sheetName+"…");
  const source={fileName:file.name,source:file.name+" · "+candidate.sourceName,sha256:fingerprint};
  const rows=await rowsFromTable(zip,candidate,strings,batch=>{
   for(const role of roles){
    if(role==="sales")addRows(local,candidate.headers,batch,source);
    else if(role==="usage")addUsageRows(local,candidate.headers,batch,source);
    else if(FACT_TYPES.includes(role))addAuditRows(local,role,candidate.headers,batch,source);
    else addReferenceRows(local,role,candidate.headers,batch,source);
   }
  },progress);
  sources.push({sheet:candidate.sheetName,roles,rows});
 }
 if(macro&&!local.sourceRows)throw new Error("No hay datos _ac actualizados en este motor.");
 return {dataset:local,name:file.name,fingerprint,sources,lastModified:Number(file.lastModified)||0};
}
