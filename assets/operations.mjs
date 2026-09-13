import {normalize,numberValue,DAY_LABELS,DAY_MS,dateParts,dateExtent,weekKey,shortDate,shortPeriod} from './engine.mjs';

export const ORDER_FACTOR={2:5,3:4,4:3,5:2};
export const MODULES=[
 {id:'maxmin',name:'Max & Min',caption:'Uso, mínimos y tarjetas',icon:'▦',type:'usage'},
 {id:'trend',name:'Tendencia de uso',caption:'Productos y días comparables',icon:'↗',type:'usage'},
 {id:'order',name:'Pedido WOE',caption:'Cobertura, existencias y pedido',icon:'▤',type:'usage'},
 {id:'peak',name:'Peak Hour',caption:'Todo el día, cada media hora',icon:'◷',type:'sales'},
 {id:'normal',name:'Normalizados',caption:'Tamaños, vasos y crema',icon:'◉',type:'sales'},
 {id:'baking',name:'Bitácora de horneo',caption:'Previsión y próximas tandas',icon:'♨',type:'sales'},
 {id:'top',name:'Top Bebidas & Alimentos',caption:'Ranking y mezcla semanal',icon:'≡',type:'sales'},
 {id:'audit',name:'Auditoría tienda',caption:'Órdenes negativas por revisar',icon:'◇',type:'audit'},
];
export function availableModules(d){return MODULES.filter(m=>m.type==='audit'?d.sourceTypes.has('auditTicket')||d.sourceTypes.has('auditVoid'):m.type==='usage'?d.usageFacts.length:d.salesFacts.length&&(m.id==='peak'||d.productCatalog.size));}
export function filterFacts(facts,f={}){const weeks=Array.isArray(f.weeks)?f.weeks.filter(Boolean):[];return facts.filter(r=>(!f.store||r.store===f.store)&&(!f.from||r.dateKey>=f.from)&&(!f.to||r.dateKey<=f.to)&&(!f.week||weekKey(r.dateKey)===f.week)&&(!weeks.length||weeks.includes(weekKey(r.dateKey)))&&(f.weekday==null||f.weekday===''||r.weekday===Number(f.weekday))&&(!f.mode||r.mode===f.mode));}
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
  const woe=d.woeCatalog.get(normalize(item.name)),p=presentation(item,stock,woe);
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
  if(rule!==undefined&&woe?.compostable!=null&&rule!==woe.compostable)reasons.push('Conflicto de clasificación');
  if(controlled&&policy===undefined)reasons.push('CeCo sin clasificación');
  if(controlled&&compostable==null)reasons.push('Artículo sin clasificación');
  if(controlled&&policy!==undefined&&compostable!=null&&policy!==compostable)reasons.push('No aplica al CeCo');
  const daily=dates.map(date=>({date,value:(item.daily.get(date)||0)*p.multiplier}));
  const weekday=DAY_LABELS.map((name,i)=>{const ds=daily.filter(r=>dateParts(r.date).weekday===i);return {name,days:ds.length,average:ds.length?sum(ds,'value')/ds.length:null};});
  const weeks=[...new Set(dates.map(weekKey))].sort().map(week=>{const ds=daily.filter(r=>weekKey(r.date)===week);return {week,days:ds.length,average:sum(ds,'value')/ds.length};});
  const a=weeks.at(-1),b=weeks.at(-2);
  rows.push({...item,stock,woe,p,sapName:woe?.description||stock?.name||item.name,microsName:woe?.micros||item.name,totalUse,average,minimum,maximum,orders,days,policy,compostable,daily,weekday,weeks,change:a&&b&&b.average>0?a.average/b.average-1:null,blocked:reasons.length>0,reason:reasons.join(' · '),adjusted:override!==null,unit:p.label});
 }
 if(f.normalizedCups&&d.salesFacts.length&&dates.length){
  const normalized=normalizados(d,{store:f.store,from:dates[0],to:dates.at(-1),week:f.week,weekday:f.weekday});
  const byName=new Map(normalized.cups.filter(c=>c.ready&&c.comparable).map(c=>[normalize(c.name),c]));
  for(const item of rows){const cup=byName.get(normalize(item.name));if(!cup)continue;item.usageSource='Normalizados';item.reportedUse=item.totalUse;item.totalUse=cup.quantity;item.average=cup.quantity/days;if(!item.adjusted)item.minimum=item.average;item.maximum=item.minimum*ORDER_FACTOR[orders];}
 }
 rows.sort((a,b)=>a.name.localeCompare(b.name,'es'));
 return {items:rows,days,dates,orders,policy,from:dates[0]||'',to:dates.at(-1)||'',excluded:rows.filter(r=>r.blocked).length};
}
export function minmaxValues(item,mode='unit'){
 const pack=item.p.stockPack;
 return {minimum:mode==='pack'?(pack?epsCeil(item.minimum/pack):null):item.minimum,maximum:mode==='pack'?(pack?epsCeil(item.maximum/pack):null):item.maximum,unit:mode==='pack'?(item.stock?.pickPack||'Pick Pack sin validar'):item.unit};
}

export function coverageDays(today,end,fraction=1){const a=dateParts(today),b=dateParts(end);if(!a||!b||b.dayMs<a.dayMs||!Number.isFinite(Number(fraction)))return null;const days=(b.dayMs-a.dayMs)/DAY_MS;return days===0?Math.min(0.5,Math.max(0,Number(fraction))):days-0.5+Math.min(1,Math.max(0,Number(fraction)));}
export function nextReception(date,weekdays){const d=dateParts(date);if(!d)return null;for(let offset=1;offset<=7;offset++){const next=dateParts(new Date(d.dayMs+offset*DAY_MS).toISOString().slice(0,10));if(weekdays.includes(next.weekday))return next.dateKey;}return null;}
export function calculateOrder(item,input={},settings={}){
 const weekdays=(settings.receptions||[]).map(Number),next=weekdays.length?nextReception(settings.delivery,weekdays):null;
 const end=next||settings.delivery,coverage=coverageDays(settings.today,end,settings.fraction??1),stock=numberValue(input.stock),transit=numberValue(input.transit);
 const reasons=item.blocked?[item.reason]:[];
 if(!dateParts(settings.today)||!dateParts(settings.delivery)||settings.delivery<settings.today||coverage===null)reasons.push('Define fechas de pedido');
 if(stock===null||stock<0)reasons.push('Captura existencia');
 if((input.transit!==undefined&&input.transit!==null&&input.transit!==''&&transit===null)||(transit!==null&&transit<0)||(transit>0&&(!dateParts(input.transitDate)||input.transitDate<settings.today||input.transitDate>end)))reasons.push('Revisa fecha de tránsito');
 const demand=coverage===null?null:Math.max(0,item.minimum)*coverage,available=Math.max(0,stock||0)+(transit||0);
 const missing=demand===null?null:Math.max(0,demand-available),suggested=missing!==null&&item.p.woePack?epsCeil(missing/item.p.woePack):null;
 const captured=numberValue(input.order),quantity=captured===null?suggested:captured;
 if((input.order!==undefined&&input.order!==null&&input.order!==''&&captured===null)||(captured!==null&&(!Number.isInteger(captured)||captured<0||suggested===null||captured>suggested)))reasons.push('Pedido excede sugerido o no es entero');
 return {item,end,coverage,demand,stock,transit:transit||0,available,missing,suggested,quantity,blocked:reasons.length>0,reason:reasons.join(' · ')};
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
  const selected=new Set(context.selectedKeys||[]),items=selected.size?r.items.filter(i=>selected.has(i.key)):[];
  report.layout='labels';report.summary=[['Etiquetas seleccionadas',items.length],['Días observados',r.days],['Pedidos por semana',r.orders]];
  report.cards=items.map(i=>{const mode=context.modes?.[i.key]||context.mode,c=minmaxValues(i,mode);return {...c,name:context.nameMode==='micros'?i.microsName:i.sapName,sapName:i.sapName,microsName:i.microsName,sap:i.woe?.sap||'',dia:i.woe?.dia||'',daily:i.average,mode,adjusted:i.adjusted};});
  sheet('Lista Max Min',['Nombre SAP','Nombre MICROS','Código SAP','Código DIA','Familia','Uso diario','Mínimo','Máximo','Formato','Presentación'],items.map(i=>{const mode=context.modes?.[i.key]||context.mode,c=minmaxValues(i,mode);return [i.sapName,i.microsName,i.woe?.sap||'',i.woe?.dia||'',i.family,Number(i.average.toFixed(1)),c.minimum,c.maximum,mode==='pack'?'Pick Pack':'Unidad',c.unit];}));
 }
 if(module==='trend'){report.summary=[['Productos',r.items.length],['Días observados',r.days]];sheet('Uso por día',['Producto','Unidad','Uso total','Promedio diario',...DAY_LABELS],r.items.map(i=>[i.name,i.unit,i.totalUse,i.average,...i.weekday.map(x=>x.average)]));}
 if(module==='order'){report.summary=[['Días observados',r.days],['Artículos bloqueados',r.excluded]];const ready=(context.orders||[]).filter(x=>!x.blocked&&x.quantity>0);sheet('Pedido',['Producto','SAP','DIA','Proveedor','Unidad WOE','Cantidad','Existencia','Tránsito','Cobertura hasta'],ready.map(x=>[x.item.name,x.item.woe.sap,x.item.woe.dia,x.item.woe.provider,x.item.woe.ump,x.quantity,x.stock,x.transit,x.end]));sheet('Base del pedido',['Producto','Base de uso','Unidad de captura','Uso diario','Días de cobertura','Demanda','Faltante'],ready.map(x=>[x.item.name,x.item.usageSource||'Uso ideal _ac',x.item.unit,x.item.minimum,x.coverage,x.demand,x.missing]));}
 if(module==='peak'){report.summary=[['Órdenes',r.orders],['Días observados',r.days],['Peak AM',r.am?.label||'Sin demanda'],['Promedio AM',r.am?.average??null],['Peak PM',r.pm?.label||'Sin demanda'],['Promedio PM',r.pm?.average??null]];sheet('Medias horas',['Franja','Órdenes totales','Promedio',...DAY_LABELS],r.slots.map(x=>[x.label,x.total,x.average,...x.weekday]));sheet('Días comparables',['Día','Días','Peak AM','Promedio AM','Peak PM','Promedio PM'],r.weekday.map(x=>[x.day,x.days,x.am?.label||'',x.am?.average??null,x.pm?.label||'',x.pm?.average??null]));}
 if(module==='normal'){
  report.summary=[['Bebidas en vaso',sum(r.sizes,x=>x.hot+x.cold)],['FHW (sin desechable)',r.fhw],['Devoluciones separadas',r.returns],['Productos sin regla',r.unknown.length]];
  if(context.subtab==='Crema batida')sheet('Crema batida',['Indicación registrada','Cantidad'],[['Con crema',r.cream.with],['Sin crema',r.cream.without]]);
  else if(context.subtab==='Vasos y tapas')sheet('Vasos',['Tamaño','Tipo','Bebidas = vasos','Uso ideal reportado','Diferencia','Artículo aplicable','SAP','Validación'],r.cups.map(x=>[x.size,x.temp,x.quantity,x.actualUse,x.difference,x.name,x.sap,x.ready?'Validado':x.reason]));
  else sheet('Tamaños',['Tamaño','Calientes','Heladas','FHW'],r.sizes.map(x=>[x.size,x.hot,x.cold,x.fhw]));
  if(r.unknown.length)sheet('Sin regla',['Producto','Cantidad'],r.unknown.map(x=>[x.name,x.quantity]));
 }
 if(module==='top'){report.summary=[['Unidades netas',r.units],['Venta',r.sales]];sheet(context.subtab||'Ranking',['Producto','Unidades','Participación',...DAY_LABELS,'Venta'],r.items.map(x=>[x.name,x.units,x.share,...x.weekday,x.sales]));}
 if(module==='baking'){report.period=shortDate(r.date);report.summary=[['Día comparable',r.weekday],['Días de referencia',r.days],['Desde',clock(r.slot)],['Referencia',r.dates?.map(shortDate).join(', ')||'Sin historial']];sheet('Previsión',['Producto','Previsto restante','Ya horneado','Por hornear','Capacidad por charola','Horneo','Temperatura'],r.items.map(x=>[x.product,x.forecast,x.stock,x.need,x.maxTray,x.bake,x.temperature]));sheet('Tandas',['Grupo','Productos','Piezas','Charolas combinadas'],r.groups.map(x=>[x.name,x.products.join(', '),x.need,x.trays]));}
 if(module==='audit'){report.summary=[['Órdenes negativas',r.negativeCount],['Importe negativo',r.negativeAmount],['Tickets con void',r.voidCount],['Sin soporte completo',r.pending]];sheet('Revisión',['Fecha','Ticket','Importe a revisar','Motivo','Pago asociado','Revisión'],r.items.map(x=>[x.date,x.ticket,x.amount,x.reasons.join(', '),x.payments.map(p=>p.name).join(', '),x.review]));}
 return report;
}
