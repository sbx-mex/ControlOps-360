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

function worksheetXml(rows, options={}) {
  const width = rows.reduce((maximum, row) => Math.max(maximum, row.length), 1);
  const formats=options.formats||[],tableHeaderRow=options.tableHeaderRow||1,operational=!!options.operational;
  const styleFor=operational?{twoDecimal:8,oneDecimal:9,integer:10}:{twoDecimal:2,oneDecimal:3,integer:4};
  const sheetRows = rows.map((row, rowIndex) => {
    const rowNumber=rowIndex+1;
    const cells = row.map((value, columnIndex) => {
      const ref = cellReference(columnIndex, rowNumber);
      let style="";
      if(rowNumber===tableHeaderRow)style=' s="1"';
      else if(operational&&rowNumber===1)style=` s="${columnIndex%2===0?5:6}"`;
      else if(rowNumber>tableHeaderRow)style=` s="${typeof value === "number" ? styleFor[formats[columnIndex]]||8 : 7}"`;
      else if(typeof value === "number")style=` s="${styleFor[formats[columnIndex]]||2}"`;
      if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"${style}><v>${value}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
    }).join("");
    const height=rowNumber===1&&operational?' ht="25" customHeight="1"':rowNumber===tableHeaderRow?' ht="28" customHeight="1"':rowNumber<tableHeaderRow?' ht="7" customHeight="1"':'';
    return `<row r="${rowNumber}"${height}>${cells}</row>`;
  }).join("");
  const dataRows=rows.slice(Math.max(0,tableHeaderRow-1)),widths=Array.from({length:width},(_,index)=>options.widths?.[index]||Math.min(38,Math.max(10,...dataRows.map(row=>String(row[index]??'').length+2))));
  const topLeft=`A${tableHeaderRow+1}`,lastCell=cellReference(width-1,rows.length),autoFilter=rows.length>tableHeaderRow?`<autoFilter ref="A${tableHeaderRow}:${lastCell}"/>`:"";
  const printSettings=operational?'<printOptions horizontalCentered="1"/><pageMargins left="0.25" right="0.25" top="0.35" bottom="0.35" header="0.15" footer="0.15"/><pageSetup orientation="landscape" paperSize="1" fitToWidth="1" fitToHeight="0"/>':'';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr>${operational?'<pageSetUpPr fitToPage="1"/>':''}</sheetPr><sheetViews><sheetView workbookViewId="0"><pane ySplit="${tableHeaderRow}" topLeftCell="${topLeft}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((columnWidth,index) => `<col min="${index + 1}" max="${index + 1}" width="${columnWidth}" customWidth="1"/>`).join("")}</cols><sheetData>${sheetRows}</sheetData>${autoFilter}${printSettings}</worksheet>`;
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

function printDate(report){
 const source=report?.generatedAt?new Date(`${report.generatedAt}T12:00:00`):new Date();
 return Number.isNaN(source.getTime())?'—':new Intl.DateTimeFormat('es-MX',{day:'2-digit',month:'2-digit',year:'numeric'}).format(source);
}
function operationalFields(report){
 const fields=[['TIENDA',report.store||'—'],['PERIODO INI - FIN',report.period||'—']];
 fields.push(['ACTUALIZACIÓN / IMPRESIÓN',printDate(report)]);
 if(report.orders!=null)fields.push(['# PEDIDOS',report.orders]);
 return fields;
}

export function createExecutiveWorkbook(report) {
 if (!report?.sheets?.length) throw new Error("Este menú no tiene datos exportables.");
 const metadata=report.operationalHeader?[operationalFields(report).flat(),[]]:[];
 const detailSheets=report.sheets.map(s=>({...s,rows:[...metadata,s.headers,...s.rows],tableHeaderRow:metadata.length+1,operational:!!report.operationalHeader,repeatHeaderRows:metadata.length+1}));
 const sheets=report.hideSummary?detailSheets:[{name:"Resumen",rows:[[report.title,report.store],["Periodo",report.period],["Filtros",report.filters||"Todos"],...report.summary],tableHeaderRow:1},...detailSheets];
  const used = new Set();
  sheets.forEach((sheet) => { sheet.name = safeSheetName(sheet.name, used); });
  const definedNames=sheets.map((sheet,index)=>sheet.repeatHeaderRows?`<definedName name="_xlnm.Print_Titles" localSheetId="${index}">'${xmlEscape(sheet.name.replaceAll("'","''"))}'!$1:$${sheet.repeatHeaderRows}</definedName>`:'').join('');
  const entries = [];
  entries.push(["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`]);
  entries.push(["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`]);
  entries.push(["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets>${definedNames?`<definedNames>${definedNames}</definedNames>`:''}</workbook>`]);
  entries.push(["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`]);
  entries.push(["xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.0"/></numFmts><fonts count="4"><font><sz val="10"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Aptos Display"/></font><font><b/><color rgb="FF006241"/><sz val="9"/><name val="Aptos"/></font><font><b/><color rgb="FF173B30"/><sz val="9"/><name val="Aptos"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF006241"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF0F5F1"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FFD5E1DA"/></left><right style="thin"><color rgb="FFD5E1DA"/></right><top style="thin"><color rgb="FFD5E1DA"/></top><bottom style="thin"><color rgb="FFD5E1DA"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="11"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1"><alignment wrapText="1" vertical="center"/></xf><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`]);
  sheets.forEach((sheet, index) => entries.push([`xl/worksheets/sheet${index + 1}.xml`, worksheetXml(sheet.rows,sheet)]));
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
function clipped(value,width,size=9){
 const source=String(value??''),limit=Math.max(3,Math.floor(width/(size*.54)));
 return source.length<=limit?source:source.slice(0,Math.max(1,limit-1)).trimEnd()+'…';
}
function pdfFromPages(pages){
 const objects=["<< /Type /Catalog /Pages 2 0 R >>","", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"],kids=[];
 pages.forEach((source,i)=>{let stream=source+`\nBT /F1 7 Tf 0.3 0.4 0.3 rg 365 14 Td (Hoja ${i+1} de ${pages.length}) Tj ET`;const pageId=objects.length+1,contentId=pageId+1;kids.push(pageId+" 0 R");objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);objects.push(`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`);});
 objects[1]=`<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`;
 let pdf="%PDF-1.4\n",offsets=[0];objects.forEach((obj,i)=>{offsets.push(encoder.encode(pdf).length);pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;});
 const xref=encoder.encode(pdf).length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;offsets.slice(1).forEach(offset=>{pdf+=String(offset).padStart(10,"0")+" 00000 n \n";});pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return encoder.encode(pdf);
}
function drawOperationalHeader(commands,text,report){
 const fields=operationalFields(report),x=18,bottom=574,width=756,height=24,ratios=fields.length===4?[.38,.22,.25,.15]:[.45,.30,.25];
 commands.push(`0 0.38 0.25 RG 0.75 w ${x} ${bottom} ${width} ${height} re S`);
 let cursor=x;
 fields.forEach(([label,value],index)=>{const sectionWidth=width*ratios[index];if(index)commands.push(`0 0.38 0.25 RG 0.5 w ${cursor} ${bottom} m ${cursor} ${bottom+height} l S`);text(cursor+6,bottom+15.5,5.2,label,true,'left','green');text(cursor+6,bottom+5.5,7.1,clipped(value,sectionWidth-12,7.1),true);cursor+=sectionWidth;});
}
function createLabelPdf(report){
 if(!report.cards?.length)throw new Error("Elige al menos un producto para imprimir.");
 const columns=3,rows=4,perPage=12,pages=[],margin=18,gapX=6,gapY=5,gridTop=566,gridBottom=27,cardW=(792-margin*2-gapX*(columns-1))/columns,cardH=(gridTop-gridBottom-gapY*(rows-1))/rows;
 for(let start=0;start<report.cards.length;start+=perPage){const commands=[],pageCards=report.cards.slice(start,start+perPage),text=(x,y,size,value,bold=false,align='left',tone='dark')=>{const at=align==='center'?x-String(value??'').length*size*.27:x,color=tone==='green'?'0 0.38 0.25':'0.06 0.12 0.10';commands.push(`BT /F${bold?2:1} ${size} Tf ${color} rg ${at} ${y} Td (${pdfEscape(value)}) Tj ET`);};
  drawOperationalHeader(commands,text,report);
  pageCards.forEach((card,index)=>{const row=Math.floor(index/columns),col=index%columns,x=margin+col*(cardW+gapX),top=gridTop-row*(cardH+gapY),bottom=top-cardH,topHeight=53,footerHeight=18,bodyTop=top-topHeight,bodyBottom=bottom+footerHeight;
   commands.push(`0.08 0.12 0.10 RG 0.85 w ${x} ${bottom} ${cardW} ${cardH} re S`);
   wrap(card.sapName||card.name,cardW-16,8.1).slice(0,2).forEach((line,lineIndex)=>text(x+8,top-15-lineIndex*10,8.1,line,true));
   const identity=`${card.microsName||'—'} | #DIA ${card.dia||'—'} | #SAP ${card.sap||'—'}${card.adjusted?' | AJUSTADO':''}`;
   text(x+cardW/2,top-46,5.3,clipped(identity,cardW-16,5.3),false,'center');
   commands.push(`0.08 0.12 0.10 RG 0.65 w ${x} ${bodyTop} m ${x+cardW} ${bodyTop} l S ${x+cardW/2} ${bodyTop} m ${x+cardW/2} ${bodyBottom} l S ${x} ${bodyBottom} m ${x+cardW} ${bodyBottom} l S`);
   text(x+cardW*.25,bodyTop-17,7,'MIN',true,'center');text(x+cardW*.75,bodyTop-17,7,'MAX',true,'center');
   text(x+cardW*.25,bodyBottom+14,17,card.minimum==null?'—':NUMBER.format(card.minimum),true,'center');text(x+cardW*.75,bodyBottom+14,17,card.maximum==null?'—':NUMBER.format(card.maximum),true,'center');
   const third=cardW/3,mode=card.mode==='pack'?'PICK PACK':card.mode==='sleeve'?'MANGA':'UNIDAD',pieces=card.piecesPerCase?`${NUMBER.format(card.piecesPerCase)} PZ / CAJA`:'PZ / CAJA —';
   commands.push(`0.75 0.82 0.78 RG 0.35 w ${x+third} ${bottom} m ${x+third} ${bodyBottom} l S ${x+third*2} ${bottom} m ${x+third*2} ${bodyBottom} l S`);
   text(x+third*.5,bottom+6,5.8,mode,true,'center','green');text(x+third*1.5,bottom+6,5.8,clipped(pieces,third-8,5.8),false,'center');text(x+third*2.5,bottom+6,5.8,`${card.orders??'—'} PEDIDOS`,true,'center');
  });pages.push(commands.join('\n'));
 }
 return pdfFromPages(pages);
}
function createMaxMinListPdf(report){
 if(!report.listCards?.length)throw new Error("Elige al menos un producto para imprimir.");
 const pages=[],perPage=15,widths=[168,145,60,60,45,45,75,70,68],labels=['DESCRIPCIÓN SAP','NOMBRE MICROS','#DIA','#SAP','MIN','MAX','UNIDAD / PICK PACK','PZ / CAJA','# PEDIDO'];
 for(let start=0;start<report.listCards.length;start+=perPage){const commands=[],text=(x,y,size,value,bold=false,align='left',tone='dark')=>{const at=align==='center'?x-String(value??'').length*size*.27:x,color=tone==='white'?'1 1 1':tone==='green'?'0 0.38 0.25':'0.06 0.12 0.10';commands.push(`BT /F${bold?2:1} ${size} Tf ${color} rg ${at} ${y} Td (${pdfEscape(value)}) Tj ET`);};
  drawOperationalHeader(commands,text,report);text(28,551,11,'MAX & MIN · LISTA OPERATIVA',true);
  commands.push('0 0.38 0.25 rg 28 522 736 23 re f');let headerX=28;labels.forEach((label,index)=>{text(headerX+4,530,index>5?5.2:5.8,label,true,'left','white');headerX+=widths[index];});
  report.listCards.slice(start,start+perPage).forEach((card,index)=>{const y=507-index*31,format=card.mode==='pack'?'Pick Pack':card.mode==='sleeve'?'Manga':'Unidad',values=[card.sapName||card.name,card.microsName||'—',card.dia||'—',card.sap||'—',card.minimum==null?'—':NUMBER.format(card.minimum),card.maximum==null?'—':NUMBER.format(card.maximum),format,card.piecesPerCase?NUMBER.format(card.piecesPerCase):'—',card.orders??'—'];let cellX=28;
   if(index%2)commands.push(`0.97 0.98 0.97 rg 28 ${y-12} 736 30 re f`);
   values.forEach((value,columnIndex)=>{const cellWidth=widths[columnIndex],center=columnIndex>=2;text(center?cellX+cellWidth/2:cellX+4,y,6.1,clipped(value,cellWidth-8,6.1),columnIndex===0||columnIndex>=4,center?'center':'left');if(columnIndex)commands.push(`0.88 0.91 0.89 RG 0.25 w ${cellX} ${y-12} m ${cellX} ${y+18} l S`);cellX+=cellWidth;});commands.push(`0.86 0.90 0.87 RG 0.3 w 28 ${y-12} m 764 ${y-12} l S`);});
  pages.push(commands.join('\n'));
 }
 return pdfFromPages(pages);
}
function createPeakPdf(report){
 const pages=[],number=value=>value==null?'-':NUMBER.format(value),delta=value=>{if(!value)return 'Sin base';const percent=value.percent==null?'':` (${value.percent>0?'+':''}${NUMBER.format(value.percent*100)}%)`;return `${value.value>0?'+':''}${NUMBER.format(value.value)}${percent}`;};
 const pageOne=[],text=(x,y,size,value,bold=false,align='left',tone='dark')=>{const source=String(value??''),at=align==='center'?x-source.length*size*.27:align==='right'?x-source.length*size*.54:x,color=tone==='white'?'1 1 1':tone==='muted'?'0.32 0.42 0.37':tone==='gold'?'0.63 0.48 0.20':tone==='green'?'0 0.38 0.25':'0.06 0.12 0.10';pageOne.push(`BT /F${bold?2:1} ${size} Tf ${color} rg ${at} ${y} Td (${pdfEscape(source)}) Tj ET`);};
 drawOperationalHeader(pageOne,text,report);text(28,548,16,'PEAK HOUR',true);text(28,532,7.2,[report.period,report.filters].filter(Boolean).join(' · '),false,'left','muted');
 const cards=[['PEAK AM',report.peak?.am?.label||'Sin demanda',`${number(report.peak?.am?.average)} órdenes / día`],['PEAK PM',report.peak?.pm?.label||'Sin demanda',`${number(report.peak?.pm?.average)} órdenes / día`],['ÓRDENES ANALIZADAS',number(report.peak?.orders),`${number(report.peak?.days)} días observados`]];
 cards.forEach((card,index)=>{const x=28+index*246,w=230,bottom=449;pageOne.push(`${index===2?'0.02 0.31 0.22':'0.97 0.94 0.87'} rg ${x} ${bottom} ${w} 68 re f ${index===2?'0.02 0.31 0.22':'0.84 0.77 0.63'} RG 0.6 w ${x} ${bottom} ${w} 68 re S`);text(x+13,bottom+49,6.2,card[0],true,'left',index===2?'gold':'gold');text(x+13,bottom+25,index===2?19:15,clipped(card[1],w-26,index===2?19:15),true,'left',index===2?'white':'dark');text(x+13,bottom+10,6.8,card[2],false,'left',index===2?'white':'muted');});
 text(28,425,10.5,'ÚLTIMO DÍA VS ANTERIOR COMPARABLE',true);text(764,425,6.5,'Cuatro medias horas consecutivas',false,'right','muted');
 const widths=[190,140,133,140,133],headers=['COMPARABLE','PEAK AM · ACTUAL / ANTERIOR','CAMBIO AM','PEAK PM · ACTUAL / ANTERIOR','CAMBIO PM'];let headerX=28;
 pageOne.push('0.02 0.31 0.22 rg 28 390 736 22 re f');headers.forEach((header,index)=>{text(headerX+5,398,index===0?6.2:5.5,header,true,'left','white');headerX+=widths[index];});
 const comparisons=(report.comparisons||[]).slice(0,7);
 if(!comparisons.length)text(34,370,7.5,'Aún no hay dos fechas del mismo día para comparar.',false,'left','muted');
 comparisons.forEach((item,index)=>{const top=387-index*25,bottom=top-23;if(index%2)pageOne.push(`0.97 0.96 0.93 rg 28 ${bottom} 736 23 re f`);const values=[`${item.day} ${shortPdfDate(item.current.date)} vs ${shortPdfDate(item.previous.date)}`,`${number(item.current.am?.total)} · ${item.current.am?.label||'Sin demanda'} / ${number(item.previous.am?.total)}`,delta(item.amDelta),`${number(item.current.pm?.total)} · ${item.current.pm?.label||'Sin demanda'} / ${number(item.previous.pm?.total)}`,delta(item.pmDelta)];let x=28;values.forEach((value,column)=>{text(x+5,top-14,column===0?6.4:5.8,clipped(value,widths[column]-10,column===0?6.4:5.8),column===0||column===2||column===4);x+=widths[column];});pageOne.push(`0.87 0.86 0.81 RG 0.3 w 28 ${bottom} m 764 ${bottom} l S`);});
 const assistantTop=Math.max(198,355-comparisons.length*25);text(28,assistantTop,10.5,'ASISTENTE PH · FRECUENCIA DE CICLO',true);text(28,assistantTop-14,6.4,'La recomendación usa la media hora de mayor carga dentro del Peak.',false,'left','muted');
 [['AM',report.peak?.am],['PM',report.peak?.pm]].forEach(([label,peak],index)=>{const x=28+index*370,bottom=assistantTop-82,w=354;pageOne.push(`0.95 0.96 0.92 rg ${x} ${bottom} ${w} 56 re f 0.82 0.85 0.78 RG 0.5 w ${x} ${bottom} ${w} 56 re S`);text(x+12,bottom+39,6.2,`PEAK ${label} · ${peak?.label||'Sin demanda'}`,true,'left','green');text(x+12,bottom+18,15,peak?.cycleMinutes?`Cada ${peak.cycleMinutes} min`:'Sin dato suficiente',true);text(x+180,bottom+20,6.4,peak?`${number(peak.halfHourMax)} órdenes máx. / 30 min · ${peak.cycles} ciclos en 2 h`:'Sin demanda',false,'left','muted');});
 const ruleY=assistantTop-96;text(28,ruleY,6.2,'REGLA CS',true,'left','gold');text(82,ruleY,6.2,'0-10: 30 min    11-25: 20 min    26-35: 12 min    36+: 8 min',false,'left','muted');
 const threeBottom=assistantTop-145;pageOne.push(`0.02 0.31 0.22 rg 28 ${threeBottom} 736 40 re f`);text(43,threeBottom+24,6.2,'PREPARACIÓN 3S',true,'left','gold');[['STAFFING','Cobertura al cliente'],['STOCKING','Barra lista'],['STANDARDS','Producto, servicio y limpieza']].forEach((item,index)=>{const x=180+index*190;text(x,threeBottom+24,7,item[0],true,'left','white');text(x,threeBottom+11,5.8,item[1],false,'left','white');});pages.push(pageOne.join('\n'));

 if(report.activeSlots?.length){const commands=[],pageText=(x,y,size,value,bold=false,align='left',tone='dark')=>{const source=String(value??''),at=align==='center'?x-source.length*size*.27:align==='right'?x-source.length*size*.54:x,color=tone==='white'?'1 1 1':tone==='muted'?'0.32 0.42 0.37':tone==='green'?'0 0.38 0.25':'0.06 0.12 0.10';commands.push(`BT /F${bold?2:1} ${size} Tf ${color} rg ${at} ${y} Td (${pdfEscape(source)}) Tj ET`);};drawOperationalHeader(commands,pageText,report);pageText(28,548,14,'FOCO POR MEDIA HORA',true);pageText(28,532,6.8,'Promedio por día comparable. Sólo se muestran franjas con actividad.',false,'left','muted');const rows=report.activeSlots,max=Math.max(1,...rows.flatMap(row=>[row.average,...row.weekday].filter(value=>Number.isFinite(value)))),headerBottom=501,rowHeight=Math.min(15,455/rows.length),widths=[92,...Array(8).fill(80.5)],headers=['FRANJA','LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM','PROM.'];commands.push(`0.02 0.31 0.22 rg 28 ${headerBottom} 736 22 re f`);let x=28;headers.forEach((header,index)=>{pageText(x+widths[index]/2,headerBottom+8,6.2,header,true,'center','white');x+=widths[index];});rows.forEach((row,index)=>{const bottom=headerBottom-(index+1)*rowHeight,focused=[report.peak?.am,report.peak?.pm].some(peak=>peak&&row.slot>=peak.slot&&row.slot<peak.slot+4),values=[row.label,...row.weekday,row.average];if(focused)commands.push(`0.97 0.94 0.87 rg 28 ${bottom} 736 ${rowHeight} re f`);let cellX=28;values.forEach((value,column)=>{if(column&&Number.isFinite(value)&&value>0){const strength=value/max,red=.93-strength*.67,green=.96-strength*.51,blue=.91-strength*.64;commands.push(`${red.toFixed(2)} ${green.toFixed(2)} ${blue.toFixed(2)} rg ${cellX+2} ${bottom+1} ${widths[column]-4} ${Math.max(1,rowHeight-2)} re f`);}const visible=Number(value)===0||value==null?'':column?number(value):value;pageText(column?cellX+widths[column]/2:cellX+6,bottom+rowHeight*.34,Math.min(6.4,rowHeight*.48),visible,column===0||column===8,column?'center':'left',Number.isFinite(value)&&value/max>.55?'white':'dark');cellX+=widths[column];});commands.push(`0.88 0.89 0.85 RG 0.2 w 28 ${bottom} m 764 ${bottom} l S`);});pages.push(commands.join('\n'));}
 return pdfFromPages(pages);
}
function shortPdfDate(value){return value?`${value.slice(8,10)}/${value.slice(5,7)}`:'-';}
export function createExecutivePdf(report) {
 if(!report?.sheets?.length)throw new Error("Este menú no tiene datos exportables.");
 if(report.layout==='labels')return createLabelPdf(report);
 if(report.layout==='maxmin-list')return createMaxMinListPdf(report);
 if(report.layout==='peak-hour')return createPeakPdf(report);
 const pages=[];let commands=[],y=0;
 const text=(x,y,size,value,bold=false)=>commands.push(`BT /F${bold?2:1} ${size} Tf 0.06 0.16 0.13 rg ${x} ${y} Td (${pdfEscape(value)}) Tj ET`);
 const newPage=()=>{if(commands.length)pages.push(commands.join("\n"));commands=[];if(report.operationalHeader){const headerText=(x,at,size,value,bold=false,align='left',tone='dark')=>{const px=align==='center'?x-String(value??'').length*size*.27:x,color=tone==='green'?'0 0.38 0.25':'0.06 0.12 0.10';commands.push(`BT /F${bold?2:1} ${size} Tf ${color} rg ${px} ${at} Td (${pdfEscape(value)}) Tj ET`);};drawOperationalHeader(commands,headerText,report);text(28,550,13,report.title,true);if(report.filters)text(28,536,7,report.filters);y=516;}else{text(32,579,18,report.title,true);text(32,560,9,report.store+" · "+report.period);text(32,542,8,report.filters||"");y=522;}};
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
  if(report.operationalHeader&&y<240)newPage();
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
 return pdfFromPages(pages);
}
export function downloadBytes(bytes,name,mime){const url=URL.createObjectURL(new Blob([bytes],{type:mime})),a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
