import {normalize,numberValue,DAY_LABELS,DAY_MS,dateParts,dateExtent,weekKey,shortDate,shortPeriod} from './engine.mjs';
import {assemblyRecipe,projectedIngredients} from './assembly.mjs';
import {CYCLE_TASKS} from './cycle-tasks.mjs';

export const ORDER_FACTOR={2:5,3:4,4:3,5:2};
export function providerAlias(value){
 const text=normalize(value);
 if(text.includes('cafesirena')||text.includes('maquila'))return'Maquila';
 if(text.includes('comercializadoradelacteos')||text.includes('lala'))return'LALA';
 return'DIA';
}
export const MODULES=[
 {id:'maxmin',name:'Max & Min',caption:'Mínimos, máximos y etiquetas',icon:'▦',type:'usage'},
 {id:'trend',name:'Tendencia de uso',caption:'Uso por semana y día',icon:'↗',type:'usage'},
 {id:'order',name:'Pedido WOE',caption:'Existencia y pedido',icon:'▤',type:'usage'},
 {id:'peak',name:'Peak Hour',caption:'Objetivo por media hora',icon:'◷',type:'sales'},
 {id:'normal',name:'Normalizados',caption:'Vasos, FHW y crema',icon:'◉',type:'sales'},
 {id:'assembly',name:'Ensamble',caption:'Preparación por media hora',icon:'◈',type:'sales'},
 {id:'baking',name:'Bitácora de horneo',caption:'Qué hornear y cuándo',icon:'♨',type:'sales'},
 {id:'top',name:'Top Bebidas & Alimentos',caption:'Ranking, mezcla y esfuerzo',icon:'≡',type:'sales'},
 {id:'effort',name:'Esfuerzo Operativo',caption:'Cake Pop y Dona G&G',icon:'◆',type:'sales',embedded:'top'},
 {id:'audit',name:'Voids · Auditoría',caption:'Voids y detalle por ticket',icon:'◇',type:'audit'},
];
export function availableModules(d){return MODULES.filter(m=>!m.embedded).filter(m=>m.type==='audit'?['auditTicket','auditVoid','auditLegacy'].some(type=>d.sourceTypes.has(type)):m.type==='usage'?d.usageFacts.length:d.salesFacts.length&&(m.id==='peak'||d.productCatalog.size));}
export function filterFacts(facts,f={}){
 const weeks=Array.isArray(f.weeks)?f.weeks.filter(Boolean):[],weekdays=Array.isArray(f.weekdays)?f.weekdays.filter(v=>v!==''&&v!=null).map(Number):[],modes=Array.isArray(f.modes)?f.modes.filter(Boolean):[];
 return facts.filter(r=>(!f.store||r.store===f.store)&&(!f.from||r.dateKey>=f.from)&&(!f.to||r.dateKey<=f.to)&&(!f.week||weekKey(r.dateKey)===f.week)&&(!weeks.length||weeks.includes(weekKey(r.dateKey)))&&(f.weekday==null||f.weekday===''||r.weekday===Number(f.weekday))&&(!weekdays.length||weekdays.includes(r.weekday))&&(!f.mode||r.mode===f.mode)&&(!modes.length||modes.includes(r.mode)));
}
export const sum=(a,key)=>a.reduce((s,r)=>s+(typeof key==='function'?key(r):r[key]||0),0);
export const clock=slot=>`${String(Math.floor(slot/2)).padStart(2,'0')}:${slot%2?'30':'00'}`;
const epsCeil=v=>Math.ceil(v-0.00001);
export function cycleFrequency(value){const orders=Number(value);if(!Number.isFinite(orders)||orders<=0)return null;if(orders>=36)return 8;if(orders>=26)return 12;if(orders>=11)return 20;return 30;}
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
export function usageUnitLabel(value){
 const source=String(value??'').trim().replace(/\s+/g,' ');
 if(!source)return'Sin unidad';
 const detail=source.replace(/^[A-Z0-9]{2,6}\s*:\s*/i,'').trim();
 return (detail||source.replace(/:\s*$/,'').trim())||'Sin unidad';
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
  const codeCheck=resolveInventoryCodes(d,item,d.woeCatalog.get(normalize(item.name))),woe=codeCheck.woe,providerSource=woe?.provider||d.microsCatalog?.get(normalize(item.name))?.provider||'',provider=providerAlias(providerSource),p=presentation(item,stock,woe);
  const families=Array.isArray(f.families)?f.families.filter(Boolean):[];
  if(f.provider&&provider!==providerAlias(f.provider))continue;
  if(f.family&&item.family!==f.family)continue;
  if(families.length&&!families.includes(item.family))continue;
  const searchText=normalize([item.name,stock?.name,woe?.micros,woe?.description,woe?.sap,woe?.dia,providerSource,provider].filter(Boolean).join(' '));
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
  rows.push({...item,stock,woe,provider,p,codeValidation:codeCheck.validation,sapName:woe?.description||stock?.name||item.name,microsName:woe?.micros||item.name,totalUse,average,minimum,maximum,orders,days,policy,compostable,daily,weekday,weeks,change:a&&b&&b.average>0?a.average/b.average-1:null,blocked:reasons.length>0,reason:reasons.join(' · '),adjusted:override!==null,usageUnit:item.unitConflict?'Unidades mezcladas':usageUnitLabel(item.unit),unit:p.label});
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
export function availableOrderDates(today,weekdays=[],transitOrders=[],limit=8){
 const start=dateParts(today),active=new Set((Array.isArray(weekdays)?weekdays:[]).map(Number).filter(day=>Number.isInteger(day)&&day>=0&&day<7)),maximum=Math.min(16,Math.max(0,Number(limit)||0));
 if(!start||!active.size||!maximum)return[];
 const occupied=new Set((Array.isArray(transitOrders)?transitOrders:[]).map(order=>order?.deliveryDate).filter(date=>dateParts(date)&&date>=today)),available=[];
 for(let offset=1;offset<=112&&available.length<maximum;offset++){const candidate=dateParts(new Date(start.dayMs+offset*DAY_MS).toISOString().slice(0,10));if(active.has(candidate.weekday)&&!occupied.has(candidate.dateKey))available.push(candidate.dateKey);}
 return available;
}
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
 const activeSlots=slots.filter(slot=>slot.total>0).map(slot=>{const cycleMinutes=cycleFrequency(slot.average),tasks=CYCLE_TASKS[String(cycleMinutes)]||[];return{...slot,period:slot.slot<28?'AM':'PM',cycleMinutes,cycleTask:tasks.length?tasks[slot.slot%tasks.length]:''};});
 const cycleSummary=[30,20,12,8].map(minutes=>({minutes,count:activeSlots.filter(slot=>slot.cycleMinutes===minutes).length}));
 function peak(start,end,weekday=null){const ds=days.filter(day=>weekday===null||dateParts(day).weekday===weekday);let best=null;for(let i=start;i<=end-4;i++){const count=sum(ds,day=>sum(dates.get(day).slice(i,i+4),x=>x));if(count>0&&(!best||count>best.total))best={slot:i,label:`${clock(i)} - ${clock(i+4)}`,total:count,average:count/ds.length,days:ds.length};}return best?{...best,target:epsCeil(best.average+5),push:5}:null;}
 return {facts,orders:total,sales:sum(facts,'total'),days:days.length,slots,activeSlots,cycleSummary,am:peak(0,28),pm:peak(28,48),weekday:DAY_LABELS.map((day,i)=>({day,days:days.filter(d=>dateParts(d).weekday===i).length,am:peak(0,28,i),pm:peak(28,48,i)})),...dateExtent(facts)};
}

// Size rules traced to Detalle_vaso Power Query, Reporte Normalizado_v2.
export const SIZE_RULE={1:'Corto',2:'Alto',3:'Grande',7:'Grande',4:'Venti',8:'Venti',9:'Traveler'};
const PREPARED_BEVERAGE_FAMILY=/espresso|frappuccino|starbucksconhielo|starbuckstea|alternativas?alcafe|cafeclasico/;
const RTD_FAMILY=/bebidas?frias?|readytodrink|rtd|embotellad|envasad/;
const COLD_DRINK_HINT=/(^hel|helado|iced|frozen|frapp|coldbrew|shake|refresher|dragon|acai|lemr|pink|lemonade|lath$|latteh$|crm?f$|creamf$)/;
const NON_DRINK_NAME=/(^cf.*(?:cb|lh|sr)$|^cfpumpkin|^cfmaple|^agua|evian|aranch?iatta|aranciata|coldfoam|cremafria|bundle|bndl|contigo|bakery|pastel|crois|pancho|pavpan|salty)/;
const FHW_NAMES=new Set(['vasovidrio','vasovidrion','tazabebidacal']);
const HOT_RULE_OVERRIDES=new Set(['latte']);
const lobbyChannel=mode=>normalize(mode)==='starbuckscoffee';

// The product subcategory decides whether an item is a prepared beverage.
// Name conventions only decide hot/cold after that gate, never whether an RTD
// bottle should consume a cup.
export function inferDrinkRule(name,product={}){
 const key=normalize(name),raw=String(name||''),family=normalize(product.family),category=normalize(product.category);
 if(FHW_NAMES.has(key))return {candidate:true,auto:true,explicit:true,classification:'FHW',vessel:'3_FHW',reason:'Presentación FHW explícita'};
 if(RTD_FAMILY.test(family)||NON_DRINK_NAME.test(key))return {candidate:true,auto:true,explicit:true,classification:'No',vessel:'Na',reason:RTD_FAMILY.test(family)?'RTD / bebida envasada':'Adicional; no consume vaso'};
 const prepared=PREPARED_BEVERAGE_FAMILY.test(family)&&(!category||/bebida/.test(category));
 if(!prepared)return {candidate:false,auto:false,explicit:false,classification:'',vessel:'',reason:'Fuera de bebidas preparadas'};
 const cold=COLD_DRINK_HINT.test(key)||/(^|\W)f(\W|$)/i.test(raw)||/frappuccino|starbucksconhielo/.test(family);
 return {candidate:true,auto:true,explicit:cold||HOT_RULE_OVERRIDES.has(key),classification:'Vaso',vessel:cold?'2_Helado':'1_Caliente',reason:cold?'Nombre o subcategoría de bebida helada':'Bebida preparada sin marca Hel/F; se trata como caliente'};
}

function resolvedDrinkRule(d,name,product){
 const stored=d.drinkRules.get(normalize(name)),inferred=inferDrinkRule(name,product);
 if(!stored)return inferred.classification?{rule:{classification:inferred.classification,vessel:inferred.vessel},source:'Automática',reason:inferred.reason,candidate:inferred.candidate}: {rule:null,source:'Pendiente',reason:inferred.reason,candidate:inferred.candidate};
 // Strong conventions correct stale hot/cold rows in the tbl while the Python
 // updater writes the same correction back to the next workbook version.
 if(inferred.auto&&inferred.explicit&&stored.classification==='Vaso'&&inferred.classification!==''&&(stored.classification!==inferred.classification||stored.vessel!==inferred.vessel))return {rule:{classification:inferred.classification,vessel:inferred.vessel},source:'Corregida',reason:inferred.reason,candidate:true,stored};
 return {rule:stored,source:'tbl',reason:'Regla exacta cargada',candidate:true};
}

export function normalizados(d,f={}){
 const facts=filterFacts(d.salesFacts,f),drinks=[],pending=new Map(),inferredRows=new Map(),excludedRows=new Map(),cream={with:0,without:0},groups=new Map();let returns=0;
 for(const r of facts){const name=itemName(d,r),product=d.productCatalog.get(r.product)||{},resolution=resolvedDrinkRule(d,name,product),rule=resolution.rule;
  const cr=d.creamRules.get(normalize(name));if(cr!==undefined&&r.adjusted>0&&!r.negative)cream[cr?'with':'without']+=r.adjusted;
  if(r.negative){if(rule)returns+=Math.abs(r.adjusted);continue;}
  if(!(r.adjusted>0))continue;
  if(!rule){if(resolution.candidate){const current=pending.get(normalize(name))||{name,family:product.family||'',category:product.category||'',quantity:0,reason:resolution.reason};current.quantity+=r.adjusted;pending.set(normalize(name),current);}continue;}
  if(rule.classification==='No'){
   if(resolution.source!=='tbl'){const current=excludedRows.get(normalize(name))||{name,family:product.family||'',quantity:0,reason:resolution.reason};current.quantity+=r.adjusted;excludedRows.set(normalize(name),current);}
   continue;
  }
  if(!['Vaso','FHW'].includes(rule.classification))continue;
  const v={...r,name,product,rule,ruleSource:resolution.source,ruleReason:resolution.reason,size:SIZE_RULE[r.priceLevel]||'Sin tamaño',quantity:r.adjusted,count:r.adjusted,fhwCount:0};
  drinks.push(v);const momentKey=`${r.transactionKey}|${r.ms}`;if(!groups.has(momentKey))groups.set(momentKey,[]);groups.get(momentKey).push(v);
  if(resolution.source!=='tbl'){const current=inferredRows.get(normalize(name))||{name,family:product.family||'',quantity:0,classification:rule.classification,vessel:rule.vessel,source:resolution.source,reason:resolution.reason};current.quantity+=r.adjusted;inferredRows.set(normalize(name),current);}
 }
 const fhwSources=new Map(),dateStats=new Map();let fhw=0,fhwSignals=0,fhwUnmatched=0,fhwTickets=0,lobbyBeverages=0;
 for(const r of drinks.filter(r=>r.rule.classification==='Vaso'&&lobbyChannel(r.mode))){lobbyBeverages+=r.quantity;const stat=dateStats.get(r.dateKey)||{date:r.dateKey,weekday:r.weekday,fhw:0,beverages:0};stat.beverages+=r.quantity;dateStats.set(r.dateKey,stat);}
 for(const group of groups.values()){
  const markers=group.filter(r=>r.rule.classification==='FHW'&&lobbyChannel(r.mode)),eligible=group.filter(r=>r.rule.classification==='Vaso'&&lobbyChannel(r.mode)).sort((a,b)=>Number(a.secDtl)-Number(b.secDtl));
  let offset=sum(markers,'quantity');if(offset>0)fhwTickets++;
  for(const marker of markers){fhwSignals+=marker.quantity;const current=fhwSources.get(marker.name)||{name:marker.name,quantity:0};current.quantity+=marker.quantity;fhwSources.set(marker.name,current);}
  for(const r of eligible){if(!(offset>0))break;const removed=Math.min(offset,r.count);r.count-=removed;r.fhwCount+=removed;offset-=removed;fhw+=removed;const stat=dateStats.get(r.dateKey);if(stat)stat.fhw+=removed;}
  fhwUnmatched+=offset;
 }
 const sizes=['Corto','Alto','Grande','Venti','Traveler','Sin tamaño'].map(size=>({size,hot:0,cold:0,fhw:0}));
 for(const r of drinks.filter(r=>r.rule.classification==='Vaso')){const v=sizes.find(s=>s.size===r.size);v.fhw+=r.fhwCount;if(r.rule.vessel==='1_Caliente')v.hot+=r.count;else if(r.rule.vessel==='2_Helado')v.cold+=r.count;}
 const preparedBeverages=sum(sizes,s=>s.hot+s.cold+s.fhw);for(const s of sizes){s.total=s.hot+s.cold+s.fhw;s.share=preparedBeverages?s.total/preparedBeverages:0;s.fhwRate=s.total?s.fhw/s.total:null;}
 const policy=d.storePolicies.get(f.store),cups=[];
 for(const s of sizes){for(const temp of ['hot','cold']){const quantity=s[temp];if(!quantity)continue;const target=cupTarget(s.size,temp,policy);const woe=target?d.woeCatalog.get(normalize(target)):null;const flag=target?d.compostableCatalog.get(normalize(target)):undefined;
  const conflict=flag!==policy||(woe?.compostable!=null&&woe.compostable!==policy);
  cups.push({size:s.size,temp:temp==='hot'?'Caliente':'Helado',quantity,name:target||'Sin cruce de vaso',sap:woe?.sap||'',dia:woe?.dia||'',ready:!!woe?.sap&&!conflict&&policy!==undefined,reason:policy===undefined?'CeCo sin clasificación':!target?'Sin regla de presentación':!woe?'Sin cruce WOE':!woe.sap?'Sin SAP':conflict?'Conflicto compostable':''});
 }}
 const usage=filterFacts(d.usageFacts,{...f,mode:''}),saleDates=new Set(facts.map(x=>x.dateKey)),usageDates=new Set(usage.map(x=>x.dateKey));
 const aligned=!f.mode&&!(f.modes||[]).length&&saleDates.size>0&&saleDates.size===usageDates.size&&[...saleDates].every(day=>usageDates.has(day));
 for(const cup of cups){const matched=usage.filter(x=>normalize(x.name)===normalize(cup.name));cup.comparable=aligned&&matched.length>0&&matched.every(x=>unitSpec(x.unit).dim==='piece');cup.actualUse=cup.comparable?sum(matched,x=>x.use*unitSpec(x.unit).multiplier):null;cup.difference=cup.actualUse===null?null:cup.actualUse-cup.quantity;}
 const fhwDates=[...dateStats.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(x=>({...x,rate:x.beverages?x.fhw/x.beverages:null}));
 const fhwWeekdays=DAY_LABELS.map((day,weekday)=>{const rows=fhwDates.filter(x=>x.weekday===weekday),beverages=sum(rows,'beverages'),count=sum(rows,'fhw');return {day,days:rows.length,fhw:count,beverages,rate:beverages?count/beverages:null};});
 const unknown=[...pending.values()].sort((a,b)=>b.quantity-a.quantity),inferred=[...inferredRows.values()].sort((a,b)=>b.quantity-a.quantity),excluded=[...excludedRows.values()].sort((a,b)=>b.quantity-a.quantity),candidateDemand=preparedBeverages+sum(unknown,'quantity'),ruleCoverage=candidateDemand?preparedBeverages/candidateDemand:null;
 return {sizes:sizes.filter(s=>s.total>0),cups,cream,fhw,fhwSignals,fhwUnmatched,fhwTickets,fhwRate:lobbyBeverages?fhw/lobbyBeverages:null,lobbyBeverages,fhwSources:[...fhwSources.values()].sort((a,b)=>b.quantity-a.quantity),fhwDates,fhwWeekdays,returns,unknown,pending:unknown,inferred,excluded,ruleCoverage,preparedBeverages,drinks,...dateExtent(facts)};
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
 const query=normalize(f.query),rows=[...products.values()].filter(r=>r.units>0&&(!query||normalize(r.name).includes(query))).sort((a,b)=>b.units-a.units);const units=sum(rows,'units');
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

export const EFFORT_GROUPS=['Cake Pop','Dona G&G'];
export function effortProductGroup(name){
 const key=normalize(name);
 if(key.startsWith('cakepop'))return EFFORT_GROUPS[0];
 if(['donachocolateconnuez','donagg','donasgg'].includes(key))return EFFORT_GROUPS[1];
 return null;
}
function effortBucket(d,facts){
 const dates=[...new Set(facts.map(r=>r.dateKey))].sort(),transactions=new Set(facts.map(r=>r.transactionKey)),groups=new Map(EFFORT_GROUPS.map(name=>[name,{name,units:0,products:new Set()}]));
 for(const row of facts){if(row.negative||!(row.adjusted>0))continue;const product=itemName(d,row),group=effortProductGroup(product);if(!group)continue;const target=groups.get(group);target.units+=row.adjusted;target.products.add(product);}
 const units=sum([...groups.values()],'units'),operatingDays=dates.length,orders=transactions.size,sales=sum(facts,'total');
 return {units,days:operatingDays,dates,orders,sales,usd:operatingDays?units/operatingDays:null,upt:orders?units/orders*100:null,ticket:orders?sales/orders:null,groups:[...groups.values()].map(group=>({...group,products:[...group.products].sort((a,b)=>a.localeCompare(b,'es')),share:units?group.units/units:0,usd:operatingDays?group.units/operatingDays:null,upt:orders?group.units/orders*100:null}))};
}
export function operationalEffort(d,f={}){
 const facts=filterFacts(d.salesFacts,f),result=effortBucket(d,facts),weeks=new Map();
 for(const row of facts){const key=weekKey(row.dateKey);if(!weeks.has(key))weeks.set(key,[]);weeks.get(key).push(row);}
 const weekly=[...weeks].sort(([a],[b])=>a.localeCompare(b)).map(([week,rows])=>({week,...effortBucket(d,rows)}));
 const weekdays=DAY_LABELS.map((day,weekday)=>{const rows=facts.filter(row=>row.weekday===weekday);return {day,weekday,...effortBucket(d,rows)};}).filter(row=>row.days>0);
 const historyFilter={...f,weeks:[],week:'',from:'',to:''},history=filterFacts(d.salesFacts,historyFilter),selectedDates=[...new Set(facts.map(row=>row.dateKey))].sort();
 const daily=selectedDates.map(date=>{const rows=facts.filter(row=>row.dateKey===date),point=effortBucket(d,rows),weekday=rows[0]?.weekday??dateParts(date)?.weekday,comparableDates=[...new Set(history.filter(row=>row.weekday===weekday&&row.dateKey<date).map(row=>row.dateKey))].sort().slice(-4),comparable=new Set(comparableDates),baseline=effortBucket(d,history.filter(row=>comparable.has(row.dateKey))),baselineUpt=comparableDates.length&&baseline.orders?baseline.upt:null,baseUnits=baselineUpt==null||!point.orders?null:epsCeil(baselineUpt*point.orders/100),impactUnits=baseUnits==null?null:Math.max(0,baseUnits-point.units);return {date,day:DAY_LABELS[weekday],...point,baselineUpt,baselineDays:comparableDates.length,baseUnits,impactUnits};});
 const current=weekly.at(-1),previous=weekly.at(-2),delta=(a,b)=>a==null||b==null||b===0?null:a/b-1;
 return {...result,weekly,weekdays,daily,current,previous,deltaUsd:delta(current?.usd,previous?.usd),deltaUpt:delta(current?.upt,previous?.upt),...dateExtent(facts)};
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

export function auditReasonType(reason){const raw=String(reason||'').trim(),key=normalize(raw);return /^v/i.test(raw)||key==='otros'?'Foco':/^r/i.test(raw)?'Reopen':'Revisar';}
export function auditStore(d,f={}){
 const optionScope={store:f.store,from:f.from,to:f.to},allVoids=[...filterFacts(d.auditVoids,optionScope),...filterFacts(d.auditLegacyRows||[],optionScope)],tickets=filterFacts(d.auditTickets,f),voids=[...filterFacts(d.auditVoids,f),...filterFacts(d.auditLegacyRows||[],f)],payments=filterFacts(d.auditPayments,f),byTicket=new Map(),ticketByKey=new Map(tickets.map(row=>[row.ticketKey,row]));
 const ensure=r=>{if(!byTicket.has(r.ticketKey))byTicket.set(r.ticketKey,{key:r.ticketKey,ticket:r.ticket,date:r.dateKey,ms:r.ms,minuteOfDay:r.minuteOfDay,negative:null,voidAmount:0,reasons:new Set(),employees:new Set(),people:new Map(),payments:new Map(),products:new Map(),unapproved:false,legacy:false});return byTicket.get(r.ticketKey);};
 for(const r of voids){const row=ensure(r),employee=d.employeeCatalog.get(`${r.store}|${r.employee}`),partner=r.partner||employee?.name||'',position=r.position||employee?.position||'';row.legacy||=r.legacy;row.ms=Math.min(row.ms,r.ms);row.minuteOfDay=Math.min(row.minuteOfDay,r.minuteOfDay);if(r.legacy)row.voidAmount=Math.max(row.voidAmount,Math.abs(Math.min(0,r.total)));else row.voidAmount+=Math.abs(Math.min(0,r.total));row.reasons.add(r.reason);if(r.employee)row.employees.add(r.employee);if(partner){const person=row.people.get(partner)||{name:partner,position:position||'Puesto no disponible',employee:r.employee||''};if(!person.position&&position)person.position=position;row.people.set(partner,person);}if(r.payment&&!/^sin forma$/i.test(r.payment))row.payments.set(normalize(r.payment),{name:r.payment,amount:r.amount});if(!r.manager||['na','0'].includes(normalize(r.manager)))row.unapproved=true;
  const productName=r.productName||d.productCatalog.get(r.product)?.name||`Producto ${r.product||'sin nombre'}`,productKey=normalize(productName);if(productKey){const product=row.products.get(productKey)||{name:productName,quantity:r.legacy?null:0,amount:r.legacy?null:0};if(!r.legacy){product.quantity+=Math.abs(r.quantity??1);product.amount+=Math.abs(Math.min(0,r.total));}row.products.set(productKey,product);}
 }
 for(const row of byTicket.values()){const ticket=ticketByKey.get(row.key);if(ticket?.total<0)row.negative=ticket.total;}
 for(const r of payments){const row=byTicket.get(r.ticketKey);if(row&&r.payment)row.payments.set(normalize(r.payment),{name:r.payment,amount:r.amount});}
 const prepared=[...byTicket.values()].map(row=>{const reasons=[...row.reasons].filter(Boolean),reasonTypes=new Set(reasons.map(auditReasonType)),people=[...row.people.values()],focus=reasonTypes.has('Foco'),reopen=reasonTypes.has('Reopen'),hasNegative=row.negative!==null,amount=Math.max(row.voidAmount,hasNegative?Math.abs(row.negative):0),risk=hasNegative?'Riesgo':focus?'Foco':'Contexto';return {...row,reasons,people,partner:people.map(x=>x.name).join(', ')||'Partner no identificado',position:[...new Set(people.map(x=>x.position).filter(Boolean))].join(', ')||'Puesto no disponible',products:[...row.products.values()].sort((a,b)=>(b.amount||0)-(a.amount||0)||a.name.localeCompare(b.name,'es')),payments:[...row.payments.values()],focus,reopen,hasNegative,risk,amount,review:hasNegative?'Orden negativa vinculada':focus?(reasons.some(x=>normalize(x)==='otros')?'Motivo Otros: validar soporte':'Void: validar contexto'):'Reopen: contexto del cheque'};});
 const reasonsSelected=new Set((f.reasons||[]).map(String)),partnersSelected=new Set((f.partners||[]).map(String));
 const rows=prepared.filter(row=>(!reasonsSelected.size||row.reasons.some(reason=>reasonsSelected.has(reason)))&&(!partnersSelected.size||row.people.some(person=>partnersSelected.has(person.name)))).sort((a,b)=>Number(b.hasNegative)-Number(a.hasNegative)||Number(b.focus)-Number(a.focus)||b.amount-a.amount||b.ms-a.ms);
 const employeeGroups=new Map();for(const row of rows){for(const person of row.people){const key=person.name+'|'+person.position,current=employeeGroups.get(key)||{partner:person.name,position:person.position,tickets:0,focus:0,reopen:0,negative:0,amount:0};current.tickets++;current.focus+=Number(row.focus);current.reopen+=Number(row.reopen);current.negative+=Number(row.hasNegative);current.amount+=row.amount;employeeGroups.set(key,current);}}
 const employees=[...employeeGroups.values()].sort((a,b)=>b.focus-a.focus||b.negative-a.negative||b.amount-a.amount),hourGroups=new Map();for(const row of rows){const hour=Math.floor(row.minuteOfDay/60),current=hourGroups.get(hour)||{hour,tickets:0,focus:0,amount:0};current.tickets++;current.focus+=Number(row.focus);current.amount+=row.amount;hourGroups.set(hour,current);}const hours=[...hourGroups.values()].sort((a,b)=>b.focus-a.focus||b.tickets-a.tickets||b.amount-a.amount);
 const optionPartner=row=>row.partner||d.employeeCatalog.get(`${row.store}|${row.employee}`)?.name||'';
 return {items:rows,voidCount:rows.length,focusCount:rows.filter(row=>row.focus).length,reopenCount:rows.filter(row=>row.reopen).length,negativeCount:rows.filter(row=>row.hasNegative).length,negativeAmount:sum(rows.filter(row=>row.hasNegative),row=>Math.abs(row.negative)),totalAmount:sum(rows,'amount'),pending:rows.filter(row=>row.partner==='Partner no identificado'||row.reasons.length===0).length,employees,hours,topPartner:employees[0]||null,peakHour:hours[0]||null,filterOptions:{reasons:[...new Set(allVoids.map(row=>row.reason).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')),partners:[...new Set(allVoids.map(optionPartner).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')),weeks:[...new Set(allVoids.map(row=>weekKey(row.dateKey)))].sort(),weekdays:[...new Set(allVoids.map(row=>row.weekday))].sort()},...dateExtent(voids)};
}

export const MOTOR_REQUIREMENTS=Object.freeze([
 {id:'sales',name:'Ventas',detail:'Operación e indicadores',types:['sales']},
 {id:'usage',name:'Uso y stock',detail:'Inventario y Pedido WOE',types:['usage']},
 {id:'audit',name:'Auditoría',detail:'Voids y revisión por ticket',types:['auditTicket','auditVoid','auditLegacy']},
]);
function financialBucket(rows){const transactions=new Set(rows.map(row=>row.transactionKey)),dates=[...new Set(rows.map(row=>row.dateKey))].sort(),sales=sum(rows,'total'),units=sum(rows,row=>row.adjusted>0?row.adjusted:0);return {sales,orders:transactions.size,units,days:dates.length,from:dates[0]||'',to:dates.at(-1)||'',ticket:transactions.size?sales/transactions.size:null};}
export function management360(d){
 const stores=[...new Set([...d.salesFacts,...d.usageFacts,...d.auditTickets,...d.auditVoids,...d.auditPayments,...(d.auditLegacyRows||[])].map(row=>row.store).filter(Boolean))];
 const groups=MOTOR_REQUIREMENTS.map(group=>{const rows=group.id==='sales'?d.salesFacts:group.id==='usage'?d.usageFacts:[...d.auditTickets,...d.auditVoids,...(d.auditLegacyRows||[])],received=group.types.some(type=>d.sourceTypes.has(type)),extent=dateExtent(rows);return {...group,received,valid:received&&rows.length>0,rows:rows.length,...extent};});
 const valid=groups.filter(group=>group.valid),periods=new Set(valid.map(group=>`${group.from}|${group.to}`)),from=valid.map(group=>group.from).filter(Boolean).sort()[0]||'',to=valid.map(group=>group.to).filter(Boolean).sort().at(-1)||'';
 const weeks=new Map();for(const row of d.salesFacts){const key=weekKey(row.dateKey);if(!weeks.has(key))weeks.set(key,[]);weeks.get(key).push(row);}const weekly=[...weeks].sort(([a],[b])=>a.localeCompare(b)).map(([week,rows])=>({week,...financialBucket(rows)})),current=weekly.at(-1)||null,previous=weekly.at(-2)||null,delta=(value,base)=>value==null||base==null||base===0?null:value/base-1;
 const missing=groups.filter(group=>!group.valid),coverage=groups.length?valid.length/groups.length:0,warnings=[];if(missing.length)warnings.push(`Faltan ${missing.map(group=>group.name).join(', ')}.`);if(periods.size>1)warnings.push('Los Motores válidos no cubren el mismo periodo.');if(stores.length>1)warnings.push('Se detectó más de un CeCo; la lectura debe bloquearse.');
 return {ceco:stores.length===1?stores[0]:'',mixedCeCo:stores.length>1,groups,expected:groups.length,received:groups.filter(group=>group.received).length,valid:valid.length,coverage,status:stores.length>1?'invalid':valid.length===groups.length&&periods.size<=1?'complete':valid.length?'partial':'unavailable',from,to,lastUpdate:to,periodAligned:periods.size<=1,warnings,finance:{available:!!current,current,previous,deltaSales:delta(current?.sales,previous?.sales),deltaOrders:delta(current?.orders,previous?.orders),deltaTicket:delta(current?.ticket,previous?.ticket),total:financialBucket(d.salesFacts),weekly}};
}

export function reportFor(module,result,context={}){
 const name=MODULES.find(m=>m.id===module)?.name||module,title=name+(context.subtab?` · ${context.subtab}`:''),r=result;
 const report={title,store:context.store||'',period:shortPeriod(r.from,r.to),filters:context.filterLabel||'',summary:[],sheets:[]};
 const sheet=(name,headers,rows)=>report.sheets.push({name,headers,rows});
 if(module==='maxmin'){
  const selected=new Set(context.selectedKeys||[]),items=selected.size?r.items.filter(i=>selected.has(i.key)):[],priority=new Map(r.items.map((i,index)=>[i.key,index+1]));
  report.layout=context.outputView==='list'?'maxmin-list':'labels';report.hideSummary=true;report.operationalHeader=true;report.orders=r.orders;report.summary=[['Productos seleccionados',items.length],['Días observados',r.days],['Pedidos por semana',r.orders]];
  const cards=items.map(i=>{const mode=context.modes?.[i.key]||context.mode||'unit',c=minmaxValues(i,mode),piecesPerCase=mode==='sleeve'?sleeveFor(i)?.size:(i.p.stockPack||i.p.woePack);return {...c,name:i.sapName,sapName:i.sapName,microsName:i.microsName,sap:i.woe?.sap||'',dia:i.woe?.dia||'',daily:i.minimum,usageUnit:i.usageUnit||i.unit||'Sin unidad',mode,orders:r.orders,priority:priority.get(i.key),piecesPerCase,adjusted:i.adjusted};});
  if(report.layout==='labels')report.cards=cards;
  else report.listCards=cards.map((card,index)=>({...card,priority:priority.get(items[index].key),family:items[index].family}));
  report.sheets.push({name:'Uso Unidad',headers:['Descripción SAP','Nombre Micros','#DIA','#SAP','Min','Max','Unidad / Pick Pack','Pz / Caja','# Pedido'],rows:items.map(i=>[i.sapName,i.microsName,i.woe?.dia||'',i.woe?.sap||'',Number(i.minimum.toFixed(1)),Number(i.maximum.toFixed(1)),`Unidad · ${i.usageUnit||i.unit||'Sin unidad'}`,'',r.orders]),formats:[null,null,null,null,'oneDecimal','oneDecimal',null,null,'integer'],widths:[38,32,14,14,12,12,22,14,13]});
  const packRows=[];
  for(const i of items){
   const base={name:i.sapName,micros:i.microsName,sap:i.woe?.sap||'',dia:i.woe?.dia||'',orders:r.orders},pack=minmaxValues(i,'pack'),candidates=[{format:'Pick Pack',values:pack}];
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
  report.orderRows=reviewed.map(x=>{const transitByOrder=Object.fromEntries(report.transitColumns.map(column=>[column.key,sum(x.transits.filter(entry=>String(entry.purchaseOrder)===column.key),'quantity')]));return {sap:x.item.woe?.sap||'',dia:x.item.woe?.dia||'',sapDescription:x.item.sapName||x.item.name,microsDescription:x.item.microsName||x.item.name,dailyUse:x.item.minimum,stock:x.stock,transitByOrder,quantity:x.blocked?'—':x.quantity??0,quantityLabel:x.blocked?'REVISAR':`${x.quantity??0} ${x.item.woe?.ump||'Unidad'}`,status:x.blocked?x.reason:x.quantity>0?'Por pedir':'Sin pedido',unit:x.item.woe?.ump||'',operationalUnit:x.item.unit||'PZA',coverageEnd:x.end};});
  const transitHeaders=report.transitColumns.map(column=>`Tránsito ${shortDate(column.deliveryDate)} #${column.purchaseOrder.slice(-6)}`);
  report.sheets.push({name:'Pedido WOE',headers:['#SAP','#DIA','Descripción SAP','Nombre Micros','Uso diario',...transitHeaders,'Existencia física','Cantidad a pedir','Unidad WOE','Estado'],rows:report.orderRows.map(row=>[row.sap,row.dia,row.sapDescription,row.microsDescription,row.dailyUse,...report.transitColumns.map(column=>row.transitByOrder[column.key]||0),row.stock,typeof row.quantity==='number'?row.quantity:'',row.unit,row.status]),formats:[null,null,null,null,'oneDecimal',...report.transitColumns.map(()=> 'oneDecimal'),'oneDecimal','integer',null,null],widths:[14,14,34,30,14,...report.transitColumns.map(()=>18),17,17,15,28]});
  if(transitOrders.length)sheet('Pedidos en tránsito',['Núm. pedido','Entrega','Proveedor','Archivo','Líneas'],transitOrders.map(order=>[order.purchaseOrder,order.deliveryDate,order.providerAlias||order.provider,order.sourceName,order.lines?.length||0]));
  const issues=[...(audit.conflicts||[]),...(audit.unmatched||[])];if(issues.length)sheet('Cruces por revisar',['Núm. pedido','Entrega','#DIA / Material','#SAP','Descripción PDF','Cantidad','Unidad','Motivo'],issues.map(issue=>[issue.order.purchaseOrder,issue.order.deliveryDate,issue.line.material,issue.line.sap,issue.line.description,issue.line.quantity,issue.line.unit,issue.reason]));
 }
 if(module==='peak'){report.summary=[['AM','00:00–14:00'],['PM','14:00–23:59'],['Franjas activas',r.activeSlots.length],['Días observados',r.days]];sheet('Tareas de ciclo',['Turno','Franja','Promedio','Frecuencia','Tarea'],r.activeSlots.map(x=>[x.period,x.label,x.average,`Cada ${x.cycleMinutes} min`,x.cycleTask]));sheet('Medias horas activas',['Franja','Órdenes totales','Promedio',...DAY_LABELS],r.activeSlots.map(x=>[x.label,x.total,x.average,...x.weekday.map(value=>value>0?value:'')]));sheet('Días comparables',['Día','Días','Peak AM','Base AM','Peak PM','Base PM'],r.weekday.map(x=>[x.day,x.days,x.am?.label||'',x.am?.average??null,x.pm?.label||'',x.pm?.average??null]));}
 if(module==='normal'){
  report.summary=[['FHW %',r.fhwRate==null?'—':`${(r.fhwRate*100).toFixed(1)}%`],['FHW emparejado',r.fhw],['Bebidas Starbucks Coffee',r.lobbyBeverages],['Cobertura del motor',r.ruleCoverage==null?'—':`${(r.ruleCoverage*100).toFixed(1)}%`]];
  if(context.subtab==='Crema batida')sheet('Crema batida',['Indicación registrada','Cantidad','Participación'],[['Con crema',r.cream.with,r.cream.with+r.cream.without?r.cream.with/(r.cream.with+r.cream.without):null],['Sin crema',r.cream.without,r.cream.with+r.cream.without?r.cream.without/(r.cream.with+r.cream.without):null]]);
  else if(context.subtab==='Vasos y tapas')sheet('Vasos',['Tamaño','Tipo','Vasos previstos','Uso ideal reportado','Diferencia','Artículo aplicable','SAP','Validación'],r.cups.map(x=>[x.size,x.temp,x.quantity,x.actualUse,x.difference,x.name,x.sap,x.ready?'Validado':x.reason]));
  else if(context.subtab==='FHW'){
   sheet('FHW comparable',['Día','Días observados','FHW','Bebidas Starbucks Coffee','FHW %'],r.fhwWeekdays.filter(x=>x.days>0).map(x=>[x.day,x.days,x.fhw,x.beverages,x.rate]));
   sheet('Presentaciones FHW',['Presentación','Cantidad detectada'],r.fhwSources.map(x=>[x.name,x.quantity]));
  }else sheet('Presentaciones',['Tamaño','Calientes','Heladas','FHW','Total preparado','Participación'],r.sizes.map(x=>[x.size,x.hot,x.cold,x.fhw,x.total,x.share]));
  if(r.pending.length)sheet('Reglas pendientes',['Producto','Subcategoría','Cantidad','Lectura'],r.pending.map(x=>[x.name,x.family||x.category,x.quantity,x.reason]));
  if(r.inferred.length)sheet('Reglas automáticas',['Producto','Subcategoría','Clasificación','Vaso','Cantidad','Criterio'],r.inferred.map(x=>[x.name,x.family,x.classification,x.vessel,x.quantity,x.reason]));
  if(r.excluded.length)sheet('Sin consumo de vaso',['Producto','Subcategoría','Cantidad','Motivo'],r.excluded.map(x=>[x.name,x.family,x.quantity,x.reason]));
 }
 if(module==='top'){report.summary=[['Unidades netas',r.units],['Venta',r.sales]];sheet(context.subtab||'Ranking',['Producto','Unidades','Participación',...DAY_LABELS,'Venta'],r.items.map(x=>[x.name,x.units,x.share,...x.weekday,x.sales]));}
 if(module==='assembly'){
  report.layout='assembly-plan';report.hideSummary=true;report.operationalHeader=true;report.summary=[['Días comparables',r.days],['Productos de ensamble',r.products.length],['Promedio diario',r.average],['Plan por franjas',r.planned]];report.assemblyProducts=r.products;report.assemblySlots=r.activeSlots;
  sheet('Plan media hora',['Franja','Total a preparar',...r.products.map(product=>product.name)],r.activeSlots.map(slot=>[slot.label,slot.prepare,...slot.items.map(item=>item.prepare)]));
  const ingredientRows=[];for(const product of r.products){if(product.recipe?.packaged)ingredientRows.push([product.name,product.plan,'Viene empaquetada','','',product.recipe.rule]);else for(const ingredient of product.ingredients)ingredientRows.push([product.name,product.plan,ingredient.name,ingredient.totalUnits,ingredient.unit,ingredient.totalGrams,product.recipe?.rule||'Receta pendiente']);}
  report.assemblyIngredients=ingredientRows;report.sheets.push({name:'Ingredientes',headers:['Ensamble','Plan del día','Ingrediente','Cantidad','Unidad','Peso estimado (g)','Regla por producto'],rows:ingredientRows,formats:[null,'integer',null,'integer',null,'integer',null],widths:[30,14,20,12,20,19,54]});report.sheets.push({name:'Trazabilidad',headers:['Nombre unificado','Productos MICROS de origen','Venta histórica','Promedio diario','Plan por franjas','Regla validada'],rows:r.products.map(product=>[product.name,product.sources.join(', '),product.historical,product.average,product.plan,product.recipe?.rule||'Pendiente']),formats:[null,null,'oneDecimal','oneDecimal','integer',null],widths:[30,55,17,17,18,55]});
 }
 if(module==='effort'){report.summary=[['USD · unidades por día',r.usd],['UPT · unidades por 100 transacciones',r.upt],['Unidades de impulso',r.units],['Transacciones',r.orders]];sheet('Grupos de impulso',['Grupo','Unidades','USD','UPT','Participación','Productos detectados'],r.groups.map(x=>[x.name,x.units,x.usd,x.upt,x.share,x.products.join(', ')]));sheet('UPT por día',['Fecha','Día','Unidades','Transacciones','UPT real','Base propia UPT','Días base','Unidades base','Impacto en unidades'],r.daily.map(x=>[x.date,x.day,x.units,x.orders,x.upt,x.baselineUpt,x.baselineDays,x.baseUnits,x.impactUnits]));sheet('Lectura semanal',['Semana','Días operativos','Unidades','USD','Transacciones','UPT'],r.weekly.map(x=>[x.week,x.days,x.units,x.usd,x.orders,x.upt]));sheet('Días comparables',['Día','Días observados','Unidades','USD','Transacciones','UPT'],r.weekdays.map(x=>[x.day,x.days,x.units,x.usd,x.orders,x.upt]));}
 if(module==='baking'){report.period=shortDate(r.date);report.summary=[['Día comparable',r.weekday],['Días de referencia',r.days],['Desde',clock(r.slot)],['Referencia',r.dates?.map(shortDate).join(', ')||'Sin historial']];sheet('Previsión',['Producto','Previsto restante','Ya horneado','Por hornear','Capacidad por charola','Horneo','Temperatura'],r.items.map(x=>[x.product,x.forecast,x.stock,x.need,x.maxTray,x.bake,x.temperature]));sheet('Tandas',['Grupo','Productos','Piezas','Charolas combinadas'],r.groups.map(x=>[x.name,x.products.join(', '),x.need,x.trays]));}
 if(module==='audit'){
  report.summary=[['Tickets Void',r.voidCount],['Foco auditor',r.focusCount],['Reopen',r.reopenCount],['Órdenes negativas vinculadas',r.negativeCount],['Importe anulado',r.totalAmount]];
  sheet('Tickets Void',['Fecha cierre','Hora','Ticket','Partner','Puesto','Prioridad','Motivo','Importe','Orden negativa','Pago'],r.items.map(x=>[x.date,new Date(x.ms).toISOString().slice(11,19),x.ticket,x.partner,x.position,x.risk,x.reasons.join(', '),x.amount,x.hasNegative?'Sí':'No',x.payments.map(p=>p.name).join(', ')]));
  sheet('Detalle Ticket',['Fecha cierre','Hora','Ticket','Partner','Puesto','Producto','Cantidad','Importe línea','Motivo'],r.items.flatMap(x=>x.products.map(product=>[x.date,new Date(x.ms).toISOString().slice(11,19),x.ticket,x.partner,x.position,product.name,product.quantity,product.amount,x.reasons.join(', ')])));
  sheet('Foco por partner',['Partner','Puesto','Tickets','Foco','Reopen','Órdenes negativas','Importe'],r.employees.map(x=>[x.partner,x.position,x.tickets,x.focus,x.reopen,x.negative,x.amount]));
 }
 return report;
}
