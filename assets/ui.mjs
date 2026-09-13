import parameters from './parameters.mjs';
import {addReferenceRows,createDataset,mergeDataset,operationalStores,getFilterOptions,normalize,DAY_LABELS,shortDate,shortPeriod,dateExtent} from './engine.mjs';
import {inspectWorkbook} from './reader.mjs';
import {MODULES,availableModules,inventory,minmaxValues,peakHour,normalizados,topProducts,bakingForecast,auditStore,calculateOrder,reportFor,clock,sum} from './operations.mjs';
import {createExecutiveWorkbook,createExecutivePdf,downloadBytes} from './export.mjs';

const $=id=>document.getElementById(id),n=v=>v==null?'—':new Intl.NumberFormat('es-MX',{maximumFractionDigits:1}).format(v),money=v=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(v||0);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const saved=()=>{try{const v=JSON.parse(localStorage.getItem('controlops-v5-settings')||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{return {};}};
const state={dataset:null,module:'menu',filters:{},subtabs:{normal:'Tamaños',top:'Bebidas',audit:'Negativas'},files:[],loading:false,page:0,settings:saved(),result:null,report:null};
for(const name of ['minimum','modes','orders','baked','orderSettings','lids'])state.settings[name]||={};
function seed(){const d=createDataset();for(const table of parameters.tables)addReferenceRows(d,table.type,table.headers,table.rows,table);return d;}
function persist(){try{localStorage.setItem('controlops-v5-settings',JSON.stringify(state.settings));}catch{toast('No se pudieron guardar los ajustes en este equipo.');}}
function store(){return [...operationalStores(state.dataset)][0]||'';}
function storeLabel(){const id=store();return id?`${id} · ${state.dataset.storeCatalog.get(id)||'Tienda'}`:'';}
function policyLabel(){const policy=state.dataset.storePolicies.get(store());return policy===undefined?'Por validar':policy?'Sí':'No';}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,5000);}
function metric(label,value,detail='',className=''){return `<article class="metric ${className}"><span>${esc(label)}</span><strong>${esc(value)}</strong>${detail?`<small>${esc(detail)}</small>`:''}</article>`;}
function cards(items){return `<div class="metrics">${items.join('')}</div>`;}
function table(headers,rows){return `<div class="table-scroll"><table><thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${r.map((v,i)=>`<td${i?' class="numeric"':''}>${v}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}" class="empty-cell">Sin resultados en este filtro.</td></tr>`}</tbody></table></div>`;}
function panel(title,content,subtitle=''){return `<section class="panel"><div class="panel-heading"><h2>${esc(title)}</h2>${subtitle?`<span>${esc(subtitle)}</span>`:''}</div>${content}</section>`;}
function field(label,content){return `<label class="field"><span>${esc(label)}</span>${content}</label>`;}
function option(value,label,chosen){return `<option value="${esc(value)}"${String(value)===String(chosen)?' selected':''}>${esc(label)}</option>`;}
function selectFilter(name,label,values,value){return field(label,`<select data-filter="${name}">${values.map(([v,t])=>option(v,t,value)).join('')}</select>`);}
function numeric(value,attributes,placeholder=''){return `<input type="number" min="0" step="any" inputmode="decimal" ${attributes} value="${value??''}" placeholder="${esc(placeholder)}">`;}
function tabs(name,values){return `<div class="subtabs" role="tablist" aria-label="${name}">${values.map(v=>`<button role="tab" aria-selected="${state.subtabs[name]===v}" data-subtab="${esc(v)}" class="${state.subtabs[name]===v?'active':''}">${esc(v)}</button>`).join('')}</div>`;}
function filterState(){return state.filters[state.module]||=(state.module==='order'?{window:'21'}:{});}
function filters(){return {...filterState(),store:store()};}
function commonFilters(type,extra=''){
 const f=filterState(),o=getFilterOptions(state.dataset,type);
 const families=type==='usage'?[...new Set(state.dataset.usageFacts.map(x=>x.family))].sort():[];
 return `<div class="filters">${selectFilter('week','Semana',[['','Todas las cargadas'],...o.weeks.map(x=>[x,`Desde ${shortDate(x)}`])],f.week||'')}${selectFilter('weekday','Día',[['','Todos'],...DAY_LABELS.map((d,i)=>[i,d])],f.weekday??'')}${type==='usage'?selectFilter('family','Familia',[['','Todas'],...families.map(x=>[x,x])],f.family||''):selectFilter('mode','Canal',[['','Todos'],...o.modes.map(x=>[x,x])],f.mode||'')}${extra}<button class="clear-filters" data-action="clear-filters">Restablecer</button></div>`;
}
function searchFilter(){return field('Producto',`<input type="search" data-filter="query" value="${esc(filterState().query||'')}" placeholder="Buscar producto">`);}
function period(r){return shortPeriod(r.from,r.to);}
function pager(length){const pages=Math.ceil(length/24);return pages>1?`<div class="pager"><span>${length} productos · Página ${state.page+1} de ${pages}</span><button data-action="prev" ${state.page===0?'disabled':''}>Anterior</button><button data-action="next" ${(state.page+1)>=pages?'disabled':''}>Siguiente</button></div>`:'';}

function menuView(){
 const available=availableModules(state.dataset);
 return `<div class="menu-intro"><h2>¿Qué necesitas resolver?</h2><span>${available.length} herramientas disponibles</span></div><div class="tool-grid">${available.map(m=>`<button class="tool-card" data-module="${m.id}"><span class="tool-icon">${m.icon}</span><span><strong>${m.name}</strong><small>${m.caption}</small></span><span class="arrow">↗</span></button>`).join('')}</div><div class="section-label">PROYECTOS CONECTADOS</div><div class="external-grid"><a href="https://sbx-mex.github.io/CodeBrew_Merch/" target="_blank" rel="noopener noreferrer"><strong>Catálogo WOE · Conteo Merch</strong><span>Abrir Code Brew ↗</span></a><a href="https://sbx-mex.github.io/Lay-Out_2.0/" target="_blank" rel="noopener noreferrer"><strong>Lay Out</strong><span>Abrir proyecto ↗</span></a></div>`;
}
function maxminView(){
 const f=filters(),r=inventory(state.dataset,{...f,window:'all'},state.settings.minimum);state.result=r;
 const mode=f.display||'unit';
 const controls=commonFilters('usage',selectFilter('orders','Pedidos / semana',[2,3,4,5].map(i=>[i,i]),f.orders||2)+searchFilter());
 const metrics=cards([metric('Productos con uso',n(r.items.length)),metric('Periodo',period(r),`${r.days} días observados`),metric('Máximo',`Mínimo × ${r.orders===2?5:r.orders===3?4:r.orders===4?3:2}`)]);
 const grid=r.items.slice(state.page*24,state.page*24+24).map(i=>{const modeItem=state.settings.modes[i.key]||mode,c=minmaxValues(i,modeItem);return `<article class="product-card"><div class="product-heading"><span>${esc(i.family)}</span>${i.adjusted?'<b class="tag amber">Ajustado</b>':''}</div><h3>${esc(i.name)}</h3><p class="sku">${esc(i.woe?`SAP ${i.woe.sap} · DIA ${i.woe.dia}`:`Artículo ${i.id}`)}</p><div class="minmax-values"><div><span>MIN</span><strong>${n(c.minimum)}</strong></div><div><span>MAX</span><strong>${n(c.maximum)}</strong></div></div><div class="card-inputs">${field('Uso mínimo diario',numeric(Number(i.minimum.toFixed(4)),`data-minimum="${esc(i.key)}" aria-label="Uso mínimo ${esc(i.name)}"`))}${field('Presentación',`<select data-presentation="${esc(i.key)}" aria-label="Presentación ${esc(i.name)}">${option('unit','Unidad',modeItem)}${option('pack','Pick Pack',modeItem)}</select>`)}</div><p class="unit-line">${esc(c.unit)}</p><div class="card-foot"><span>Promedio: ${n(i.average)} / día</span>${i.adjusted?`<button data-restore="${esc(i.key)}">Restaurar</button>`:''}</div>${i.p.multiplier>1?`<small class="conversion">1 ${esc(i.p.text)} = ${i.p.multiplier} piezas</small>`:''}${c.minimum===null?'<p class="notice warning">Falta validar Pick Pack.</p>':''}</article>`;}).join('');
 return controls+metrics+`<div class="product-grid">${grid||'<p class="empty-cell">Sin productos con uso positivo.</p>'}</div>`+pager(r.items.length);
}
function trendView(){
 const f=filters(),r=inventory(state.dataset,{...f,window:'all'});state.result=r;
 const selected=r.items.find(x=>x.id===f.item)||r.items[0];
 const controls=commonFilters('usage',searchFilter());
 if(!selected)return controls+panel('Tendencia','<p class="empty-cell">Sin uso positivo.</p>');
 const max=Math.max(1,...selected.weekday.map(x=>x.average||0));
 const bars=`<div class="weekday-bars">${selected.weekday.map(x=>`<div><strong>${n(x.average)}</strong><div class="bar-well"><div style="height:${(x.average||0)/max*100}%"></div></div><b>${x.name}</b><small>${x.days} día${x.days===1?'':'s'}</small></div>`).join('')}</div>`;
 return controls+field('Producto a revisar',`<select data-filter="item" class="product-select">${r.items.map(x=>option(x.id,x.name,selected.id)).join('')}</select>`)+cards([metric('Uso del periodo',n(selected.totalUse),selected.unit),metric('Promedio diario',n(selected.average),`${r.days} días observados`),metric('Conversión',selected.p.multiplier>1?`× ${selected.p.multiplier} piezas`:'Unidad de origen',selected.p.text)])+panel('Promedio por día de la semana',bars)+panel('Evolución semanal',table(['Semana','Días observados','Promedio diario'],selected.weeks.map(x=>[esc(shortDate(x.week)),n(x.days),n(x.average)])))+panel('Uso de productos',table(['Producto','Unidad','Uso total','Promedio diario'],r.items.map(i=>[esc(i.name),esc(i.unit),n(i.totalUse),n(i.average)])));
}
function orderView(){
 const f=filters(),r=inventory(state.dataset,{...f,window:'21',normalizedCups:f.driver!=='usage'},state.settings.minimum);state.result=r;
 const settings=state.settings.orderSettings[store()]||={today:new Date().toISOString().slice(0,10),delivery:'',fraction:1,receptions:[]};
 const items=r.items.map(i=>calculateOrder(i,state.settings.orders[i.key],settings));state.orderResults=items;
 const settingsView=`<div class="order-settings">${field('Fecha de captura',`<input type="date" data-order-setting="today" value="${esc(settings.today)}">`)}${field('Próxima entrega',`<input type="date" data-order-setting="delivery" value="${esc(settings.delivery)}" min="${esc(settings.today)}">`)}${field('Uso pendiente hoy',`<select data-order-setting="fraction">${[[1,'100%'],[0.7,'70%'],[0.5,'50%'],[0.3,'30%'],[0.1,'10%'],[0,'0%']].map(([v,t])=>option(v,t,settings.fraction)).join('')}</select>`)}<fieldset><legend>Días de recepción</legend><div class="day-checks">${DAY_LABELS.map((d,i)=>`<label><input type="checkbox" data-reception="${i}" ${settings.receptions.includes(i)?'checked':''}>${d}</label>`).join('')}</div></fieldset></div>`;
 const ready=items.filter(x=>!x.blocked&&x.quantity>0);
 const rows=items.map(x=>{const i=x.item,input=state.settings.orders[i.key]||{};return [ `<strong>${esc(i.name)}</strong><small>${esc(i.woe?`SAP ${i.woe.sap} · ${i.woe.provider}`:'Sin cruce WOE')}</small>`,`${n(i.minimum)}<small>${esc(i.unit)} / día · ${esc(i.usageSource||'Uso _ac')}</small>`,numeric(input.stock,`data-order-field="stock" data-key="${esc(i.key)}" aria-label="Existencia ${esc(i.name)}"`,'Capturar'),`<details class="transit"><summary>${input.transit>0?`${n(input.transit)} en tránsito`:'＋ Tránsito'}</summary>${numeric(input.transit,`data-order-field="transit" data-key="${esc(i.key)}" aria-label="Tránsito ${esc(i.name)}"`)}<input type="date" data-order-field="transitDate" data-key="${esc(i.key)}" value="${esc(input.transitDate||'')}" aria-label="Fecha tránsito ${esc(i.name)}"></details>`,`${n(x.suggested)}<small>${esc(i.woe?.ump||'—')} · ${n(i.p.woePack)} ${esc(i.unit)}</small>`,numeric(input.order,`data-order-field="order" data-key="${esc(i.key)}" aria-label="Pedido ${esc(i.name)}" ${i.blocked?'disabled':''}`,x.suggested==null?'—':String(x.suggested)),x.blocked?`<span class="tag amber">${esc(x.reason)}</span>`:'<span class="tag green">Listo</span>' ];});
 return commonFilters('usage',searchFilter()+selectFilter('driver','Base de vasos',[['normal','Normalizados, si son comparables'],['usage','Uso ideal _ac']],f.driver||'normal'))+settingsView+cards([metric('Referencia de uso',period(r),`${r.days} días observados · ventana de 21 días`),metric('Artículos en pedido',n(ready.length)),metric('No aplican / sin cruce',n(r.excluded))])+panel('Pedido por cobertura',table(['Artículo','Uso diario','Existencia','Tránsito','Sugerido','Pedido','Validación'],rows),items[0]?.end?`Cobertura hasta ${shortDate(items[0].end)}`:'Define próxima entrega');
}
function peakView(){
 const r=peakHour(state.dataset,filters());state.result=r;
 const maximum=Math.max(1,...r.slots.flatMap(s=>s.weekday.map(x=>x||0)));
 const heat=table(['Franja',...DAY_LABELS,'Promedio'],r.slots.map(s=>[esc(s.label),...s.weekday.map(x=>`<span class="heat-cell" style="background:rgba(0,112,76,${x==null?0:(x/maximum)*0.7+0.06});color:${x/maximum>0.5?'#fff':'#18392e'}">${n(x)}</span>`),`<strong>${n(s.average)}</strong>`]));
 return commonFilters('sales')+cards([metric('Peak AM · 00:00–12:00',r.am?.label||'Sin demanda',`${n(r.am?.average)} órdenes / día`,'feature'),metric('Peak PM · 12:00–24:00',r.pm?.label||'Sin demanda',`${n(r.pm?.average)} órdenes / día`,'feature'),metric('Órdenes del periodo',n(r.orders),`${r.days} días observados`)])+panel('Peak por día comparable',table(['Día','Días','Peak AM','Órdenes prom.','Peak PM','Órdenes prom.'],r.weekday.map(x=>[x.day,n(x.days),esc(x.am?.label||'—'),n(x.am?.average),esc(x.pm?.label||'—'),n(x.pm?.average)])))+panel('Las 48 medias horas',heat,'Órdenes promedio · lunes con lunes');
}
function normalView(){
 const r=normalizados(state.dataset,filters());state.result=r;const tab=state.subtabs.normal;
 let body='';
 if(tab==='Tamaños')body=panel('Mezcla de tamaños',table(['Tamaño','Calientes','Heladas','FHW'],r.sizes.map(x=>[esc(x.size),n(x.hot),n(x.cold),n(x.fhw)])));
 if(tab==='Vasos y tapas'){
  body=panel('Bebidas = vasos',table(['Tamaño','Tipo','Vasos previstos','Uso ideal','Diferencia','Artículo','SAP','Validación'],r.cups.map(x=>[esc(x.size),esc(x.temp),`<strong>${n(x.quantity)}</strong>`,n(x.actualUse),n(x.difference),esc(x.name),esc(x.sap),`<span class="tag ${x.ready?'green':'amber'}">${esc(x.ready?'Validado':x.reason)}</span>`])))+panel('Tapas','<p class="notice">El tipo de tapa no está determinado por las tablas cargadas. No se genera consumo ni pedido de tapas sin esa regla.</p>');
 }
 if(tab==='Crema batida')body=cards([metric('Con crema',n(r.cream.with),'Indicaciones registradas'),metric('Sin crema',n(r.cream.without),'Indicaciones registradas')])+panel('Crema batida',table(['Indicación','Cantidad'],[['Con crema',n(r.cream.with)],['Sin crema',n(r.cream.without)]]));
 return commonFilters('sales')+tabs('normal',['Tamaños','Vasos y tapas','Crema batida'])+cards([metric('Bebidas en vaso',n(sum(r.sizes,x=>x.hot+x.cold))),metric('FHW',n(r.fhw),'Sin desechable'),metric('Devoluciones',n(r.returns),'Separadas del consumo positivo')])+body+(r.unknown.length?`<details class="panel"><summary>${r.unknown.length} productos requieren regla de vaso</summary>${table(['Producto','Cantidad'],r.unknown.map(x=>[esc(x.name),n(x.quantity)]))}</details>`:'');
}
function topView(){
 const kind=state.subtabs.top==='Alimentos'?'food':'drinks',r=topProducts(state.dataset,filters(),kind);state.result=r;
 return commonFilters('sales')+tabs('top',['Bebidas','Alimentos'])+cards([metric('Más vendido',r.items[0]?.name||'—',`${n(r.items[0]?.units)} unidades`),metric('Unidades netas',n(r.units)),metric('Venta del grupo',money(r.sales))])+panel('Ranking semanal',table(['Producto','Unidades','% mezcla',...DAY_LABELS],r.items.map((x,i)=>[`<span class="rank">${i+1}</span>${esc(x.name)}`,`<strong>${n(x.units)}</strong>`,`${n(x.share*100)}%`,...x.weekday.map(n)])));
}
function bakingView(){
 const settings=filterState();settings.date||=new Date().toISOString().slice(0,10);settings.slot??=0;
 const scope=store()+'|'+settings.date,baked=state.settings.baked[scope]||={},r=bakingForecast(state.dataset,filters(),baked,settings);state.result=r;
 return `<div class="filters">${field('Fecha a planear',`<input type="date" data-filter="date" value="${esc(settings.date)}">`)}${selectFilter('slot','Demanda restante desde',Array.from({length:48},(_,i)=>[i,clock(i)]),settings.slot)}</div>`+cards([metric('Día comparable',r.weekday||'—',`${r.days} días de referencia`),metric('Productos con demanda',n(r.items.length)),metric('Charolas combinadas',r.groups.some(g=>g.trays===null)?'Por capturar':n(sum(r.groups,'trays')),r.groups.some(g=>g.trays===null)?'Captura pendientes para completar':'Previsión')])+(r.reason?`<p class="notice warning">${esc(r.reason)}</p>`:'')+panel('Previsión de horneo',table(['Producto','Previsto restante','Ya horneado','Por hornear','Charola','Horneo'],r.items.map(x=>[`<strong>${esc(x.product)}</strong><small>${esc(x.thaw)} de descongelación</small>`,n(x.forecast),numeric(baked[x.key]?.stock,`data-baked="${esc(x.key)}" data-scope="${esc(scope)}" aria-label="Ya horneado ${esc(x.product)}"`,'Capturar'),`<strong>${n(x.need)}</strong>`,`${x.maxTray} pzas`,`${esc(x.bake)}<small>${esc(x.temperature)}</small>`])),`Referencia: ${r.dates?.map(shortDate).join(', ')||'—'}`)+panel('Próximas tandas',table(['Grupo','Productos','Piezas por hornear','Charolas'],r.groups.map(g=>[esc(g.name),esc(g.products.join(' + ')),n(g.need),n(g.trays)])));
}
function auditView(){
 const r=auditStore(state.dataset,filters());const tab=state.subtabs.audit;r.items=r.items.filter(x=>tab==='Negativas'?x.negative!==null:x.voidAmount>0);state.result=r;
 const rows=r.items.map(x=>[`${esc(shortDate(x.date))}<small>Ticket ${esc(x.ticket)}</small>`,money(x.amount),esc(x.reasons.join(', ')||'Sin motivo'),esc(x.payments.map(p=>p.name).join(', ')||'Sin pago asociado'),`<span class="tag amber">${esc(x.review)}</span>`]);
 return commonFilters('auditPayment')+tabs('audit',['Negativas','Voids'])+cards([metric('Órdenes negativas',n(r.negativeCount)),metric('Importe negativo',money(r.negativeAmount)),metric('Tickets con void',n(r.voidCount)),metric('Soporte pendiente',n(r.pending))])+panel('Órdenes a revisar',table(['Orden','Importe','Motivo','Pago asociado','Revisión'],rows));
}
function aboutView(){
 const refs=[...state.dataset.references].map(([type,r])=>[esc(type),esc(r.source),n(r.rows),`<code>${esc(r.sha256.slice(0,12))}</code>`]);
 return panel('Fuentes de cruce',table(['Parámetro','Fuente','Claves','Huella'],refs))+panel('Motores cargados',table(['Archivo','Resultado'],state.files.map(x=>[esc(x.name),esc(x.status)])))+`<section class="panel about"><h2>Acerca de esta versión</h2><details open><summary>Alcance y lectura</summary><p>La carga es local. No se ejecuta VBA ni se actualizan conexiones: actualiza y guarda los Excel antes de cargarlos. Los nombres de archivo no determinan la herramienta. Se leen hechos _ac y catálogos _base; las tbl son parámetros, no ventas.</p><p>Cada motor actualizado sustituye las fechas que contiene y conserva las anteriores durante esta sesión. Al cerrar o recargar, vuelve a cargar tus motores. Los mínimos y las capturas se guardan sólo en este navegador por CeCo.</p></details><details><summary>Reglas operativas</summary><p>Max & Min usa promedio de días observados; días sin registros globales no se inventan. Máximo: mínimo × 5, 4, 3 o 2 para 2, 3, 4 o 5 pedidos. Blísteres y bolsas con piezas explícitas se convierten; los gramajes no se confunden con piezas. Pick Pack y pedido WOE conservan conversiones separadas.</p><p>Pedido WOE descuenta existencia y tránsito dentro de cobertura, redondea a unidades de pedido completas y bloquea artículos incompatibles o sin cruce. Con días de recepción cubre hasta la entrega siguiente. Con Normalizados y uso del mismo periodo, los vasos aplicables usan el conteo de bebidas como base; el resto conserva uso_ac. Sin fechas comparables se mantiene uso_ac. Revisa los mínimos ajustados antes de pedir.</p><p>Peak Hour compara las 48 medias horas y busca cuatro intervalos consecutivos: AM 00–12 y PM 12–24. Cada día se promedia sólo con su mismo día de semana. Un guion significa sin día observado.</p><p>Normalizados aplica las tbl de vaso y crema, tamaños de la consulta Detalle_vaso y compensación FHW en orden de detalle. Se conservan cantidades múltiples, no sólo filas. Devoluciones separadas. La diferencia entre vasos previstos y uso ideal es un cruce para revisión, no una conclusión de merma. Sólo se compara cuando coinciden los días y no hay un filtro de canal. No hay una regla de tipo de tapa en las fuentes recibidas: ese consumo queda pendiente. Crema expresa indicaciones registradas, no recetas implícitas.</p><p>Horneo usa hasta cuatro fechas anteriores del mismo día de semana, la clasificación BIS y los parámetros recibidos. Es una previsión restante, no venta futura garantizada. La capacidad de grupos combinados no se duplica por producto.</p><p>Auditoría presenta hechos para revisión, no concluye fraude. Venta por empleado y descuentos completos quedan pendientes del nuevo motor.</p></details><details><summary>Proyectos de referencia</summary><p><a href="https://github.com/sbx-mex/Max-Min" target="_blank" rel="noopener noreferrer">Max-Min</a>: factores, tarjetas y Pick Pack. <a href="https://github.com/sbx-mex/WOE_Gestion_Inventario" target="_blank" rel="noopener noreferrer">WOE Gestión</a>: catálogo CMS, CeCos, unidades y cobertura. Code Brew y Lay Out se abren como proyectos externos; no reciben los archivos cargados.</p><p>V5 integra estos flujos con fuentes locales. No sustituye todavía todas las funciones de los proyectos originales.</p></details><details><summary>Nombres sugeridos</summary>${table(['Motor actual','Nombre propuesto'],[['Normalizados.xlsm','Motor_Venta.xlsm'],['Max & Min.xlsm','Motor_Uso.xlsm'],['Auditoria_Tienda.xlsm','Motor_Auditoria.xlsm']])}<p>Propuesta únicamente: los archivos no se renombran ni se incluyen en el código.</p></details></section>`;
}

function draw(){
 const available=availableModules(state.dataset),hasStore=!!store(),about=state.module==='about';
 $('emptyState').hidden=hasStore||about;$('workspace').hidden=!hasStore&&!about;$('resetButton').hidden=!hasStore;$('storeBadge').hidden=!hasStore;
 $('storeBadge').innerHTML=`<strong>${esc(storeLabel())}</strong><span>Compostable: ${policyLabel()}</span>`;
 $('moduleNav').innerHTML=`<button data-module="menu" class="${state.module==='menu'?'active':''}">◫ <span>Mi tienda</span></button>`+available.map(m=>`<button data-module="${m.id}" class="${state.module===m.id?'active':''}"><span class="nav-icon">${m.icon}</span><span>${m.name}</span></button>`).join('');
 if(!hasStore&&!about)return;
 const def=MODULES.find(m=>m.id===state.module);$('moduleTitle').textContent=def?.name||(about?'Acerca de':'Mi tienda');
 state.result=null;state.report=null;state.orderResults=[];
 const render={menu:menuView,maxmin:maxminView,trend:trendView,order:orderView,peak:peakView,normal:normalView,top:topView,baking:bakingView,audit:auditView,about:aboutView}[state.module]||menuView;
 $('moduleContent').innerHTML=render();
 const r=state.result;$('periodTitle').textContent=r?.from?period(r):hasStore?storeLabel():'CONTROL OPS 360°';
 $('exportActions').hidden=!r;
 if(r){const f=filters();state.report=reportFor(state.module,r,{store:storeLabel(),subtab:state.subtabs[state.module],modes:state.settings.modes,mode:f.display||'unit',orders:state.orderResults,filterLabel:[f.week?`Semana desde ${shortDate(f.week)}`:'',f.weekday!==undefined&&f.weekday!==''?DAY_LABELS[Number(f.weekday)]:'',f.family||'',f.mode||'',f.query||''].filter(Boolean).join(' · ')});}
}
function navigate(module){state.module=module;state.page=0;draw();$('moduleTitle').scrollIntoView({block:'start'});$('content').focus({preventScroll:true});}
async function loadFiles(files){
 if(state.loading||!files.length)return;state.loading=true;$('loading').hidden=false;$('uploadButton').disabled=true;
 const accepted=[],errors=[],skipped=[];await new Promise(r=>setTimeout(r,30));
 for(const file of files){try{
  $('progressText').textContent='Validando '+file.name+'…';
  const incoming=await inspectWorkbook(file,msg=>$('progressText').textContent=msg);
  if(state.files.some(x=>x.fingerprint===incoming.fingerprint&&x.ok)){skipped.push(file.name);continue;}
  mergeDataset(state.dataset,incoming.dataset);accepted.push(file.name);state.files.push({name:file.name,fingerprint:incoming.fingerprint,ok:true,status:'Integrado'});
 }catch(error){errors.push(`${file.name}: ${error.message}`);state.files.push({name:file.name,ok:false,status:error.message});}}
 state.loading=false;$('loading').hidden=true;$('uploadButton').disabled=false;$('fileInput').value='';
 if(!availableModules(state.dataset).some(x=>x.id===state.module)&&state.module!=='about')state.module='menu';
 draw();$('confirmationTitle').textContent=errors.length?'Revisa la carga':accepted.length?(store()?'Tienda lista':'Parámetros actualizados'):'Sin cambios';
 $('confirmation').querySelector('.confirm-icon').textContent=errors.length?'!':'✓';
 $('confirmationContent').innerHTML=(store()?`<p class="confirm-store">${esc(storeLabel())}</p><p>Compostable: <strong>${policyLabel()}</strong></p>`:'')+`<p>${accepted.length} incorporado${accepted.length===1?'':'s'}${skipped.length?` · ${skipped.length} repetido${skipped.length===1?'':'s'}`:''}</p>`+(errors.length?`<div class="load-errors">${errors.map(x=>`<p>${esc(x)}</p>`).join('')}</div>`:'');
 $('confirmation').showModal();
}
function exportFile(kind){if(!state.report)return;try{const report=state.report;if(kind==='xlsx'&&state.module==='order'&&!state.orderResults.some(x=>!x.blocked&&x.quantity>0)){toast('Completa existencia y fechas para generar un pedido válido.');return;}const bytes=kind==='xlsx'?createExecutiveWorkbook(report):createExecutivePdf(report),name=`${store()}_${normalize(report.title)}_${state.result?.to||new Date().toISOString().slice(0,10)}.${kind}`;downloadBytes(bytes,name,kind==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/pdf');}catch(e){toast(e.message);}}

$('uploadButton').addEventListener('click',()=>$('fileInput').click());$('dropZone').addEventListener('click',()=>$('fileInput').click());$('fileInput').addEventListener('change',e=>loadFiles([...e.target.files]));
$('homeButton').addEventListener('click',()=>navigate('menu'));$('excelButton').addEventListener('click',()=>exportFile('xlsx'));$('pdfButton').addEventListener('click',()=>exportFile('pdf'));
$('confirmButton').addEventListener('click',()=>$('confirmation').close());
$('resetButton').addEventListener('click',()=>{if(confirm('¿Cambiar tienda? Se retirarán los datos cargados de esta sesión.')){state.dataset=seed();state.files=[];state.filters={};state.module='menu';draw();}});
document.addEventListener('dragover',e=>{e.preventDefault();});document.addEventListener('drop',e=>{e.preventDefault();if(e.dataTransfer.files.length)loadFiles([...e.dataTransfer.files]);});
document.addEventListener('click',e=>{
 const target=e.target.closest('button');if(!target||state.loading)return;
 if(target.dataset.module)navigate(target.dataset.module);
 if(target.dataset.subtab){state.subtabs[state.module]=target.dataset.subtab;draw();}
 if(target.dataset.restore){delete state.settings.minimum[target.dataset.restore];persist();draw();}
 if(target.dataset.action==='clear-filters'){state.filters[state.module]={};state.page=0;draw();}
 if(target.dataset.action==='prev'){state.page=Math.max(0,state.page-1);draw();}
 if(target.dataset.action==='next'){state.page++;draw();}
});
document.addEventListener('change',e=>{
 const el=e.target;if(state.loading)return;
 if(el.dataset.filter){filterState()[el.dataset.filter]=el.value;state.page=0;draw();}
 if(el.dataset.minimum){const v=Number(el.value);if(el.value===''||!Number.isFinite(v)||v<0){toast('Ingresa un mínimo de cero o mayor.');draw();return;}state.settings.minimum[el.dataset.minimum]=v;persist();draw();}
 if(el.dataset.presentation){state.settings.modes[el.dataset.presentation]=el.value;persist();draw();}
 if(el.dataset.orderField){const value=el.type==='number'?(el.value===''?null:Number(el.value)):el.value;(state.settings.orders[el.dataset.key]||={})[el.dataset.orderField]=value;persist();draw();}
 if(el.dataset.orderSetting){state.settings.orderSettings[store()][el.dataset.orderSetting]=el.value;persist();draw();}
 if(el.dataset.reception!==undefined){const days=state.settings.orderSettings[store()].receptions,day=Number(el.dataset.reception);state.settings.orderSettings[store()].receptions=el.checked?[...new Set([...days,day])]:days.filter(x=>x!==day);persist();draw();}
 if(el.dataset.baked){const value=el.value===''?null:Number(el.value);(state.settings.baked[el.dataset.scope]||={})[el.dataset.baked]={stock:value};persist();draw();}
});
try{state.dataset=seed();draw();}catch(e){$('emptyState').innerHTML=`<h1>No se pudieron validar los parámetros</h1><p>${esc(e.message)}</p>`;$('uploadButton').disabled=true;}
