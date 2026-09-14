"use strict";
export const STRUCTURES = Object.freeze({
 sales: ["IDTienda","FechaHora","Ticket","SecTrans","SecDtl","Id","IDProducto","Cantidad","Total","CantidadAjustada"],
 usage: ["IDTienda","Fecha","IDArticulo","NombreArticulo","UsoIdeal"],
 auditTicket: ["IDTienda","Ticket","Fecha","Estatus","Total","FechaNegocio"],
 auditVoid: ["IDTienda","FechaHora","Ticket","IDProducto","IdVoid","VoidReason","Total"],
 auditPayment: ["IDTienda","FechaHora","Ticket","IdFormaPago","FormaPagDesc","MontoTotal","Total"],
 product: ["IDProducto","Descripcion"], store: ["IDTienda","Tienda"],
 stock: ["IDArticulo","NombreArticuloStock","UnidadMayor","PickPack","UnidadStock"],
 sapList: ["ID WOE","Codigo DIA","Descripcion SAP"],
 microsList: ["Familia","Nombre Micros","Codigo DIA","Proveedor"],
 compostable: ["inven_itm_name","Compostable"],
 woe: ["Nombre Micros","#SAP","#DIA","Descripcion WOE","UMB WOE Cantidad pedido"],
 food: ["Item","Alimento","#Alimento","BIS","Nombre Unificado BIS"],
 drink: ["Descripcion","Normalizado","Vaso"], cream: ["Descripcion","Aplica Normalizado"],
 baking: ["Grupo de horneo","Producto en reporte","Descongelacion","Horneo","Temperatura","Máximo por charola","Se puede hornear junto"],
});
export const FACT_FIELDS={sales:"salesFacts",usage:"usageFacts",auditTicket:"auditTickets",auditVoid:"auditVoids",auditPayment:"auditPayments"};
export const FACT_TYPES=Object.keys(FACT_FIELDS);
export const CATALOG_FIELDS={product:"productCatalog",store:"storeCatalog",stock:"stockCatalog",sapList:"sapCatalog",microsList:"microsCatalog",compostable:"compostableCatalog",woe:"woeCatalog",food:"foodRules",drink:"drinkRules",cream:"creamRules",baking:"bakingCatalog",storePolicy:"storePolicies"};
export const DAY_LABELS=["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
export const DAY_MS=86400000;
export const REQUIRED_HEADERS=STRUCTURES.sales;
export function normalize(v){return String(v??"").replace(/_x[0-9a-f]{4}_/gi," ").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9]+/g,"").toLowerCase();}
// Column markers carry meaning: Alimento (Sí/No) is not #Alimento (pieces).
export function headerKey(v){const text=String(v??'').trim();return (text.startsWith('#')?'#':'')+normalize(text);}
export function cleanId(v){return v==null?"":String(v).trim().replace(/\.0+$/,"");}
export function numberValue(v){if(v==null||String(v).trim()==="")return null;const n=Number(String(v).trim().replace(/\s|\$/g,"").replace(",","."));return Number.isFinite(n)?n:null;}
export function booleanValue(v){const k=normalize(v);return ["si","true","1","compostable"].includes(k)?true:["no","false","0","estandar"].includes(k)?false:null;}
export function matchStructure(headers,type="sales"){const h=new Set(headers.map(headerKey)),required=STRUCTURES[type]||[],missing=required.filter(x=>!h.has(headerKey(x)));return {compatible:!!required.length&&!missing.length,missing,type};}
export function classifyStructure(headers){const found=Object.keys(STRUCTURES).filter(k=>matchStructure(headers,k).compatible),h=new Set(headers.map(normalize));if(["ceco","cc","idtienda"].some(k=>h.has(k))&&h.has("compostable"))found.push("storePolicy");return found;}
export function isAcSource(...v){return v.some(x=>/(?:^|[\s_-])ac$/i.test(String(x||"").trim()));}
const pad=v=>String(v).padStart(2,"0");
export function dateParts(v){
 let d;
 if(typeof v==="number"&&Number.isFinite(v))d=new Date(Math.round((v-25569)*DAY_MS));
 else{const t=String(v??"").trim(),iso=t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?Z?)?$/),es=t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if(!iso&&!es)return null;const a=iso||es,y=Number(iso?a[1]:a[3]),m=Number(a[2]),day=Number(iso?a[3]:a[1]),h=Number(a[4]||0),min=Number(a[5]||0),sec=Number(a[6]||0);d=new Date(Date.UTC(y,m-1,day,h,min,sec));if(d.getUTCFullYear()!==y||d.getUTCMonth()!==m-1||d.getUTCDate()!==day||h>23||min>59||sec>59)return null;
 }
 if(!d||!Number.isFinite(d.getTime())||d.getUTCFullYear()<2000||d.getUTCFullYear()>2100)return null;
 const y=d.getUTCFullYear(),m=d.getUTCMonth()+1,day=d.getUTCDate(),h=d.getUTCHours(),min=d.getUTCMinutes();
 return {ms:d.getTime(),dayMs:Date.UTC(y,m-1,day),dateKey:`${y}-${pad(m)}-${pad(day)}`,dateLabel:`${pad(day)}/${pad(m)}/${y}`,weekday:(d.getUTCDay()+6)%7,slot:h*2+Math.floor(min/30),minuteOfDay:h*60+min};
}
export function dateExtent(facts){let min=Infinity,max=-Infinity;for(const r of facts){if(r.dayMs<min)min=r.dayMs;if(r.dayMs>max)max=r.dayMs;}return {from:Number.isFinite(min)?new Date(min).toISOString().slice(0,10):"",to:Number.isFinite(max)?new Date(max).toISOString().slice(0,10):""};}
export function weekKey(dateKey){const d=dateParts(dateKey);return new Date(d.dayMs-d.weekday*DAY_MS).toISOString().slice(0,10);}
export function shortDate(v){return v?`${v.slice(8,10)}/${v.slice(5,7)}`:"—";}
export function shortPeriod(from,to){return from&&to?`${shortDate(from)} - ${shortDate(to)}${from.slice(0,4)!==to.slice(0,4)?` (${from.slice(0,4)}–${to.slice(0,4)})`:""}`:"Sin datos";}
export function createDataset(){const d={sourceRows:0,duplicateRows:0,invalidRows:0,sourceTypes:new Set(),referenceTypes:new Set(),references:new Map(),indexes:{},sapDiaCatalog:new Map()};for(const [type,name]of Object.entries(FACT_FIELDS)){d[name]=[];d.indexes[type]=new Map();}for(const name of Object.values(CATALOG_FIELDS))d[name]=new Map();return d;}
function rowGetter(headers){const m=new Map();headers.forEach((h,i)=>{const key=headerKey(h);if(!key||m.has(key))throw new Error("Encabezado vacío o duplicado: cruce ambiguo.");m.set(key,i);});return row=>(...keys)=>{for(const k of keys){const i=m.get(headerKey(k));if(i!=null&&row[i]!==undefined)return row[i];}return "";};}
function insert(d,type,fact){const list=d[FACT_FIELDS[type]],i=d.indexes[type].get(fact.key);if(i!=null){d.duplicateRows++;for(const k of ["total","use","quantity","adjusted","amount","unit"]){if(list[i][k]!==fact[k])throw new Error(`Llave repetida con valores distintos en ${type}.`);}return false;}d.indexes[type].set(fact.key,list.length);list.push(fact);return true;}
export function addRows(d,h,r,s={}){return {uniqueRows:addFacts(d,"sales",h,r,s)};}
export function addUsageRows(d,h,r,s={}){return addFacts(d,"usage",h,r,s);}
export function addAuditRows(d,t,h,r,s={}){return addFacts(d,t,h,r,s);}
function addFacts(d,type,headers,rows,source){
 if(!matchStructure(headers,type).compatible)throw new Error(`Columnas incompletas: ${type}.`);d.sourceTypes.add(type);let added=0;const getter=rowGetter(headers);
 for(const row of rows){d.sourceRows++;const get=getter(row),store=cleanId(get("IDTienda")),ticket=cleanId(get("Ticket")),date=dateParts(get(type==="usage"||type==="auditTicket"?"Fecha":"FechaHora")),fact={store,...date};
  if(!store||!date){d.invalidRows++;continue;}
  if(type==="usage"){Object.assign(fact,{item:cleanId(get("IDArticulo")),name:String(get("NombreArticulo")).trim(),use:numberValue(get("UsoIdeal")),unit:String(get("Unidad")).trim(),family:String(get("NombreClasificador")).trim()});if(!fact.item||!fact.name||fact.use==null){d.invalidRows++;continue;}fact.key=[store,date.dateKey,fact.item].join("|");}
  else{const secTrans=cleanId(get("SecTrans")),secDtl=cleanId(get("SecDtl")),id=cleanId(get("Id"));Object.assign(fact,{ticket,secTrans,secDtl,id,product:cleanId(get("IDProducto")),total:numberValue(get("Total")),employee:cleanId(get("IDEmpleado")),manager:cleanId(get("IdGerente"))});if(!ticket||fact.total==null){d.invalidRows++;continue;}fact.transactionKey=[store,date.dateKey,ticket,secTrans].join("|");fact.ticketKey=[store,date.dateKey,ticket].join("|");
   if(type==="sales"){const quantity=numberValue(get("Cantidad")),adjusted=numberValue(get("CantidadAjustada"));if(!secTrans||!secDtl||!id||quantity==null||adjusted==null){d.invalidRows++;continue;}Object.assign(fact,{quantity,adjusted,priceLevel:numberValue(get("NivelPrecio")),mode:String(get("ModoOrdenDesc")||get("ModoOrden")||"Sin canal").trim(),negative:quantity<0||adjusted<0||fact.total<0});fact.key=[fact.transactionKey,secDtl,id,fact.product].join("|");}
   else{Object.assign(fact,{amount:numberValue(get("MontoTotal"))??fact.total,status:String(get("Estatus")),reason:String(get("VoidReason")||"Sin motivo").trim(),payment:String(get("FormaPagDesc")||"Sin forma").trim()});fact.key=[type,fact.ticketKey,secTrans,secDtl,id,type==="auditTicket"?"":cleanId(get(type==="auditVoid"?"IdVoid":"IdFormaPago")),fact.product].join("|");}
  }
  fact.fileName=source.fileName||"";if(insert(d,type,fact))added++;
 }return added;
}
export function addReferenceRows(d,type,headers,rows,source={}){
 const catalog=d[CATALOG_FIELDS[type]];if(!catalog)throw new Error("Parámetro desconocido.");d.referenceTypes.add(type);let added=0;const getter=rowGetter(headers);
 for(const row of rows){const get=getter(row);let key,value;
  if(type==="product"){key=cleanId(get("IDProducto"));value={id:key,name:String(get("Descripcion")).trim(),family:String(get("DescripcionFam")).trim(),category:String(get("CatDescripcion")).trim()};}
  if(type==="store"){key=cleanId(get("IDTienda","CeCo","CC"));value=String(get("Tienda","NombreTienda","st_name")).trim();}
  if(type==="stock"){key=cleanId(get("IDArticulo"));value={id:key,name:String(get("NombreArticuloStock")).trim(),family:String(get("ClasificacionStock")).trim(),majorUnit:String(get("UnidadMayor")).trim(),pickPack:String(get("PickPack")).trim(),stockUnit:String(get("UnidadStock")).trim()};}
  if(type==="sapList"){const sap=cleanId(get("ID WOE","#SAP","SAP")),rawDia=cleanId(get("Codigo DIA","Código DIA","#DIA")),dia=rawDia?rawDia.padStart(6,"0"):"";key=sap;value={sap,dia,description:String(get("Descripcion SAP","Descripción SAP")).trim()};if(!sap||!dia||!value.description)throw new Error("Lista SAP con código o descripción vacía.");const priorDia=d.sapDiaCatalog.get(dia);if(priorDia&&priorDia.sap!==sap)throw new Error(`Código DIA duplicado en lista SAP: ${dia}.`);d.sapDiaCatalog.set(dia,value);}
  if(type==="microsList"){const rawDia=cleanId(get("Codigo DIA","Código DIA","#DIA")),dia=rawDia?rawDia.padStart(6,"0"):"";key=normalize(get("Nombre Micros"));value={micros:String(get("Nombre Micros")).trim(),dia,family:String(get("Familia")).trim(),provider:String(get("Proveedor")).trim(),ambiguous:false};if(!key||!dia)throw new Error("Catálogo MICROS con nombre o DIA vacío.");const prior=catalog.get(key);if(prior){if(prior.dia!==dia)catalog.set(key,{...prior,ambiguous:true,candidates:[...new Set([...(prior.candidates||[prior.dia]),dia])]});continue;}}
  if(type==="storePolicy"){key=cleanId(get("CeCo","CC","IDTienda"));value=booleanValue(get("Compostable"));if(value===null)throw new Error("CeCo sin clasificación compostable válida.");}
  if(type==="compostable"){key=normalize(get("inven_itm_name"));value=booleanValue(get("Compostable"));if(value===null)throw new Error("Artículo sin clasificación compostable válida.");}
  if(type==="drink"){key=normalize(get("Descripcion"));value={classification:({vaso:"Vaso",no:"No",fhw:"FHW"})[normalize(get("Normalizado"))],vessel:({"1caliente":"1_Caliente","2helado":"2_Helado","3fhw":"3_FHW",na:"Na"})[normalize(get("Vaso"))]};if(!value.classification||!value.vessel||(value.classification==="Vaso"&&!["1_Caliente","2_Helado"].includes(value.vessel))||(value.classification==="FHW"&&value.vessel!=="3_FHW"))throw new Error("Regla de vaso inválida o contradictoria.");}
  if(type==="cream"){key=normalize(get("Descripcion"));value=booleanValue(get("Aplica Normalizado"));if(value===null)throw new Error("Regla de crema inválida.");}
  if(type==="food"){const assembly=String(get("Nombre Unificado Ensamble")).trim(),assemblyFlag=booleanValue(get("Ensamble"));key=normalize(get("Item"));value={item:assembly?String(get("Item")).trim():key,food:booleanValue(get("Alimento")),pieces:numberValue(get("#Alimento")),bis:booleanValue(get("BIS")),bakingName:String(get("Nombre Unificado BIS")).trim(),assembly,assemblyEnabled:assemblyFlag===null?!!assembly:assemblyFlag,ingredient:String(get("Ingrediente ensamble","Ingediente ensamble")).trim()};if(value.food===null||value.bis===null||!(value.pieces>0)||(value.bis&&!value.bakingName)||(value.assemblyEnabled&&!value.assembly))throw new Error("Regla de alimento sin clasificación, factor o nombre válido.");}
  if(type==="baking"){key=normalize(get("Producto en reporte"));const tray=String(get("Máximo por charola"));value={product:String(get("Producto en reporte")),group:String(get("Grupo de horneo")),thaw:String(get("Descongelacion")),bake:String(get("Horneo")),temperature:String(get("Temperatura")),maxTray:numberValue(tray.match(/\d+/)?.[0]),trayText:tray,together:String(get("Se puede hornear junto"))};if(!(value.maxTray>0))throw new Error("Horneo sin capacidad válida por charola.");}
  if(type==="woe"){const micros=String(get("Nombre Micros")).trim(),dia=cleanId(get("#DIA"));key=normalize(micros);value={micros,sap:cleanId(get("#SAP")),dia:dia?dia.padStart(6,"0"):"",provider:String(get("Proveedor")),description:String(get("Descripcion WOE")),microsUnit:String(get("Unidad de Medida Micros Relacion con el uso prom en cuestion de unidad")),ump:String(get("UMP WOE")),umb:numberValue(get("UMB WOE Cantidad pedido")),relation:numberValue(get("Relacion Unidad de Medida Micros con # Total")),unit:String(get("Unidad WOE")),compostable:booleanValue(String(get("Comentario Para Revision")).match(/Compostable\s*:\s*(Si|Sí|No)/i)?.[1])};}
  if(!key)throw new Error(`Clave vacía en ${type}.`);if(catalog.has(key)&&JSON.stringify(catalog.get(key))!==JSON.stringify(value))throw new Error(`Cruce ambiguo en ${type}: ${key}.`);catalog.set(key,value);added++;
 }if(source.source)d.references.set(type,{source:source.source,sha256:source.sha256||"",rows:catalog.size});return added;
}
export function operationalStores(d){return new Set(Object.values(FACT_FIELDS).flatMap(name=>d[name].map(f=>f.store)));}
export function validateCeCo(target,source){const current=operationalStores(target),incoming=operationalStores(source);if(incoming.size>1)throw new Error("El archivo contiene más de un CeCo. No se incorporó.");const store=[...incoming][0];if(current.size&&store&&!current.has(store))throw new Error(`CeCo ${store} distinto de ${[...current][0]}. No se incorporó.`);if(store&&source.storeCatalog.size&&!source.storeCatalog.has(store))throw new Error("El CeCo de _ac no coincide con Tienda. No se incorporó.");if(source.invalidRows)throw new Error(`${source.invalidRows} filas sin clave, fecha o cantidad válida. No se incorporó.`);}
export function mergeDataset(target,source){
 validateCeCo(target,source);let added=0,replaced=0;
 // Each refreshed _ac replaces its included dates atomically. Older dates accumulate.
 for(const [type,name]of Object.entries(FACT_FIELDS)){if(!source.sourceTypes.has(type))continue;const dates=new Set(source[name].map(r=>r.dateKey)),retained=target[name].filter(r=>!dates.has(r.dateKey));replaced+=target[name].length-retained.length;added+=source[name].length;target[name]=retained.concat(source[name]);target.indexes[type]=new Map(target[name].map((r,i)=>[r.key,i]));target.sourceTypes.add(type);}
 for(const type of source.referenceTypes){const name=CATALOG_FIELDS[type];target[name]=new Map(source[name]);if(type==="sapList")target.sapDiaCatalog=new Map(source.sapDiaCatalog);target.referenceTypes.add(type);if(source.references.has(type))target.references.set(type,source.references.get(type));}
 target.sourceRows+=source.sourceRows;target.duplicateRows+=source.duplicateRows;return {uniqueRows:added,replacedRows:replaced,duplicateRows:source.duplicateRows};
}
export function workbookKind(d){const types=d?.sourceTypes||new Set(),references=d?.referenceTypes||new Set(),groups=[];if(types.has("sales"))groups.push("sales");if(types.has("usage"))groups.push("usage");if(["auditTicket","auditVoid","auditPayment"].some(type=>types.has(type)))groups.push("audit");if(!groups.length&&["sapList","microsList"].some(type=>references.has(type)))groups.push("priceList");return groups.sort().join("+");}
export function workbookFreshness(record){const days=new Set();let maxDay=-Infinity,rows=0;for(const name of Object.values(FACT_FIELDS)){for(const row of record?.dataset?.[name]||[]){rows++;if(row.dateKey)days.add(row.dateKey);if(Number.isFinite(row.dayMs)&&row.dayMs>maxDay)maxDay=row.dayMs;}}const dated=record?.dataset?.referenceTypes?.has("sapList")||record?.dataset?.referenceTypes?.has("microsList"),stamp=dated?Number(String(record?.name||"").match(/20\d{6}[-_]?\d{6}/)?.[0].replace(/\D/g,""))||0:0;return {maxDay,maxDate:Number.isFinite(maxDay)?new Date(maxDay).toISOString().slice(0,10):"",days:days.size,nameTimestamp:stamp,rows,lastModified:Number(record?.lastModified)||0,sequence:Number(record?.sequence)||0};}
export function compareWorkbookFreshness(left,right){const a=workbookFreshness(left),b=workbookFreshness(right);for(const key of ["maxDay","days","nameTimestamp","lastModified","rows","sequence"]){if(a[key]!==b[key])return a[key]>b[key]?1:-1;}return String(left?.fingerprint||left?.name||"").localeCompare(String(right?.fingerprint||right?.name||""));}
export function selectRecentWorkbooks(records){const parameters=[],winners=new Map(),superseded=[];for(const record of records){const kind=workbookKind(record.dataset);if(!kind){parameters.push(record);continue;}const current=winners.get(kind);if(!current){winners.set(kind,record);continue;}if(compareWorkbookFreshness(record,current)>0){superseded.push(current);winners.set(kind,record);}else superseded.push(record);}return {selected:[...parameters,...winners.values()],superseded};}
export function getFilterOptions(d,type="sales"){const facts=d[FACT_FIELDS[type]]||[],range=dateExtent(facts);return {minDate:range.from,maxDate:range.to,weeks:[...new Set(facts.map(f=>weekKey(f.dateKey)))].sort(),modes:[...new Set(facts.map(f=>f.mode).filter(Boolean))].sort(),stores:[...operationalStores(d)].map(id=>({id,name:d.storeCatalog.get(id)||`CeCo ${id}`}))};}
