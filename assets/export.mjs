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
  const printSettings=operational?'<printOptions horizontalCentered="1"/><pageMargins left="0.25" right="0.25" top="0.35" bottom="0.45" header="0.15" footer="0.2"/><pageSetup orientation="landscape" paperSize="1" fitToWidth="1" fitToHeight="0"/>':'';
  const footer='<headerFooter><oddFooter>&amp;LCONFIDENCIAL · USO OPERATIVO INTERNO&amp;RDiseñador por Jorge Alcantar Aguiar &amp;&amp; Enrique César Flores</oddFooter></headerFooter>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr>${operational?'<pageSetUpPr fitToPage="1"/>':''}</sheetPr><sheetViews><sheetView workbookViewId="0"><pane ySplit="${tableHeaderRow}" topLeftCell="${topLeft}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((columnWidth,index) => `<col min="${index + 1}" max="${index + 1}" width="${columnWidth}" customWidth="1"/>`).join("")}</cols><sheetData>${sheetRows}</sheetData>${autoFilter}${printSettings}${footer}</worksheet>`;
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
function roundedRectPath(x,y,width,height,radius=8){
 const r=Math.min(radius,width/2,height/2),k=r*.55228475;
 return `${x+r} ${y} m ${x+width-r} ${y} l ${x+width-r+k} ${y} ${x+width} ${y+r-k} ${x+width} ${y+r} c ${x+width} ${y+height-r} l ${x+width} ${y+height-r+k} ${x+width-r+k} ${y+height} ${x+width-r} ${y+height} c ${x+r} ${y+height} l ${x+r-k} ${y+height} ${x} ${y+height-r+k} ${x} ${y+height-r} c ${x} ${y+r} l ${x} ${y+r-k} ${x+r-k} ${y} ${x+r} ${y} h`;
}
function pdfFromPages(pages){
 const objects=["<< /Type /Catalog /Pages 2 0 R >>","", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"],kids=[];
 pages.forEach((source,i)=>{let stream=source+`\nBT /F2 5.3 Tf 0.25 0.38 0.31 rg 18 14 Td (${pdfEscape('CONFIDENCIAL · USO OPERATIVO INTERNO')}) Tj ET\nBT /F1 6 Tf 0.3 0.4 0.3 rg 365 14 Td (Hoja ${i+1} de ${pages.length}) Tj ET\nBT /F1 5.1 Tf 0.3 0.4 0.3 rg 500 14 Td (${pdfEscape('Diseñador por Jorge Alcantar Aguiar & Enrique César Flores')}) Tj ET`;const pageId=objects.length+1,contentId=pageId+1;kids.push(pageId+" 0 R");objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);objects.push(`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`);});
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
  pageCards.forEach((card,index)=>{const row=Math.floor(index/columns),col=index%columns,x=margin+col*(cardW+gapX),top=gridTop-row*(cardH+gapY),bottom=top-cardH,topHeight=49,footerHeight=18,bodyTop=top-topHeight,bodyBottom=bottom+footerHeight;
   commands.push(`0.98 0.995 0.985 rg ${roundedRectPath(x,bottom,cardW,cardH,8)} f`,`0.08 0.12 0.10 RG 0.85 w ${roundedRectPath(x,bottom,cardW,cardH,8)} S`,`0 0.38 0.25 RG 1.2 w ${x+8} ${top-1} m ${x+cardW-8} ${top-1} l S`);
   const titleLines=wrap(card.sapName||card.name,cardW-16,8.1).slice(0,2);
   titleLines.forEach((line,lineIndex)=>text(x+8,top-14-lineIndex*9.5,8.1,line,true));
   const identity=`${card.microsName||'—'} | #DIA ${card.dia||'—'} | #SAP ${card.sap||'—'}${card.adjusted?' | AJUSTADO':''}`;
   text(x+cardW/2,top-(titleLines.length>1?42:34),5.3,clipped(identity,cardW-16,5.3),false,'center');
   commands.push(`0.08 0.12 0.10 RG 0.65 w ${x} ${bodyTop} m ${x+cardW} ${bodyTop} l S ${x+cardW/2} ${bodyTop} m ${x+cardW/2} ${bodyBottom} l S ${x} ${bodyBottom} m ${x+cardW} ${bodyBottom} l S`);
   text(x+cardW*.25,bodyTop-17,7,'MIN',true,'center');text(x+cardW*.75,bodyTop-17,7,'MAX',true,'center');
   text(x+cardW*.25,bodyBottom+14,17,card.minimum==null?'—':NUMBER.format(card.minimum),true,'center');text(x+cardW*.75,bodyBottom+14,17,card.maximum==null?'—':NUMBER.format(card.maximum),true,'center');
   const mode=card.mode==='pack'?'PICK PACK':card.mode==='sleeve'?'MANGA':'UNIDAD';
   if(card.mode==='unit'){
    const split=cardW*.66,unitText=`UNIDAD · ${card.usageUnit||card.unit||'Sin unidad'}`;commands.push(`0.75 0.82 0.78 RG 0.35 w ${x+split} ${bottom} m ${x+split} ${bodyBottom} l S`);
    text(x+split/2,bottom+6,5.8,clipped(unitText,split-12,5.8),true,'center','green');text(x+split+(cardW-split)/2,bottom+6,5.8,`${card.orders??'—'} PEDIDOS / SEM`,true,'center');
   }else{
    const third=cardW/3,pieces=`${NUMBER.format(card.piecesPerCase)} PZ / CAJA`;commands.push(`0.75 0.82 0.78 RG 0.35 w ${x+third} ${bottom} m ${x+third} ${bodyBottom} l S ${x+third*2} ${bottom} m ${x+third*2} ${bodyBottom} l S`);
    text(x+third*.5,bottom+6,5.8,mode,true,'center','green');text(x+third*1.5,bottom+6,5.8,clipped(pieces,third-8,5.8),false,'center');text(x+third*2.5,bottom+6,5.8,`${card.orders??'—'} PEDIDOS / SEM`,true,'center');
   }
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
  report.listCards.slice(start,start+perPage).forEach((card,index)=>{const y=507-index*31,format=card.mode==='pack'?'Pick Pack':card.mode==='sleeve'?'Manga':`Unidad · ${card.usageUnit||card.unit||'Sin unidad'}`,values=[card.sapName||card.name,card.microsName||'—',card.dia||'—',card.sap||'—',card.minimum==null?'—':NUMBER.format(card.minimum),card.maximum==null?'—':NUMBER.format(card.maximum),format,card.piecesPerCase?NUMBER.format(card.piecesPerCase):'—',card.orders??'—'];let cellX=28;
   if(index%2)commands.push(`0.97 0.98 0.97 rg 28 ${y-12} 736 30 re f`);
   values.forEach((value,columnIndex)=>{const cellWidth=widths[columnIndex],center=columnIndex>=2;text(center?cellX+cellWidth/2:cellX+4,y,6.1,clipped(value,cellWidth-8,6.1),columnIndex===0||columnIndex>=4,center?'center':'left');if(columnIndex)commands.push(`0.88 0.91 0.89 RG 0.25 w ${cellX} ${y-12} m ${cellX} ${y+18} l S`);cellX+=cellWidth;});commands.push(`0.86 0.90 0.87 RG 0.3 w 28 ${y-12} m 764 ${y-12} l S`);});
  pages.push(commands.join('\n'));
 }
 return pdfFromPages(pages);
}
function splitEvery(items,size){const groups=[];for(let index=0;index<items.length;index+=size)groups.push(items.slice(index,index+size));return groups.length?groups:[[]];}
function createOrderWoePdf(report){
 if(!report.orderRows?.length)throw new Error('Captura al menos una existencia antes de exportar.');
 const TABLE_X=28,TABLE_WIDTH=736,CODE_WIDTH=84,ORDER_WIDTH=96,TRANSIT_WIDTH=78,ROWS_PER_PAGE=13,TRANSIT_PER_PAGE=4,pages=[];
 const rowGroups=splitEvery(report.orderRows,ROWS_PER_PAGE),transitGroups=splitEvery(report.transitColumns||[],TRANSIT_PER_PAGE),pageData=rowGroups.flatMap(rows=>transitGroups.map(transit=>({rows,transit})));
 pageData.forEach(({rows,transit},pageIndex)=>{const commands=[],text=(x,y,size,value,bold=false,align='left',tone='dark')=>{const rendered=String(value??''),at=align==='center'?x-rendered.length*size*.27:x,color=tone==='white'?'1 1 1':tone==='green'?'0 0.38 0.25':'0.06 0.12 0.10';commands.push(`BT /F${bold?2:1} ${size} Tf ${color} rg ${at} ${y} Td (${pdfEscape(rendered)}) Tj ET`);};
  drawOperationalHeader(commands,text,report);text(28,551,13,'PEDIDO WOE · REVISIÓN OPERATIVA',true);text(28,536,7.2,'Cuenta existencia física; el tránsito del PDF se descuenta automáticamente.',false);
  const descriptionWidth=TABLE_WIDTH-CODE_WIDTH-ORDER_WIDTH-transit.length*TRANSIT_WIDTH,descriptionX=TABLE_X+CODE_WIDTH,transitX=descriptionX+descriptionWidth,orderX=transitX+transit.length*TRANSIT_WIDTH;
  commands.push(`0 0.38 0.25 rg ${TABLE_X} 496 ${TABLE_WIDTH} 29 re f`);text(TABLE_X+5,509,6.4,'#SAP / DIA',true,'left','white');text(descriptionX+5,509,6.4,'DESCRIPCIÓN SAP / MICROS',true,'left','white');
  transit.forEach((column,index)=>{const x=transitX+index*TRANSIT_WIDTH;text(x+TRANSIT_WIDTH/2,513,5.6,'TRÁNSITO',true,'center','white');text(x+TRANSIT_WIDTH/2,502,5.2,`${shortPdfDate(column.deliveryDate)} #${String(column.purchaseOrder).slice(-6)}`,true,'center','white');});text(orderX+ORDER_WIDTH/2,513,6,'CANTIDAD',true,'center','white');text(orderX+ORDER_WIDTH/2,502,6,'A PEDIR',true,'center','white');
  let y=477;rows.forEach((row,rowIndex)=>{const bottom=y-17;if(rowIndex%2)commands.push(`0.97 0.98 0.97 rg ${TABLE_X} ${bottom} ${TABLE_WIDTH} 30 re f`);text(TABLE_X+5,y+2,6.4,`SAP ${clipped(row.sap||'—',CODE_WIDTH-10,6.4)}`,true);text(TABLE_X+5,y-9,6.1,`DIA ${clipped(row.dia||'—',CODE_WIDTH-10,6.1)}`);text(descriptionX+5,y+2,6.6,clipped(row.sapDescription,descriptionWidth-10,6.6),true);text(descriptionX+5,y-9,6.1,clipped(`${row.microsDescription} · Uso diario ${row.dailyUse==null?'—':NUMBER.format(row.dailyUse)} ${row.operationalUnit||''}`,descriptionWidth-10,6.1));transit.forEach((column,index)=>{const value=row.transitByOrder?.[column.key]||0;text(transitX+index*TRANSIT_WIDTH+TRANSIT_WIDTH/2,y-4,6.4,value?`${NUMBER.format(value)} ${row.operationalUnit||''}`:'—',Boolean(value),'center');});text(orderX+ORDER_WIDTH/2,y-4,7,row.quantityLabel,true,'center');commands.push(`0.86 0.90 0.87 RG 0.3 w ${TABLE_X} ${bottom} m ${TABLE_X+TABLE_WIDTH} ${bottom} l S`);y-=31;});
  const separators=[descriptionX,transitX,orderX];transit.forEach((_,index)=>separators.push(transitX+(index+1)*TRANSIT_WIDTH));for(const x of new Set(separators))commands.push(`0.82 0.87 0.84 RG 0.3 w ${x} ${Math.max(58,y+14)} m ${x} 525 l S`);
  if((report.transitColumns||[]).length>TRANSIT_PER_PAGE){const first=(report.transitColumns||[]).indexOf(transit[0])+1,last=first+transit.length-1;text(28,34,6.5,`Remisiones ${first}-${last} de ${report.transitColumns.length}`,true,'left','green');}pages.push(commands.join('\n'));});
 return pdfFromPages(pages);
}
function shortPdfDate(value){const match=/^\d{4}-(\d{2})-(\d{2})$/.exec(String(value||''));return match?`${match[2]}/${match[1]}`:'—';}
function createAssemblyPdf(report){
 if(!report.assemblySlots?.length)throw new Error('No hay medias horas con demanda para exportar.');
 const pages=[],products=report.assemblyProducts||[],slots=report.assemblySlots||[],perPage=16;
 for(let start=0;start<slots.length;start+=perPage){const commands=[],text=(x,y,size,value,bold=false,align='left',tone='dark')=>{const rendered=String(value??''),at=align==='center'?x-rendered.length*size*.27:x,color=tone==='white'?'1 1 1':tone==='green'?'0 0.38 0.25':'0.06 0.12 0.10';commands.push(`BT /F${bold?2:1} ${size} Tf ${color} rg ${at} ${y} Td (${pdfEscape(rendered)}) Tj ET`);};
  drawOperationalHeader(commands,text,report);text(28,551,13,'ENSAMBLE · PLAN POR MEDIA HORA',true);text(28,536,7,report.filters||'Todas las semanas · Todos los días');
  const x=28,timeWidth=82,totalWidth=52,productWidth=(736-timeWidth-totalWidth)/Math.max(1,products.length),top=506,headerHeight=42;
  commands.push(`0 0.38 0.25 rg ${x} ${top-headerHeight} 736 ${headerHeight} re f`);text(x+6,top-24,6.3,'MEDIA HORA',true,'left','white');text(x+timeWidth+totalWidth/2,top-24,6.3,'TOTAL',true,'center','white');
  products.forEach((product,index)=>{const left=x+timeWidth+totalWidth+index*productWidth,lines=wrap(product.name,productWidth-8,5.5).slice(0,3);lines.forEach((line,lineIndex)=>text(left+productWidth/2,top-13-lineIndex*9,5.5,line,true,'center','white'));});
  report.assemblySlots.slice(start,start+perPage).forEach((slot,rowIndex)=>{const rowTop=top-headerHeight-rowIndex*27,rowBottom=rowTop-27;if(rowIndex%2)commands.push(`0.97 0.98 0.97 rg ${x} ${rowBottom} 736 27 re f`);text(x+6,rowTop-17,6.6,slot.label,true);text(x+timeWidth+totalWidth/2,rowTop-17,7.2,NUMBER.format(slot.prepare),true,'center','green');slot.items.forEach((item,index)=>text(x+timeWidth+totalWidth+index*productWidth+productWidth/2,rowTop-17,7,item.prepare?NUMBER.format(item.prepare):'—',item.prepare>0,'center'));commands.push(`0.86 0.90 0.87 RG 0.3 w ${x} ${rowBottom} m ${x+736} ${rowBottom} l S`);});
  const bottom=Math.max(35,top-headerHeight-Math.min(perPage,slots.length-start)*27),separators=[x+timeWidth,x+timeWidth+totalWidth,...products.map((_,index)=>x+timeWidth+totalWidth+(index+1)*productWidth)];for(const lineX of separators)commands.push(`0.84 0.89 0.86 RG 0.3 w ${lineX} ${bottom} m ${lineX} ${top} l S`);text(28,34,6.4,'Cifra operativa redondeada hacia arriba por producto y franja.',false,'left','green');pages.push(commands.join('\n'));}
 const recipePages=splitEvery(products,6);for(const group of recipePages){const commands=[],text=(x,y,size,value,bold=false,align='left',tone='dark')=>{const rendered=String(value??''),at=align==='center'?x-rendered.length*size*.27:x,color=tone==='white'?'1 1 1':tone==='green'?'0 0.38 0.25':'0.06 0.12 0.10';commands.push(`BT /F${bold?2:1} ${size} Tf ${color} rg ${at} ${y} Td (${pdfEscape(rendered)}) Tj ET`);};drawOperationalHeader(commands,text,report);text(28,551,13,'ENSAMBLE · GUÍA DE INGREDIENTES',true);text(28,536,7,'Cantidades calculadas sobre el plan redondeado de cada media hora.');
  group.forEach((product,index)=>{const column=index%2,row=Math.floor(index/2),x=28+column*372,top=510-row*151,width=360,height=139;commands.push(`0.79 0.86 0.81 RG 0.7 w ${x} ${top-height} ${width} ${height} re S`,`0.93 0.96 0.93 rg ${x} ${top-39} ${width} 39 re f`);text(x+12,top-17,8.5,clipped(product.name,width-98,8.5),true);text(x+width-48,top-19,16,NUMBER.format(product.plan),true,'center','green');text(x+width-48,top-31,5.3,'PZAS PLAN',true,'center');const recipe=product.recipe?.rule||'Receta pendiente de validar';wrap(recipe,width-24,6.2).slice(0,3).forEach((line,lineIndex)=>text(x+12,top-56-lineIndex*9,6.2,line));const totals=product.recipe?.packaged?'Sin porcionado en tienda':product.ingredients.map(ingredient=>`${ingredient.name}: ${NUMBER.format(ingredient.totalUnits)} ${ingredient.unit} / ${NUMBER.format(ingredient.totalGrams)} g`).join(' · ');wrap(totals,width-24,6).slice(0,3).forEach((line,lineIndex)=>text(x+12,top-91-lineIndex*9,6,line,true));text(x+12,top-127,5.4,clipped(`Origen: ${product.sources.join(', ')}`,width-24,5.4));});pages.push(commands.join('\n'));}
 return pdfFromPages(pages);
}
function createPeakHourPdf(report){
 if(!report.peakRows?.length)throw new Error('No hay días comparables para imprimir.');
 if(!report.timePeriodRows?.length)throw new Error('No hay Time Period activos para imprimir.');
 const commands=[],text=(x,y,size,value,bold=false,align='left',tone='dark')=>{const rendered=String(value??''),at=align==='center'?x-rendered.length*size*.27:align==='right'?x-rendered.length*size*.54:x,color=tone==='white'?'1 1 1':tone==='green'?'0 0.38 0.25':'0.06 0.12 0.10';commands.push(`BT /F${bold?2:1} ${size} Tf ${color} rg ${at} ${y} Td (${pdfEscape(rendered)}) Tj ET`);};
 drawOperationalHeader(commands,text,report);text(28,551,13,'PEAK HOUR · PLAN SEMANAL',true);text(764,551,7,report.peakBasis==='latest'?'BASE: MÁS RECIENTE':'BASE: PROMEDIO',true,'right','green');
 const x=28,top=516,widths=[80,120,69,69,70,120,69,69,70],headerHeight=42,rowHeight=48,labels=['DÍA','PEAK','PROM.','OBJ. +5','REAL','PEAK','PROM.','OBJ. +5','REAL'];let cursor=x;
 commands.push(`0 0.38 0.25 rg ${x} ${top-headerHeight} 736 ${headerHeight} re f`);text(x+widths[0]/2,top-25,6.5,'DÍA',true,'center','white');const amX=x+widths[0],amWidth=widths.slice(1,5).reduce((a,b)=>a+b,0),pmX=amX+amWidth,pmWidth=widths.slice(5).reduce((a,b)=>a+b,0);text(amX+amWidth/2,top-12,7,'AM · 00:00–14:00',true,'center','white');text(pmX+pmWidth/2,top-12,7,'PM · 14:00–23:59',true,'center','white');cursor=x;labels.forEach((label,index)=>{if(index)text(cursor+widths[index]/2,top-31,5.8,label,true,'center','white');cursor+=widths[index];});
 report.peakRows.slice(0,7).forEach((row,index)=>{const rowTop=top-headerHeight-index*rowHeight,rowBottom=rowTop-rowHeight;if(index%2)commands.push(`0.96 0.98 0.96 rg ${x} ${rowBottom} 736 ${rowHeight} re f`);const values=[row.day,row.am?.label||'—',row.am?.average,row.am?.target,row.realAm,row.pm?.label||'—',row.pm?.average,row.pm?.target,row.realPm];let cellX=x;values.forEach((value,column)=>{const cellWidth=widths[column],center=cellX+cellWidth/2;if(column===0){text(cellX+8,rowTop-19,7.2,value,true);text(cellX+8,rowTop-32,5.8,shortPdfDate(row.date));}else if(column===1||column===5){text(center,rowTop-27,6.3,value,true,'center');}else if(column===4||column===8){commands.push(`0.45 0.61 0.52 RG 0.8 w ${cellX+10} ${rowBottom+11} ${cellWidth-20} ${rowHeight-22} re S`);if(value!==null&&value!==undefined&&value!=='')text(center,rowTop-29,8,NUMBER.format(value),true,'center','green');}else{text(center,rowTop-29,column===3||column===7?9:7.2,value==null||value===''?'—':NUMBER.format(value),column===3||column===7,'center',column===3||column===7?'green':'dark');}if(column)commands.push(`0.84 0.89 0.86 RG 0.3 w ${cellX} ${rowBottom} m ${cellX} ${rowTop} l S`);cellX+=cellWidth;});commands.push(`0.84 0.89 0.86 RG 0.3 w ${x} ${rowBottom} m ${x+736} ${rowBottom} l S`);});
 text(28,56,6.3,'OBJETIVO = PROMEDIO DEL BLOQUE PEAK + 5 TRANSACCIONES',true,'left','green');text(764,56,6.1,'REAL: captura digital o llena el recuadro al cierre',false,'right');
 const periodCommands=[],periodText=(x,y,size,value,bold=false,align='left',tone='dark')=>{const rendered=String(value??''),at=align==='center'?x-rendered.length*size*.27:align==='right'?x-rendered.length*size*.54:x,color=tone==='white'?'1 1 1':tone==='green'?'0 0.38 0.25':'0.06 0.12 0.10';periodCommands.push(`BT /F${bold?2:1} ${size} Tf ${color} rg ${at} ${y} Td (${pdfEscape(rendered)}) Tj ET`);};
 drawOperationalHeader(periodCommands,periodText,report);periodText(28,551,13,'PEAK HOUR · TIME PERIOD',true);periodText(764,551,6.3,'48 PERIODOS · SÓLO TX MAYOR A CERO',true,'right','green');
 const periodRows=report.timePeriodRows.slice(0,48),periodX=28,periodTop=520,periodBottom=34,periodHeader=24,periodWidths=[88,54,55,77,77,77,77,77,77,77],periodRowHeight=Math.min(16,(periodTop-periodBottom-periodHeader)/Math.max(1,periodRows.length)),periodFont=periodRowHeight<10?4.6:5.7,periodLabels=['TIME PERIOD','TX','PROM.','LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM'];
 periodCommands.push(`0 0.38 0.25 rg ${periodX} ${periodTop-periodHeader} 736 ${periodHeader} re f`);let periodCursor=periodX;periodLabels.forEach((label,index)=>{periodText(periodCursor+periodWidths[index]/2,periodTop-15,5.6,label,true,'center','white');periodCursor+=periodWidths[index];});
 periodRows.forEach((row,index)=>{const rowTop=periodTop-periodHeader-index*periodRowHeight,rowBottom=rowTop-periodRowHeight;if(index%2)periodCommands.push(`0.97 0.985 0.97 rg ${periodX} ${rowBottom} 736 ${periodRowHeight} re f`);if(row.slot===28)periodCommands.push(`0 0.38 0.25 RG 1.15 w ${periodX} ${rowTop} m ${periodX+736} ${rowTop} l S`);const values=[String(row.label||'').replace(/[–—]/g,'-'),row.total,row.average,...(row.weekday||[]).slice(0,7)];let cellX=periodX;values.forEach((value,column)=>{const cellWidth=periodWidths[column],display=value===null||value===undefined||value===''?'—':typeof value==='number'?NUMBER.format(value):value;periodText(column===0?cellX+5:cellX+cellWidth/2,rowBottom+periodRowHeight/2-periodFont*.32,periodFont,display,column<3,column===0?'left':'center',column===2?'green':'dark');if(column)periodCommands.push(`0.84 0.89 0.86 RG 0.25 w ${cellX} ${rowBottom} m ${cellX} ${rowTop} l S`);cellX+=cellWidth;});periodCommands.push(`0.87 0.91 0.88 RG 0.22 w ${periodX} ${rowBottom} m ${periodX+736} ${rowBottom} l S`);});
 const periodTableBottom=periodTop-periodHeader-periodRowHeight*periodRows.length;let separatorX=periodX;periodWidths.slice(0,-1).forEach(width=>{separatorX+=width;periodCommands.push(`0.82 0.88 0.84 RG 0.3 w ${separatorX} ${periodTableBottom} m ${separatorX} ${periodTop} l S`);});periodText(28,24,5.7,'TX = TRANSACCIONES · PROM. = PROMEDIO DE LOS PERIODOS FILTRADOS',false,'left','green');
 return pdfFromPages([commands.join('\n'),periodCommands.join('\n')]);
}
function createPeakTrendPdf(report){
 const trend=report.peakTrend;if(!trend?.columns?.length)throw new Error('Elige un día con semanas comparables para imprimir.');
 const commands=[],text=(x,y,size,value,bold=false,align='left',tone='dark')=>{const rendered=String(value??''),at=align==='center'?x-rendered.length*size*.27:align==='right'?x-rendered.length*size*.54:x,color=tone==='white'?'1 1 1':tone==='green'?'0 0.38 0.25':'0.06 0.12 0.10';commands.push(`BT /F${bold?2:1} ${size} Tf ${color} rg ${at} ${y} Td (${pdfEscape(rendered)}) Tj ET`);},format=value=>value==null?'—':typeof value==='number'?NUMBER.format(value):value,delta=value=>value==null?'—':`${value>0?'+':''}${NUMBER.format(value)}`;
 drawOperationalHeader(commands,text,report);text(28,551,13,'PH TENDENCIA · MISMO DÍA ENTRE SEMANAS',true);text(764,551,7,`${trend.day||'DÍA'} · ${trend.columns.length} COMPARABLES`,true,'right','green');
 const x=28,top=518,leftWidth=118,deltaWidth=66,dateWidth=(736-leftWidth-deltaWidth)/trend.columns.length,headerHeight=31,summaryHeight=23,sectionHeight=15;
 commands.push(`0 0.38 0.25 rg ${x} ${top-headerHeight} 736 ${headerHeight} re f`);text(x+6,top-19,5.8,'MÉTRICA / TIME PERIOD',true,'left','white');trend.columns.forEach((column,index)=>{const center=x+leftWidth+dateWidth*(index+.5);text(center,top-12,5.6,column.day,true,'center','white');text(center,top-23,5.2,shortPdfDate(column.date),true,'center','white');});text(x+736-deltaWidth/2,top-18,5.4,'Δ ÚLT. SEM.',true,'center','white');
 const latest=trend.latest,previous=trend.previous,metricDelta=key=>latest?.[key]&&previous?.[key]?latest[key].total-previous[key].total:null,summary=[{label:'PEAK AM · 4 × 30 MIN',values:trend.columns.map(column=>column.am?`${String(column.am.label).replaceAll(' ','')} / ${format(column.am.total)}`:'—'),change:metricDelta('am')},{label:'PEAK PM · 4 × 30 MIN',values:trend.columns.map(column=>column.pm?`${String(column.pm.label).replaceAll(' ','')} / ${format(column.pm.total)}`:'—'),change:metricDelta('pm')},{label:'DIF. SEM. ANTERIOR',values:trend.columns.map(column=>delta(column.delta)),change:latest?.delta??null}];
 let rowTop=top-headerHeight;summary.forEach((row,index)=>{const bottom=rowTop-summaryHeight;commands.push(`${index===2?'0.91 0.96 0.92':'0.96 0.98 0.96'} rg ${x} ${bottom} 736 ${summaryHeight} re f`);text(x+6,bottom+8,5.9,row.label,true,'left',index===2?'green':'dark');row.values.forEach((value,column)=>text(x+leftWidth+dateWidth*(column+.5),bottom+8,Math.min(5.5,dateWidth*.085),clipped(value,dateWidth-5,5.5),true,'center'));text(x+736-deltaWidth/2,bottom+8,6.2,delta(row.change),true,'center',row.change>0?'green':'dark');commands.push(`0.84 0.89 0.86 RG 0.3 w ${x} ${bottom} m ${x+736} ${bottom} l S`);rowTop=bottom;});
 const sectionBottom=rowTop-sectionHeight;commands.push(`0.86 0.93 0.88 rg ${x} ${sectionBottom} 736 ${sectionHeight} re f`);text(x+6,sectionBottom+5,5.7,'MEDIA HORA · TRANSACCIONES',true,'left','green');rowTop=sectionBottom;
 const rows=(trend.rows||[]).slice(0,48),bottomLimit=34,rowHeight=Math.min(14,(rowTop-bottomLimit)/Math.max(1,rows.length)),font=rowHeight<9?4.3:5.5;rows.forEach((row,index)=>{const bottom=rowTop-rowHeight;if(index%2)commands.push(`0.975 0.985 0.975 rg ${x} ${bottom} 736 ${rowHeight} re f`);if(row.slot===28)commands.push(`0 0.38 0.25 RG 1.1 w ${x} ${rowTop} m ${x+736} ${rowTop} l S`);text(x+6,bottom+rowHeight/2-font*.3,font,String(row.label).replace(/[–—]/g,'-'),true);row.values.forEach((value,column)=>text(x+leftWidth+dateWidth*(column+.5),bottom+rowHeight/2-font*.3,font,format(value),false,'center'));text(x+736-deltaWidth/2,bottom+rowHeight/2-font*.3,font,delta(row.delta),true,'center',row.delta>0?'green':'dark');commands.push(`0.87 0.91 0.88 RG 0.22 w ${x} ${bottom} m ${x+736} ${bottom} l S`);rowTop=bottom;});
 const separators=[x+leftWidth,...trend.columns.map((_,index)=>x+leftWidth+dateWidth*(index+1))];for(const lineX of separators)commands.push(`0.82 0.88 0.84 RG 0.3 w ${lineX} ${Math.max(bottomLimit,rowTop)} m ${lineX} ${top} l S`);text(28,24,5.7,'PEAK = 4 MEDIAS HORAS CONSECUTIVAS · Δ = ÚLTIMA SEMANA VS SEMANA ANTERIOR',false,'left','green');return pdfFromPages([commands.join('\n')]);
}
function createCycleDayPdf(report){
 if(!report.cycleRows?.length)throw new Error('No hay Time Period activos para este día.');
 const commands=[],text=(x,y,size,value,bold=false,align='left',tone='dark')=>{const rendered=String(value??''),at=align==='center'?x-rendered.length*size*.27:align==='right'?x-rendered.length*size*.54:x,color=tone==='white'?'1 1 1':tone==='green'?'0 0.38 0.25':'0.06 0.12 0.10';commands.push(`BT /F${bold?2:1} ${size} Tf ${color} rg ${at} ${y} Td (${pdfEscape(rendered)}) Tj ET`);};
 drawOperationalHeader(commands,text,report);text(28,551,13,'TAREA DE CICLO · PLAN DEL DÍA',true);text(28,535,7.2,`${report.cycleDay||'Día'} · ${shortPdfDate(report.cycleDate)}`,true,'left','green');text(764,535,6.3,'TX = TRANSACCIONES · CS = FRECUENCIA DE CICLO',true,'right');
 const rows=report.cycleRows.slice(0,48),x=28,top=515,bottom=34,headerHeight=23,widths=[112,58,112,454],rowHeight=Math.min(17,(top-bottom-headerHeight)/Math.max(1,rows.length)),font=rowHeight<11?4.8:6.2;commands.push(`0 0.38 0.25 rg ${x} ${top-headerHeight} 736 ${headerHeight} re f`);const headers=['TIME PERIOD','TX','CS','ACTIVIDAD SUGERIDA'];let headerX=x;headers.forEach((label,index)=>{text(index===3?headerX+7:headerX+widths[index]/2,top-15,6.1,label,true,index===3?'left':'center','white');headerX+=widths[index];});
 let previousPeriod='';rows.forEach((row,index)=>{const rowTop=top-headerHeight-index*rowHeight,rowBottom=rowTop-rowHeight;if(index%2)commands.push(`0.97 0.985 0.97 rg ${x} ${rowBottom} 736 ${rowHeight} re f`);if(previousPeriod&&row.period!==previousPeriod)commands.push(`0 0.38 0.25 RG 1.1 w ${x} ${rowTop} m ${x+736} ${rowTop} l S`);previousPeriod=row.period;const cycleTone=row.cycleMinutes===30?'0.98 0.89 0.87':row.cycleMinutes===20?'1 0.95 0.77':row.cycleMinutes===12?'0.86 0.94 0.97':'0.87 0.95 0.90';commands.push(`${cycleTone} rg ${x+widths[0]+widths[1]} ${rowBottom+.5} ${widths[2]} ${Math.max(1,rowHeight-1)} re f`);const centerY=rowBottom+rowHeight/2-font*.32;text(x+6,centerY,font,row.label,true);text(x+widths[0]+widths[1]/2,centerY,font+0.2,NUMBER.format(row.tx),true,'center');text(x+widths[0]+widths[1]+widths[2]/2,centerY,font,`${row.cycleMinutes} min`,true,'center');text(x+widths[0]+widths[1]+widths[2]+7,centerY,font,clipped(row.activity,widths[3]-14,font));commands.push(`0.86 0.90 0.87 RG 0.25 w ${x} ${rowBottom} m ${x+736} ${rowBottom} l S`);});
 const tableBottom=top-headerHeight-rowHeight*rows.length,separators=[x+widths[0],x+widths[0]+widths[1],x+widths[0]+widths[1]+widths[2]];for(const lineX of separators)commands.push(`0.82 0.88 0.84 RG 0.3 w ${lineX} ${tableBottom} m ${lineX} ${top} l S`);return pdfFromPages([commands.join('\n')]);
}
export function createExecutivePdf(report) {
 if(!report?.sheets?.length)throw new Error("Este menú no tiene datos exportables.");
 if(report.layout==='labels')return createLabelPdf(report);
 if(report.layout==='maxmin-list')return createMaxMinListPdf(report);
 if(report.layout==='order-woe')return createOrderWoePdf(report);
 if(report.layout==='assembly-plan')return createAssemblyPdf(report);
 if(report.layout==='peak-hour-plan')return createPeakHourPdf(report);
 if(report.layout==='peak-trend')return createPeakTrendPdf(report);
 if(report.layout==='cycle-day-plan')return createCycleDayPdf(report);
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
export function downloadBytes(bytes,name,mime){if(!(bytes instanceof Uint8Array)||!bytes.length)throw new Error('La exportación quedó vacía. No se descargó.');if(bytes.length>75*1024*1024)throw new Error('La exportación excede el límite seguro de 75 MB. Reduce los filtros.');const safeName=String(name||'ControlOps360').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,180),url=URL.createObjectURL(new Blob([bytes],{type:mime})),a=document.createElement("a");a.href=url;a.download=safeName;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
