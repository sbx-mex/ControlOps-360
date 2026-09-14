import {normalize,numberValue,DAY_LABELS,DAY_MS,dateParts,dateExtent,weekKey,shortDate,shortPeriod} from './engine.mjs';
import {assemblyRecipe,projectedIngredients} from './assembly.mjs';

export const ORDER_FACTOR={2:5,3:4,4:3,5:2};
export const MODULES=[
 {id:'maxmin',name:'Max & Min',caption:'Uso, mínimos y tarjetas',icon:'▦',type:'usage'},
 {id:'trend',name:'Tendencia de uso',caption:'Productos y días comparables',icon:'↗',type:'usage'},
 {id:'order',name:'Pedido WOE',caption:'Cobertura, existencias y pedido',icon:'▤',type:'usage'},
 {id:'peak',name:'Peak Hour',caption:'Todo el día, cada media hora',icon:'◷',type:'sales'},
 {id:'normal',name:'Normalizados',caption:'Tamaños, vasos y crema',icon:'◉',type:'sales'},
 {id:'assembly',name:'Ensamble',caption:'Plan por media hora e ingredientes',icon:'◈',type:'sales'},
 {id:'baking',name:'Bitácora de horneo',caption:'Previsión y próximas tandas',icon:'♨',type:'sales'},
 {id:'top',name:'Top Bebidas & Alimentos',caption:'Ranking y mezcla semanal',icon:'≡',type:'sales'},
 {id:'audit',name:'Auditoría tienda',caption:'Órdenes negativas por revisar',icon:'◇',type:'audit'},
];
export function availableModules(d){return MODULES.filter(m=>m.type==='audit'?d.sourceTypes.has('auditTicket')||d.sourceTypes.has('auditVoid'):m.type==='usage'?d.usageFacts.length:d.salesFacts.length&&(m.id==='peak'||d.productCatalog.size));}
export function filterFacts(facts,f={}){const weeks=Array.isArray(f.weeks)?f.weeks.filter(Boolean):[],weekdays=Array.isArray(f.weekdays)?f.weekdays.filter(value=>value!==''&&value!=null).map(Number):[];return facts.filter(r=>(!f.store||r.store===f.store)&&(!f.from||r.dateKey>=f.from)&&(!f.to||r.dateKey<=f.to)&&(!f.week||weekKey(r.dateKey)===f.week)&&(!weeks.length||weeks.includes(weekKey(r.dateKey)))&&(f.weekday==null||f.weekday===''||r.weekday===Number(f.weekday))&&(!weekdays.length||weekdays.includes(r.weekday))&&(!f.mode||r.mode===f.mode));}
export const sum=(a,key)=>a.reduce((s,r)=>s+(typeof key==='function'?key(r):r[key]||0),0);
export const clock=slot=>`${String(Math.floor(slot/2)).padStart(2,'0')}:${slot%2?'30':'00'}`;
const epsCeil=v=>Math.ceil(v-0.00001);
const itemName=(d,r)=>d.productCatalog.get(r.product)?.name||`Sin catálogo (${r.product||'sin ID'})`;
const pretty=v=>String(v||'').replace(/^\d+_/,'').replaceAll('_',' ');

// A physical content (500 g) is not a piece count. Keep original units except
// explicit discrete groups such as BLI 3pz or BOL 35 pzs.
export function unitSpec(value){
 const text=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
 const n=pattern=>numberValue(text.match(pattern)?.[1]);
 const pieces=n(/(\d+(?:[.,]\d+)?)\s*(?:PZS?|PZAS?|PIEZAS?)\b/);
 const slices=n(/(\d+(?:[.,]\d+)?)\s*(?:REBANADAS?|REB)\b/);
 const physical=[[/([\d.,]+)\s*(?:KG|KGS|KILOS?)\b/,'mass',1000],[/([\d.,]+)\s*(?:GRS?|G|GRAMOS?)\b/,'mass',1],[/([\d.,]+)\s*(?:LB|LBS)\b/,'mass',453.59237],[/([\d.,]+)\s*ML\b/,'volume',0.001],[/([\d.,]+)\s*(?:LT|LTS|L|LITROS?)\b/,'volume',1]];
 let dim='',base=1,multiplier=1;
 if(slices>0){dim='slice';base=slices;}
 else if(pieces>0){dim='piece';base=pieces;multiplier=pieces;}
 else{for(const [pattern,d,factor]of physical){const count=n(pattern);if(count>0){dim=d;base=count*factor;break;}}
  if(!dim&&/^(PZA|PZ|PIEZA|UNIDAD|UND)\b/.test(text))dim='piece';
  if(!dim&&/^(REB|REBANADA)\b/.test(text))dim='slice';
  if(!dim&&/^(KG|KILO)/.test(text)){dim='mass';base=1000;}
  if(!dim&&/^(GR|GRAMO)/.test(text))dim='mass';
  if(!dim&&/^(L|LT|LITRO)\b/.test(text))dim='volume';
  if(!dim&&/^(BLI|BLIS|BLISTER)\b/.test(text)){const count=n(/(\d+)/);if(count>0){dim='piece';base=count;multiplier=count;}}
 }
 return {dim,base,multiplier,label:multiplier>1?'Piezas':value||'Unidad sin definir',text,basePerUnit:base/multiplier};
}
function lookupName(catalog,name){const key=normalize(name),matches=[...catalog.values()].filter(r=>normalize(r.name||r.micros)===key);return matches.length===1?matches[0]:null;}
export function resolveInventoryCodes(d,item,baseWoe){
 const listReady=d.sapCatalog?.size>0,micros=d.microsCatalog?.get(normalize(item.name)),microsDia=micros&&!micros.ambiguous?micros.dia:'',sap=baseWoe?.sap||'',dia=baseWoe?.dia||microsDia;
 if(!listReady)return {woe:baseWoe,validation:'Lista SAP no cargada',blocked:false};
 const bySap=sap?d.sapCatalog.get(sap):null,byDia=dia?d.sapDiaCatalog.get(dia):null,official=bySap||byDia;
 const conflict=!!((bySap&&dia&&bySap.dia!==dia)||(byDia&&sap&&byDia.sap!==sap)||(bySap&&byDia&&bySap.sap!==byDia.sap));
 if(conflict)return {woe:baseWoe,validation:'Conflicto SAP/DIA',blocked:true};
 if(baseWoe&&official)return {woe:{...baseWoe,sap:official.sap,dia:official.dia,description:official.description||baseWoe.description,codeVerified:true},validation:'SAP/DIA validado',blocked:false};
 if(baseWoe)return {woe:baseWoe,validation:'SAP/DIA sin doble validación',blocked:true};
 if(micros?.ambiguous)return {woe:null,validation:'Nombre MICROS con más de un DIA',blocked:true};
 if(micros&&byDia)return {woe:{micros:item.name,sap:byDia.sap,dia:byDia.dia,description:byDia.description,provider:micros.provider,microsUnit:'',ump:'',umb:null,relation:null,unit:'',compostable:null,codeVerified:true,codeOnly:true},validation:'Códigos validados · falta unidad WOE',blocked:false};
 return {woe:null,validation:microsDia?'DIA sin correspondencia SAP':'Sin cruce WOE',blocked:true};
}
export function presentation(usage,stock,woe){
 const source=unitSpec(usage.unit),major=unitSpec(stock?.majorUnit||usage.unit),pick=unitSpec(stock?.pickPack),wu=unitSpec(woe?.unit);
 let stockPack=null,woePack=null;
 if(source.dim){
  if(pick.dim===source.dim)stockPack=pick.base/source.basePerUnit;
  else if(/^(CJA|CAJ|CAJA)\b/.test(pick.text)&&major.dim===source.dim){const count=numberValue(pick.text.match(/\d+(?:[.,]\d+)?/)?.[0]);if(count>0)stockPack=count*major.base/source.basePerUnit;}
  if(woe&&wu.dim===source.dim&&woe.umb>0)woePack=woe.umb*wu.base/source.basePerUnit;
  // WOE explicitly relates a whole loaf to its slices (e.g. Panqué Limón = 7).
  if(woe&&source.dim==='slice'&&wu.dim==='piece'&&woe.relation>0)woePack=woe.relation;
  if(woePack>0&&Math.abs(woePack-Math.round(woePack))<0.02)woePack=Math.round(woePack);
 }
 // Equal, non-physical presentations can only be converted one-to-one.
 if(!source.dim&&normalize(usage.unit)&&normalize(usage.unit)===normalize(stock?.pickPack))stockPack=1;
 return {...source,stockPack:stockPack>0?stockPack:null,woePack:woePack>0?woePack:null};
}
function usagePeriod(d,f){
 const all=d.usageFacts.filter(r=>!f.store||r.store===f.store),range=dateExtent(all);
 const to=f.to||range.to,lower=to?new Date(dateParts(to).dayMs-20*DAY_MS).toISOString().slice(0,10):'';
 return filterFacts(all,{...f,from:f.from||(f.window==='all'?range.from:lower),to});
}
export function inventory(d,f={},overrides={}){
 const facts=usagePeriod(d,f),dates=[...new Set(facts.map(r=>r.dateKey))].sort(),days=dates.length,items=new Map();
 for(const r of facts){const k=`${r.store}|${r.item}`;let v=items.get(k);if(!v){v={id:r.item,key:k,store:r.store,name:r.name,family:r.family,unit:r.unit,rawUse:0,daily:new Map(),unitConflict:false};items.set(k,v);}if(normalize(v.unit)!==normalize(r.unit))v.unitConflict=true;v.rawUse+=r.use;v.daily.set(r.dateKey,(v.daily.get(r.dateKey)||0)+r.use);}
 const orders=Object.hasOwn(ORDER_FACTOR,f.orders)?Number(f.orders):2,policy=d.storePolicies.get(f.store),rows=[];
 for(const item of items.values()){
  if(!(item.rawUse>0))continue;
  const byId=d.stockCatalog.get(item.id),stock=byId&&normalize(byId.name)===normalize(item.name)?byId:lookupName(d.stockCatalog,item.name);
  const codeCheck=resolveInventoryCodes(d,item,d.woeCatalog.get(normalize(item.name))),woe=codeCheck.woe,p=presentation(item,stock,woe);
  const families=Array.isArray(f.families)?f.families.filter(Boolean):[];
  if(f.family&&item.family!==f.family)continue;
  if(families.length&&!families.includes(item.family))continue;
  const searchText=normalize([item.name,stock?.name,woe?.micros,woe?.description,woe?.sap,woe?.dia].filter(Boolean).join(' '));
  if(f.query&&!searchText.includes(normalize(f.query)))continue;
  const totalUse=item.rawUse*p.multiplier,average=days?totalUse/days:0,override=numberValue(overrides[item.key]);
  const minimum=override!==null&&override>=0?override:average,maximum=minimum*ORDER_FACTOR[orders];
  const rule=d.compostableCatalog.get(normalize(item.name)),compostable=rule??woe?.compostable;
  const controlled=rule!==undefined||woe?.compostable!=null||/(vaso|tapa|contenedor)/.test(normalize(item.family+' '+item.name));
  const reasons=[];
  if(item.unitConflict)reasons.push('Unidades mezcladas');
  if(!woe)reasons.push('Sin cruce WOE');
  if(woe&&!woe.sap)reasons.push('Sin SAP');
  if(woe&&!p.woePack)reasons.push('Validar unidad WOE');
  if(codeCheck.blocked&&!reasons.includes(codeCheck.validation))reasons.push(codeCheck.validation);
  if(rule!==undefined&&woe?.compostable!=null&&rule!==woe.compostable)reasons.push('Conflicto de clasificación');
  if(controlled&&policy===undefined)reasons.push('CeCo sin clasificación');
  if(controlled&&compostable==null)reasons.push('Artículo sin clasificación');
  if(controlled&&policy!==undefined&&compostable!=null&&policy!==compostable)reasons.push('No aplica al CeCo');
  const daily=dates.map(date=>({date,value:(item.daily.get(date)||0)*p.multiplier}));
  const weekday=DAY_LABELS.map((name,i)=>{const ds=daily.filter(r=>dateParts(r.date).weekday===i);return {name,days:ds.length,average:ds.length?sum(ds,'value')/ds.length:null};});
  const weeks=[...new Set(dates.map(weekKey))].sort().map(week=>{const ds=daily.filter(r=>weekKey(r.date)===week);return {week,days:ds.length,average:sum(ds,'value')/ds.length};});
  const a=weeks.at(-1),b=weeks.at(-2);
  rows.push({...item,stock,woe,p,codeValidation:codeCheck.validation,sapName:woe?.description||stock?.name||item.name,microsName:woe?.micros||item.name,totalUse,average,minimum,maximum,orders,days,policy,compostable,daily,weekday,weeks,change:a&&b&&b.average>0?a.average/b.average-1:null,blocked:reasons.length>0,reason:reasons.join(' · '),adjusted:override!==null,unit:p.label});
 }
 if(f.normalizedCups&&d.salesFacts.length&&dates.length){
  const normalized=normalizados(d,{store:f.store,from:dates[0],to:dates.at(-1),week:f.week,weekday:f.weekday});
  const byName=new Map(normalized.cups.filter(c=>c.ready&&c.comparable).map(c=>[normalize(c.name),c]));
  for(const item of rows){const cup=byName.get(normalize(item.name));if(!cup)continue;item.usageSource='Normalizados';item.reportedUse=item.totalUse;item.totalUse=cup.quantity;item.average=cup.quantity/days;if(!item.adjusted)item.minimum=item.average;item.maximum=item.minimum*ORDER_FACTOR[orders];}
 }
 rows.sort((a,b)=>b.average-a.average||a.name.localeCompare(b.name,'es'));
 return {items:rows,days,dates,orders,policy,from:dates[0]||'',to:dates.at(-1)||'',excluded:rows.filter(r=>r.blocked).length,codeVerified:rows.filter(r=>r.woe?.codeVerified).length};
}
export function sleeveFor(item){
 const text=normalize([item?.family,item?.name,item?.sapName,item?.microsName,item?.stock?.name,item?.woe?.description].filter(Boolean).join(' '));
 if(/tapa|lid/.test(text))return {kind:'Tapa',size:100,label:'Manga 100 pzas'};
 if(!/vaso|cup/.test(text))return null;
 const paper20=/(vasodepapel.*20oz|20oz.*vasodepapel|papercup.*20oz|20oz.*papercup)/.test(text);
 const size=paper20?40:50;
 return {kind:'Vaso',size,label:`Manga ${size} pzas`};
}
export function packSizeFor(item){
 for(const value of [item?.p?.stockPack,item?.p?.woePack]){const size=Number(value);if(Number.isFinite(size)&&size>1)return size;}
 return null;
}
export function resolvePresentationMode(item,mode='unit'){
 if(mode==='sleeve'&&sleeveFor(item))return 'sleeve';
 if(mode==='pack'&&packSizeFor(item))return 'pack';
 return 'unit';
}
export function minmaxValues(item,mode='unit'){
 const sleeve=sleeveFor(item),pack=mode==='sleeve'?sleeve?.size:packSizeFor(item);
 if(mode==='unit')return {minimum:item.minimum,maximum:item.maximum,unit:item.unit,packSize:null};
 const label=mode==='sleeve'?sleeve?.label:(item.stock?.pickPack||item.woe?.ump||'Pick Pack sin validar');
 return {minimum:pack?epsCeil(item.minimum/pack):null,maximum:pack?epsCeil(item.maximum/pack):null,unit:label||'Pick Pack sin validar',packSize:pack||null};
}

export function coverageDays(today,end,fraction=1){const a=dateParts(today),b=dateParts(end);if(!a||!b||b.dayMs<a.dayMs||!Number.isFinite(Number(fraction)))return null;const days=(b.dayMs-a.dayMs)/DAY_MS;return days===0?Math.min(0.5,Math.max(0,Number(fraction))):days-0.5+Math.min(1,Math.max(0,Number(fraction)));}
export function nextReception(date,weekdays){const d=dateParts(date);if(!d)return null;for(let offset=1;offset<=7;offset++){const next=dateParts(new Date(d.dayMs+offset*DAY_MS).toISOString().slice(0,10));if(weekdays.includes(next.weekday))return next.dateKey;}return null;}
export function remainingUsageToday(hour,minute=0){const captured=Number(hour)+Number(minute||0)/60;if(captured>=22)return 0;if(captured>=21)return .1;if(captured>=19)return .3;if(captured>=12)return .5;if(captured>=11)return .7;return 1;}
const compactCode=value=>String(value??'').replace(/\D/g,'').replace(/^0+(?=\d)/,'');
const canonicalWoeUnit=value=>{const unit=normalize(value).toUpperCase();if(['CJA','CAJA','CAJ'].includes(unit))return'CAJ';if(['UND','UN','UNIDAD','PIEZA','PIEZAS','PZA','PZ'].includes(unit))return'PZA';if(['PQT','PQTE','PAQUETE','PAQ'].includes(unit))return'PQT';if(['BOT','BOTE','BOTELLA','BTL','BTE'].includes(unit))return'BTE';if(['BOLSA','BSA','BOL'].includes(unit))return'BOL';if(['ROLLO','ROL'].includes(unit))return'ROL';if(['GALON','GAL'].includes(unit))return'GAL';if(['LITRO','LITROS','LT','L'].includes(unit))return'LT';return unit;};
function uniqueCodeIndex(items,field){const index=new Map();for(const item of items){const code=compactCode(field(item));if(!code)continue;if(index.has(code)&&index.get(code)?.key!==item.key)index.set(code,null);else index.set(code,item);}return index;}
export function reconcileTransit(items,orders=[]){
 const bySap=uniqueCodeIndex(items,item=>item.woe?.sap),byDia=uniqueCodeIndex(items,item=>item.woe?.dia),byItem=new Map(),unmatched=[],conflicts=[];let matchedLines=0,matchedUnits=0;
 for(const order of orders){for(const line of order.lines||[]){const sap=compactCode(line.sap),dia=compactCode(line.material),sapItem=sap?bySap.get(sap):null,diaItem=dia?byDia.get(dia):null;
  if(sapItem&&diaItem&&sapItem.key!==diaItem.key){conflicts.push({order,line,reason:'SAP y DIA apuntan a artículos distintos'});continue;}
  const item=sapItem||diaItem;if(!item){unmatched.push({order,line,reason:'Sin coincidencia SAP/DIA'});continue;}
  const expectedSap=compactCode(item.woe?.sap),expectedDia=compactCode(item.woe?.dia);
  if((sap&&expectedSap&&sap!==expectedSap)||(dia&&expectedDia&&dia!==expectedDia)){conflicts.push({order,line,item,reason:'Cruce parcial con códigos contradictorios'});continue;}
  const received=canonicalWoeUnit(line.unit),orderUnit=canonicalWoeUnit(item.woe?.ump),operational=canonicalWoeUnit(item.unit),quantity=numberValue(line.quantity),pack=Math.max(1,Number(item.p?.woePack)||1);let units=null;
  if(quantity!==null&&quantity>=0){if(received&&received===orderUnit)units=Math.ceil(quantity*pack-1e-9);else if(received&&received===operational)units=Math.ceil(quantity-1e-9);else if(received==='PZA')units=Math.ceil(quantity-1e-9);}
  if(units===null){conflicts.push({order,line,item,reason:`Unidad ${line.unit||'—'} incompatible`});continue;}
  const entry={purchaseOrder:order.purchaseOrder,deliveryDate:order.deliveryDate,provider:order.providerAlias||order.provider,quantity:units,sourceQuantity:quantity,sourceUnit:line.unit,sourceName:order.sourceName};
  if(!byItem.has(item.key))byItem.set(item.key,[]);byItem.get(item.key).push(entry);matchedLines++;matchedUnits+=units;
 }}
 return {byItem,matchedLines,matchedUnits,unmatched,conflicts,totalLines:orders.reduce((total,order)=>total+(order.lines?.length||0),0)};
}
export function calculateOrder(item,input={},settings={}){
 const weekdays=(settings.receptions||[]).map(Number),next=weekdays.length?nextReception(settings.delivery,weekdays):null;
 const end=next||settings.delivery,coverage=coverageDays(settings.today,end,settings.fraction??1),stock=numberValue(input.stock),manualTransit=numberValue(input.transit),transits=Array.isArray(input.transits)?input.transits:null;
 const reasons=item.blocked?[item.reason]:[];
 if(!dateParts(settings.today)||!dateParts(settings.delivery)||settings.delivery<settings.today||coverage===null)reasons.push('Define fechas de pedido');
 if(stock===null||stock<0)reasons.push('Captura existencia');
 if(!transits&&((input.transit!==undefined&&input.transit!==null&&input.transit!==''&&manualTransit===null)||(manualTransit!==null&&manualTransit<0)||(manualTransit>0&&(!dateParts(input.transitDate)||input.transitDate<settings.today||input.transitDate>end))))reasons.push('Revisa fecha de tránsito');
 if(transits?.some(entry=>!dateParts(entry.deliveryDate)||numberValue(entry.quantity)===null||Number(entry.quantity)<0))reasons.push('Revisa PDF de tránsito');
 const transit=transits?sum(transits.filter(entry=>entry.deliveryDate>=settings.today&&entry.deliveryDate<=end),entry=>Math.max(0,Number(entry.quantity)||0)):(manualTransit||0);
 const demand=coverage===null?null:Math.max(0,item.minimum)*coverage,available=Math.max(0,stock||0)+(transit||0);
 const missing=demand===null?null:Math.max(0,demand-available),suggested=missing!==null&&item.p.woePack?epsCeil(missing/item.p.woePack):null;
 const captured=numberValue(input.order),quantity=captured===null?suggested:captured;
 if((input.order!==undefined&&input.order!==null&&input.order!==''&&captured===null)||(captured!==null&&(!Number.isInteger(captured)||captured<0||suggested===null||captured>suggested)))reasons.push('Pedido excede sugerido o no es entero');
 return {item,end,coverage,demand,stock,transit:transit||0,transits:transits||[],available,missing,suggested,quantity,blocked:reasons.length>0,reason:reasons.join(' · ')};
}

export function peakHour(d,f={}){
 const facts=filterFacts(d.salesFacts,f),transactions=new Map();
 for(const r of facts){const tx=transactions.get(r.transactionKey);if(!tx||r.ms<tx.ms)transactions.set(r.transactionKey,r);}
 const dates=new Map();for(const tx of transactions.values()){if(!dates.has(tx.dateKey))dates.set(tx.dateKey,Array(48).fill(0));dates.get(tx.dateKey)[tx.slot]++;}
 const days=[...dates.keys()],total=transactions.size;
 const slots=Array.from({length:48},(_,i)=>({slot:i,label:clock(i),total:sum([...dates.values()],r=>r[i]),average:days.length?sum([...dates.values()],r=>r[i])/days.length:null,weekday:DAY_LABELS.map((_,w)=>{const ds=days.filter(day=>dateParts(day).weekday===w);return ds.length?sum(ds,day=>dates.get(day)[i])/ds.length:null;})}));
 function peak(start,end,weekday=null){const ds=days.filter(day=>weekday===null||dateParts(day).weekday===weekday);let best=null;for(let i=start;i<=end-4;i++){const count=sum(ds,day=>sum(dates.get(day).slice(i,i+4),x=>x));if(count>0&&(!best||count>best.total))best={slot:i,label:`${clock(i)} - ${clock(i+4)}`,total:count,average:count/ds.length,days:ds.length};}return best;}
 return {facts,orders:total,sales:sum(facts,'total'),days:days.length,slots,am:peak(0,24),pm:peak(24,48),weekday:DAY_LABELS.map((day,i)=>({day,days:days.filter(d=>dateParts(d).weekday===i).length,am:peak(0,24,i),pm:peak(24,48,i)})),...dateExtent(facts)};
}

// Size rules traced to Detalle_vaso Power Query, Reporte Normalizado_v2.
export const SIZE_RULE={1:'Corto',2:'Alto',3:'Grande',7:'Grande',4:'Venti',8:'Venti',9:'Traveler'};
export function normalizados(d,f={}){
 const facts=filterFacts(d.salesFacts,f),drinks=[],unknown=new Map(),cream={with:0,without:0},groups=new Map();let returns=0;
 for(const r of facts){const name=itemName(d,r),rule=d.drinkRules.get(normalize(name));
  const cr=d.creamRules.get(normalize(name));if(cr!==undefined&&r.adjusted>0&&!r.negative)cream[cr?'with':'without']+=r.adjusted;
  if(r.negative){if(rule)returns+=Math.abs(r.adjusted);continue;}
  if(!(r.adjusted>0))continue;
  if(!rule){const p=d.productCatalog.get(r.product);if(p&&!/complemento|modificador/i.test(p.category)&&/bebida|espresso|frappuccino|cafe|teavana/i.test(p.category))unknown.set(name,(unknown.get(name)||0)+r.adjusted);continue;}
  if(!['Vaso','FHW'].includes(rule.classification))continue;
  const v={...r,name,rule,size:SIZE_RULE[r.priceLevel]||'Sin tamaño',quantity:r.adjusted,count:r.adjusted};
  drinks.push(v);if(!groups.has(r.transactionKey))groups.set(r.transactionKey,[]);groups.get(r.transactionKey).push(v);
 }
 let fhw=0;for(const group of groups.values()){
  // Follow the source compensation order, retaining actual multiple quantities.
  let offset=sum(group.filter(r=>r.rule.classification==='FHW'),'quantity');fhw+=offset;
  for(const r of group.filter(r=>r.rule.classification==='Vaso').sort((a,b)=>Number(a.secDtl)-Number(b.secDtl))){const removed=Math.min(offset,r.count);r.count-=removed;offset-=removed;}
 }
 const sizes=['Corto','Alto','Grande','Venti','Traveler','Sin tamaño'].map(size=>({size,hot:0,cold:0,fhw:0}));
 for(const r of drinks){const v=sizes.find(s=>s.size===r.size);if(r.rule.classification==='FHW')v.fhw+=r.quantity;else if(r.rule.vessel==='1_Caliente')v.hot+=r.count;else if(r.rule.vessel==='2_Helado')v.cold+=r.count;}
 const policy=d.storePolicies.get(f.store),cups=[];
 for(const s of sizes){for(const temp of ['hot','cold']){const quantity=s[temp];if(!quantity)continue;const target=cupTarget(s.size,temp,policy);const woe=target?d.woeCatalog.get(normalize(target)):null;const flag=target?d.compostableCatalog.get(normalize(target)):undefined;
  const conflict=flag!==policy||(woe?.compostable!=null&&woe.compostable!==policy);
  cups.push({size:s.size,temp:temp==='hot'?'Caliente':'Helado',quantity,name:target||'Sin cruce de vaso',sap:woe?.sap||'',dia:woe?.dia||'',ready:!!woe?.sap&&!conflict&&policy!==undefined,reason:policy===undefined?'CeCo sin clasificación':!target?'Sin regla de presentación':!woe?'Sin cruce WOE':!woe.sap?'Sin SAP':conflict?'Conflicto compostable':''});
 }}
 const usage=filterFacts(d.usageFacts,{...f,mode:''}),saleDates=new Set(facts.map(x=>x.dateKey)),usageDates=new Set(usage.map(x=>x.dateKey));
 const aligned=!f.mode&&saleDates.size>0&&saleDates.size===usageDates.size&&[...saleDates].every(day=>usageDates.has(day));
 for(const cup of cups){const matched=usage.filter(x=>normalize(x.name)===normalize(cup.name));cup.comparable=aligned&&matched.length>0&&matched.every(x=>unitSpec(x.unit).dim==='piece');cup.actualUse=cup.comparable?sum(matched,x=>x.use*unitSpec(x.unit).multiplier):null;cup.difference=cup.actualUse===null?null:cup.actualUse-cup.quantity;}
 return {sizes:sizes.filter(s=>s.hot+s.cold+s.fhw>0),cups,cream,fhw,returns,unknown:[...unknown].map(([name,quantity])=>({name,quantity})).sort((a,b)=>b.quantity-a.quantity),drinks,...dateExtent(facts)};
}
// These are explicit inventory names in tbl_clas_compostable, not fuzzy matching.
export function cupTarget(size,temp,policy){
 if(policy===undefined||['Traveler','Sin tamaño'].includes(size))return null;
 const oz={Corto:8,Alto:12,Grande:16,Venti:20}[size];if(!oz)return null;
 if(temp==='hot')return policy?`Vaso Compostable Caliente ${oz} oz`:`Vaso de Papel ${oz} oz`;
 if(size==='Corto')return null;
 return policy?`VASO ${oz===20?22:oz}OZ BEBIDA FRIA ECOCOMPNAL`:`Vaso de Plastico ${oz} oz`;
}
export function topProducts(d,f={},kind='drinks'){
 const facts=filterFacts(d.salesFacts,f),days=[...new Set(facts.map(r=>r.dateKey))],products=new Map();let unmapped=0;
 for(const r of facts){const name=itemName(d,r),food=d.foodRules.get(normalize(name)),drink=d.drinkRules.get(normalize(name));
  const include=kind==='food'?food?.food===true:drink?.classification==='Vaso';
  if(!include){if(!food&&!drink&&d.productCatalog.get(r.product)?.category==='Alimentos')unmapped++;continue;}
  const multiplier=kind==='food'?(food.pieces??1):1,key=kind==='food'?(food.assembly||name):name;
  if(!products.has(key))products.set(key,{name:key,units:0,sales:0,weekday:Array(7).fill(0)});const row=products.get(key);row.units+=r.adjusted*multiplier;row.sales+=r.total;row.weekday[r.weekday]+=r.adjusted*multiplier;
 }
 const rows=[...products.values()].filter(r=>r.units>0).sort((a,b)=>b.units-a.units);const units=sum(rows,'units');
 return {items:rows.map(r=>({...r,share:units?r.units/units:0})),units,sales:sum(rows,'sales'),days:days.length,unmapped,...dateExtent(facts)};
}

export function assemblyProjection(d,f={}){
 const facts=filterFacts(d.salesFacts,f),dates=[...new Set(facts.map(row=>row.dateKey))].sort(),days=dates.length,products=new Map();
 const sourceRules=[...d.foodRules.values()].filter(rule=>rule.assemblyEnabled&&rule.assembly);
 for(const rule of sourceRules){
  const key=normalize(rule.assembly),recipe=assemblyRecipe(rule.assembly);
  if(!products.has(key))products.set(key,{key,name:recipe?.name||rule.assembly,recipe:recipe?{...recipe,rule:rule.ingredient||recipe.rule}:null,sources:new Set(),slots:Array(48).fill(0),historical:0});
  products.get(key).sources.add(rule.item);
 }
 let returns=0,unmapped=0;
 for(const row of facts){
  const name=itemName(d,row),rule=d.foodRules.get(normalize(name));
  if(!rule?.assemblyEnabled||!rule.assembly)continue;
  const target=products.get(normalize(rule.assembly));if(!target){unmapped++;continue;}target.sources.add(name);
  if(row.adjusted<0||row.negative){returns+=Math.abs(row.adjusted||0);continue;}
  const quantity=Math.max(0,row.adjusted)*(rule.pieces??1);target.slots[row.slot]+=quantity;target.historical+=quantity;
 }
 const rows=[...products.values()].map(product=>{
  const slotPlan=product.slots.map(total=>({total,expected:days?total/days:null,prepare:days&&total>0?epsCeil(total/days):0})),plan=sum(slotPlan,'prepare'),average=days?product.historical/days:null;
  return {...product,sources:[...product.sources].filter(Boolean).sort((a,b)=>a.localeCompare(b,'es')),slots:slotPlan,plan,average,ingredients:projectedIngredients(product.recipe,plan)};
 }).sort((a,b)=>a.name.localeCompare(b.name,'es'));
 const slots=Array.from({length:48},(_,slot)=>{const items=rows.map(product=>({key:product.key,name:product.name,...product.slots[slot]})),expected=sum(items,'expected'),prepare=sum(items,'prepare');return {slot,label:`${clock(slot)} - ${clock(slot+1)}`,items,expected,prepare};});
 const activeSlots=slots.filter(slot=>slot.prepare>0),peak=activeSlots.reduce((best,slot)=>!best||slot.prepare>best.prepare||slot.prepare===best.prepare&&slot.expected>best.expected?slot:best,null);
 return {products:rows,slots,activeSlots,days,dates,weeks:new Set(dates.map(weekKey)).size,average:days?sum(rows,'historical')/days:null,planned:sum(rows,'plan'),peak,returns,unmapped,sourceRules:sourceRules.length,recipesReady:rows.filter(product=>product.recipe).length,...dateExtent(facts)};
}

export function bakingForecast(d,f={},inputs={},settings={}){
 const target=dateParts(settings.date),start=Number(settings.slot??0),facts=filterFacts(d.salesFacts,{...f,weekday:''});
 if(!target)return {items:[],groups:[],days:0,reason:'Selecciona fecha de horneo'};
 const history=facts.filter(r=>r.dayMs<target.dayMs&&r.weekday===target.weekday),days=[...new Set(history.map(r=>r.dateKey))].sort().slice(-4),included=new Set(days);
 const values=new Map();for(const r of history){if(!included.has(r.dateKey)||r.slot<start)continue;const rule=d.foodRules.get(normalize(itemName(d,r)));if(!rule?.bis||!rule.bakingName)continue;const key=normalize(rule.bakingName);if(!values.has(key))values.set(key,0);values.set(key,values.get(key)+r.adjusted*(rule.pieces??1));}
 const items=[];for(const [key,param]of d.bakingCatalog){const total=values.get(key);if(!(total>0))continue;const forecast=days.length?total/days.length:null,input=inputs[key],stock=numberValue(input?.stock),need=stock!==null&&stock>=0&&forecast!==null?Math.max(0,epsCeil(forecast-stock)):null;items.push({...param,key,forecast,stock,need,trays:need!==null?epsCeil(need/param.maxTray):null,groupKey:normalize(param.group)==='individual'?key:param.group});}
 const grouped=new Map();for(const r of items){if(!grouped.has(r.groupKey))grouped.set(r.groupKey,{name:r.groupKey===r.key?r.product:r.group,capacity:r.maxTray,need:0,missing:false,products:[]});const g=grouped.get(r.groupKey);g.need+=r.need||0;g.missing||=r.need===null||r.maxTray!==g.capacity;g.products.push(r.product);}
 return {items,groups:[...grouped.values()].map(g=>({...g,need:g.missing?null:g.need,trays:g.missing?null:epsCeil(g.need/g.capacity)})),days:days.length,dates:days,date:settings.date,slot:start,weekday:DAY_LABELS[target.weekday],reason:days.length?'':'Sin días comparables anteriores'};
}

export function auditStore(d,f={}){
 const tickets=filterFacts(d.auditTickets,f),voids=filterFacts(d.auditVoids,f),payments=filterFacts(d.auditPayments,f),byTicket=new Map();
 for(const r of [...tickets.filter(t=>t.total<0),...voids]){if(!byTicket.has(r.ticketKey))byTicket.set(r.ticketKey,{key:r.ticketKey,ticket:r.ticket,date:r.dateKey,negative:null,voidAmount:0,reasons:new Set(),employees:new Set(),payments:[],unapproved:false});const row=byTicket.get(r.ticketKey);if(r.total<0&&tickets.includes(r))row.negative=r.total;}
 for(const r of voids){const row=byTicket.get(r.ticketKey);row.voidAmount+=Math.abs(Math.min(0,r.total));row.reasons.add(r.reason);if(r.employee)row.employees.add(r.employee);if(!r.manager||['na','0'].includes(normalize(r.manager)))row.unapproved=true;}
 for(const r of payments){const row=byTicket.get(r.ticketKey);if(row)row.payments.push({name:r.payment,amount:r.amount});}
 const rows=[...byTicket.values()].map(r=>({...r,reasons:[...r.reasons],employees:[...r.employees],amount:r.negative!==null?Math.abs(r.negative):r.voidAmount,review:!r.reasons.size?'Sin motivo registrado':r.unapproved?'Sin gerente registrado':r.reasons.has('Otros')?'Revisar motivo Otros':'Validar soporte'})).sort((a,b)=>Number(b.negative!==null)-Number(a.negative!==null)||b.amount-a.amount);
 return {items:rows,negativeCount:rows.filter(r=>r.negative!==null).length,negativeAmount:sum(rows.filter(r=>r.negative!==null),'amount'),voidCount:new Set(voids.map(r=>r.ticketKey)).size,pending:rows.filter(r=>r.unapproved||!r.reasons.length).length,...dateExtent([...tickets,...voids,...payments])};
}

export function reportFor(module,result,context={}){
 const name=MODULES.find(m=>m.id===module)?.name||module,title=name+(context.subtab?` · ${context.subtab}`:''),r=result;
 const report={title,store:context.store||'',period:shortPeriod(r.from,r.to),filters:context.filterLabel||'',summary:[],sheets:[]};
 const sheet=(name,headers,rows)=>report.sheets.push({name,headers,rows});
 if(module==='maxmin'){
  const selected=new Set(context.selectedKeys||[]),items=selected.size?r.items.filter(i=>selected.has(i.key)):[],priority=new Map(r.items.map((i,index)=>[i.key,index+1]));
  report.layout=context.outputView==='list'?'maxmin-list':'labels';report.hideSummary=true;report.operationalHeader=true;report.orders=r.orders;report.summary=[['Productos seleccionados',items.length],['Días observados',r.days],['Pedidos por semana',r.orders]];
  const cards=items.map(i=>{const mode=resolvePresentationMode(i,context.modes?.[i.key]||context.mode||'unit'),c=minmaxValues(i,mode),piecesPerCase=mode==='sleeve'?sleeveFor(i)?.size:mode==='pack'?packSizeFor(i):null;return {...c,name:i.sapName,sapName:i.sapName,microsName:i.microsName,sap:i.woe?.sap||'',dia:i.woe?.dia||'',daily:i.minimum,mode,orders:r.orders,priority:priority.get(i.key),piecesPerCase,adjusted:i.adjusted};});
  if(report.layout==='labels')report.cards=cards;
  else report.listCards=cards.map((card,index)=>({...card,priority:priority.get(items[index].key),family:items[index].family}));
  report.sheets.push({name:'Uso Unidad',headers:['Descripción SAP','Nombre Micros','#DIA','#SAP','Min','Max','Unidad / Pick Pack','Pz / Caja','# Pedido'],rows:items.map(i=>[i.sapName,i.microsName,i.woe?.dia||'',i.woe?.sap||'',Number(i.minimum.toFixed(1)),Number(i.maximum.toFixed(1)),'Unidad','',r.orders]),formats:[null,null,null,null,'oneDecimal','oneDecimal',null,'integer','integer'],widths:[38,32,14,14,12,12,22,14,13]});
  const packRows=[];
  for(const i of items){
   const base={name:i.sapName,micros:i.microsName,sap:i.woe?.sap||'',dia:i.woe?.dia||'',orders:r.orders},pack=minmaxValues(i,'pack'),candidates=pack.packSize?[{format:'Pick Pack',values:pack}]:[];
   const sleeve=sleeveFor(i);if(sleeve&&sleeve.size!==pack.packSize)candidates.push({format:'Manga',values:minmaxValues(i,'sleeve')});
   for(const candidate of candidates){const c=candidate.values;packRows.push([base.name,base.micros,base.dia,base.sap,c.minimum??'',c.maximum??'',candidate.format,c.packSize||'',base.orders]);}
  }
  report.sheets.push({name:'Pick Pack',headers:['Descripción SAP','Nombre Micros','#DIA','#SAP','Min','Max','Unidad / Pick Pack','Pz / Caja','# Pedido'],rows:packRows,formats:[null,null,null,null,'integer','integer',null,'integer','integer'],widths:[38,32,14,14,12,12,22,14,13]});
 }
 if(module==='trend'){
  const focus=r.items.find(i=>String(i.id)===String(context.selectedItem))||r.items[0];report.hideSummary=true;report.operationalHeader=true;report.orders=r.orders;report.summary=[];
  if(focus){report.focusName=focus.sapName;report.filters=[`Producto: ${focus.sapName}`,report.filters].filter(Boolean).join(' · ');sheet('Tendencia semanal',['Semana','Días observados','Promedio diario'],focus.weeks.map(w=>[`${shortDate(w.week)} - ${shortDate(new Date(dateParts(w.week).dayMs+6*DAY_MS).toISOString().slice(0,10))}`,w.days,w.average]));sheet('Promedio por día',['Día','Días observados','Promedio diario'],focus.weekday.map(day=>[day.name,day.days,day.average]));}
  sheet('Uso por producto',['Descripción SAP','Nombre Micros','#DIA','#SAP','Unidad','Uso total','Promedio diario'],r.items.map(i=>[i.sapName,i.microsName,i.woe?.dia||'',i.woe?.sap||'',i.unit,i.totalUse,i.average]));
 }
 if(module==='order'){
  const reviewed=(context.orders||[]).filter(x=>x.stock!==null&&x.stock>=0),ready=reviewed.filter(x=>!x.blocked&&x.quantity>0),transitOrders=context.transitOrders||[],audit=context.transitAudit||{unmatched:[],conflicts:[]},settings=context.orderSettings||{};
  report.layout='order-woe';report.hideSummary=true;report.operationalHeader=true;report.generatedAt=settings.today||new Date().toISOString().slice(0,10);report.period=settings.today&&settings.delivery?`${shortDate(settings.today)} - ${shortDate(settings.delivery)}`:shortPeriod(r.from,r.to);report.orders=`${ready.length} art. · ${sum(ready,'quantity')} uds.`;report.summary=[['Artículos revisados',reviewed.length],['Artículos por pedir',ready.length],['Unidades WOE',sum(ready,'quantity')]];
  report.transitColumns=transitOrders.map(order=>({key:String(order.purchaseOrder),deliveryDate:order.deliveryDate,purchaseOrder:String(order.purchaseOrder),provider:order.providerAlias||order.provider}));
  report.orderRows=reviewed.map(x=>{const transitByOrder=Object.fromEntries(report.transitColumns.map(column=>[column.key,sum(x.transits.filter(entry=>String(entry.purchaseOrder)===column.key),'quantity')]));return {sap:x.item.woe?.sap||'',dia:x.item.woe?.dia||'',sapDescription:x.item.sapName||x.item.name,microsDescription:x.item.microsName||x.item.name,stock:x.stock,transitByOrder,quantity:x.blocked?'—':x.quantity??0,quantityLabel:x.blocked?'REVISAR':`${x.quantity??0} ${x.item.woe?.ump||'Unidad'}`,status:x.blocked?x.reason:x.quantity>0?'Por pedir':'Sin pedido',unit:x.item.woe?.ump||'',operationalUnit:x.item.unit||'PZA',coverageEnd:x.end};});
  const transitHeaders=report.transitColumns.map(column=>`Tránsito ${shortDate(column.deliveryDate)} #${column.purchaseOrder.slice(-6)}`);
  report.sheets.push({name:'Pedido WOE',headers:['#SAP','#DIA','Descripción SAP','Nombre Micros',...transitHeaders,'Existencia física','Cantidad a pedir','Unidad WOE','Estado'],rows:report.orderRows.map(row=>[row.sap,row.dia,row.sapDescription,row.microsDescription,...report.transitColumns.map(column=>row.transitByOrder[column.key]||0),row.stock,typeof row.quantity==='number'?row.quantity:'',row.unit,row.status]),formats:[null,null,null,null,...report.transitColumns.map(()=> 'oneDecimal'),'oneDecimal','integer',null,null],widths:[14,14,34,30,...report.transitColumns.map(()=>18),17,17,15,28]});
  if(transitOrders.length)sheet('Pedidos en tránsito',['Núm. pedido','Entrega','Proveedor','Archivo','Líneas'],transitOrders.map(order=>[order.purchaseOrder,order.deliveryDate,order.providerAlias||order.provider,order.sourceName,order.lines?.length||0]));
  const issues=[...(audit.conflicts||[]),...(audit.unmatched||[])];if(issues.length)sheet('Cruces por revisar',['Núm. pedido','Entrega','#DIA / Material','#SAP','Descripción PDF','Cantidad','Unidad','Motivo'],issues.map(issue=>[issue.order.purchaseOrder,issue.order.deliveryDate,issue.line.material,issue.line.sap,issue.line.description,issue.line.quantity,issue.line.unit,issue.reason]));
 }
 if(module==='peak'){report.summary=[['Órdenes',r.orders],['Días observados',r.days],['Peak AM',r.am?.label||'Sin demanda'],['Promedio AM',r.am?.average??null],['Peak PM',r.pm?.label||'Sin demanda'],['Promedio PM',r.pm?.average??null]];sheet('Medias horas',['Franja','Órdenes totales','Promedio',...DAY_LABELS],r.slots.map(x=>[x.label,x.total,x.average,...x.weekday]));sheet('Días comparables',['Día','Días','Peak AM','Promedio AM','Peak PM','Promedio PM'],r.weekday.map(x=>[x.day,x.days,x.am?.label||'',x.am?.average??null,x.pm?.label||'',x.pm?.average??null]));}
 if(module==='normal'){
  report.summary=[['Bebidas en vaso',sum(r.sizes,x=>x.hot+x.cold)],['FHW (sin desechable)',r.fhw],['Devoluciones separadas',r.returns],['Productos sin regla',r.unknown.length]];
  if(context.subtab==='Crema batida')sheet('Crema batida',['Indicación registrada','Cantidad'],[['Con crema',r.cream.with],['Sin crema',r.cream.without]]);
  else if(context.subtab==='Vasos y tapas')sheet('Vasos',['Tamaño','Tipo','Bebidas = vasos','Uso ideal reportado','Diferencia','Artículo aplicable','SAP','Validación'],r.cups.map(x=>[x.size,x.temp,x.quantity,x.actualUse,x.difference,x.name,x.sap,x.ready?'Validado':x.reason]));
  else sheet('Tamaños',['Tamaño','Calientes','Heladas','FHW'],r.sizes.map(x=>[x.size,x.hot,x.cold,x.fhw]));
  if(r.unknown.length)sheet('Sin regla',['Producto','Cantidad'],r.unknown.map(x=>[x.name,x.quantity]));
 }
 if(module==='top'){report.summary=[['Unidades netas',r.units],['Venta',r.sales]];sheet(context.subtab||'Ranking',['Producto','Unidades','Participación',...DAY_LABELS,'Venta'],r.items.map(x=>[x.name,x.units,x.share,...x.weekday,x.sales]));}
 if(module==='assembly'){
  report.layout='assembly-plan';report.hideSummary=true;report.operationalHeader=true;report.summary=[['Días comparables',r.days],['Productos de ensamble',r.products.length],['Promedio diario',r.average],['Plan por franjas',r.planned]];
  report.assemblyProducts=r.products;report.assemblySlots=r.activeSlots;
  sheet('Plan media hora',['Franja','Total a preparar',...r.products.map(product=>product.name)],r.activeSlots.map(slot=>[slot.label,slot.prepare,...slot.items.map(item=>item.prepare)]));
  const ingredientRows=[];for(const product of r.products){if(product.recipe?.packaged)ingredientRows.push([product.name,product.plan,'Viene empaquetada','','',product.recipe.rule]);else for(const ingredient of product.ingredients)ingredientRows.push([product.name,product.plan,ingredient.name,ingredient.totalUnits,ingredient.unit,ingredient.totalGrams,product.recipe?.rule||'Receta pendiente']);}
  report.assemblyIngredients=ingredientRows;
  report.sheets.push({name:'Ingredientes',headers:['Ensamble','Plan del día','Ingrediente','Cantidad','Unidad','Peso estimado (g)','Regla por producto'],rows:ingredientRows,formats:[null,'integer',null,'integer',null,'integer',null],widths:[30,14,20,12,20,19,54]});
  report.sheets.push({name:'Trazabilidad',headers:['Nombre unificado','Productos MICROS de origen','Venta histórica','Promedio diario','Plan por franjas','Regla validada'],rows:r.products.map(product=>[product.name,product.sources.join(', '),product.historical,product.average,product.plan,product.recipe?.rule||'Pendiente']),formats:[null,null,'oneDecimal','oneDecimal','integer',null],widths:[30,55,17,17,18,55]});
 }
 if(module==='baking'){report.period=shortDate(r.date);report.summary=[['Día comparable',r.weekday],['Días de referencia',r.days],['Desde',clock(r.slot)],['Referencia',r.dates?.map(shortDate).join(', ')||'Sin historial']];sheet('Previsión',['Producto','Previsto restante','Ya horneado','Por hornear','Capacidad por charola','Horneo','Temperatura'],r.items.map(x=>[x.product,x.forecast,x.stock,x.need,x.maxTray,x.bake,x.temperature]));sheet('Tandas',['Grupo','Productos','Piezas','Charolas combinadas'],r.groups.map(x=>[x.name,x.products.join(', '),x.need,x.trays]));}
 if(module==='audit'){report.summary=[['Órdenes negativas',r.negativeCount],['Importe negativo',r.negativeAmount],['Tickets con void',r.voidCount],['Sin soporte completo',r.pending]];sheet('Revisión',['Fecha','Ticket','Importe a revisar','Motivo','Pago asociado','Revisión'],r.items.map(x=>[x.date,x.ticket,x.amount,x.reasons.join(', '),x.payments.map(p=>p.name).join(', '),x.review]));}
 return report;
}
