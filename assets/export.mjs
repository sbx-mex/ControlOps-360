"use strict";

const encoder = new TextEncoder();
const MONEY = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const NUMBER = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

function xmlEscape(value) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
  const width = rows.reduce((maximum, row) => Math.max(maximum, row.length), 1);
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

export function createExecutiveWorkbook(report) {
 if (!report?.sheets?.length) throw new Error("Este menú no tiene datos exportables.");
 const sheets=[{name:"Resumen",rows:[[report.title,report.store],["Periodo",report.period],["Filtros",report.filters||"Todos"],...report.summary]},...report.sheets.map(s=>({name:s.name,rows:[s.headers,...s.rows]}))];
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


function wrap(value,width,size=9) {
 const limit=Math.max(5,Math.floor(width/(size*0.56))),words=String(value??"").split(/\s+/),lines=[];let line="";
 for(let word of words){
  while(word.length>limit){if(line){lines.push(line);line="";}lines.push(word.slice(0,limit));word=word.slice(limit);}
  if((line+" "+word).trim().length>limit){lines.push(line);line=word;}else line=(line+" "+word).trim();
 }if(line)lines.push(line);return lines.length?lines:[""];
}
export function createExecutivePdf(report) {
 if(!report?.sheets?.length)throw new Error("Este menú no tiene datos exportables.");
 const pages=[];let commands=[],y=0;
 const text=(x,y,size,value,bold=false)=>commands.push(`BT /F${bold?2:1} ${size} Tf 0.06 0.16 0.13 rg ${x} ${y} Td (${pdfEscape(value)}) Tj ET`);
 const newPage=()=>{if(commands.length)pages.push(commands.join("\n"));commands=[];y=550;text(32,579,18,report.title,true);text(32,560,9,report.store+" · "+report.period);text(32,542,8,report.filters||"");y=522;};
 newPage();
 for(const [key,value]of report.summary){for(const line of wrap(key+": "+(typeof value==="number"?NUMBER.format(value):value??"Sin dato"),720,10)){text(32,y,10,line);y-=16;}}
 y-=12;
 if(report.cards){
  for(let at=0;at<report.cards.length;at+=2){
   if(y-177<38)newPage();
   for(let c=0;c<2;c++){const card=report.cards[at+c];if(!card)continue;const x=32+c*374,top=y;
    commands.push(`0.82 0.88 0.82 RG 0.7 w ${x} ${top-164} 352 158 re S`);
    const nameLines=wrap(card.name,324,11);nameLines.slice(0,3).forEach((line,i)=>text(x+14,top-25-i*13,11,line,true));
    text(x+14,top-69,8,`SAP ${card.sap||'—'} · DIA ${card.dia||'—'}${card.adjusted?' · Ajustado':''}`);
    commands.push(`0.90 0.94 0.88 rg ${x+10} ${top-133} 332 53 re f`);
    text(x+34,top-94,8,'MIN',true);text(x+205,top-94,8,'MAX',true);
    text(x+34,top-119,22,card.minimum==null?'—':NUMBER.format(card.minimum),true);text(x+205,top-119,22,card.maximum==null?'—':NUMBER.format(card.maximum),true);
    wrap(card.unit,324,8).slice(0,2).forEach((line,i)=>text(x+14,top-147-i*10,8,line));
   }y-=177;
  }
 }
 for(const sheet of report.cards?[]:report.sheets){
  const count=sheet.headers.length,width=728/count,size=count>8?7.5:9;
  const header=()=>{if(y<100)newPage();text(32,y,12,sheet.name,true);y-=24;const lines=sheet.headers.map(h=>wrap(h,width-12,size)),height=Math.max(...lines.map(a=>a.length))*12+12;commands.push(`0.89 0.94 0.91 rg 32 ${y-height+12} 728 ${height} re f`);lines.forEach((a,c)=>a.forEach((v,i)=>text(38+c*width,y-i*12,size,v,true)));y-=height;};
  header();
  for(const row of sheet.rows){const cells=sheet.headers.map((_,i)=>wrap(typeof row[i]==="number"?NUMBER.format(row[i]):row[i]??"—",width-12,size));const height=Math.max(...cells.map(a=>a.length))*12+10;
   if(y-height<38){newPage();header();}
   cells.forEach((a,c)=>a.forEach((v,i)=>text(38+c*width,y-i*12,size,v)));
   y-=height;commands.push(`0.87 0.90 0.88 RG 0.3 w 32 ${y+6} m 760 ${y+6} l S`);
  }
  if(!sheet.rows.length){text(38,y,9,"Sin resultados en este filtro.");y-=22;}
  y-=20;
 }
 if(commands.length)pages.push(commands.join("\n"));
 const objects=["<< /Type /Catalog /Pages 2 0 R >>","", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"];
 const kids=[];
 pages.forEach((stream,i)=>{const pageId=objects.length+1,contentId=pageId+1;kids.push(pageId+" 0 R");
  const footer=`\nBT /F1 8 Tf 0.3 0.4 0.3 rg 680 20 Td (${i+1} / ${pages.length}) Tj ET`;
  stream+=footer;objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);objects.push(`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`);
 });
 objects[1]=`<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`;
 let pdf="%PDF-1.4\n",offsets=[0];objects.forEach((obj,i)=>{offsets.push(encoder.encode(pdf).length);pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;});
 const xref=encoder.encode(pdf).length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
 offsets.slice(1).forEach(offset=>{pdf+=String(offset).padStart(10,"0")+" 00000 n \n";});pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return encoder.encode(pdf);
}
export function downloadBytes(bytes,name,mime){const url=URL.createObjectURL(new Blob([bytes],{type:mime})),a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
