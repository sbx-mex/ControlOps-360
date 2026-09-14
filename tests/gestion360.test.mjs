import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STRUCTURES, addAuditRows, addReferenceRows, addRows, addUsageRows,
  createDataset, mergeDataset, selectRecentWorkbooks, validateCeCo,
  workbookIdentity,
} from '../assets/engine.mjs';
import {availableModules, inventory, management360, peakHour} from '../assets/operations.mjs';

const salesHeaders=[...STRUCTURES.sales,'NivelPrecio','ModoOrdenDesc'];
const salesRow=(date='2026-09-14T09:00:00',ticket=1,store=38368,total=50,detail=1)=>[store,date,ticket,1,detail,detail,10,1,total,1,2,'Mostrador'];
const usageHeaders=[...STRUCTURES.usage,'Unidad','NombreClasificador'];
const usageRow=(date='2026-09-14',store=38368,item=10)=>[store,date,item,'Artículo',3,'PZA:','Insumos'];
const record=(name,dataset,lastModified=1)=>({name,fingerprint:name,lastModified,dataset});

test('01 · un solo Motor válido produce alcance parcial, no total 360',()=>{const d=createDataset();addRows(d,salesHeaders,[salesRow()]);const r=management360(d);assert.equal(r.status,'partial');assert.equal(r.valid,1);assert.equal(r.coverage,1/3);});
test('02 · varios Motores del mismo CeCo se integran sin cambiar la tienda',()=>{const d=createDataset(),sales=createDataset(),usage=createDataset();addRows(sales,salesHeaders,[salesRow()]);addUsageRows(usage,usageHeaders,[usageRow()]);mergeDataset(d,sales);mergeDataset(d,usage);assert.equal(management360(d).ceco,'38368');assert.equal(management360(d).valid,2);});
test('03 · Motores de CeCo diferentes fallan antes de modificar el destino',()=>{const d=createDataset(),a=createDataset(),b=createDataset();addRows(a,salesHeaders,[salesRow()]);addUsageRows(b,usageHeaders,[usageRow('2026-09-14',38101)]);mergeDataset(d,a);const before=d.usageFacts.length;assert.throws(()=>mergeDataset(d,b),/distinto/);assert.equal(d.usageFacts.length,before);});
test('04 · filas duplicadas exactas no duplican totales',()=>{const d=createDataset(),row=salesRow();addRows(d,salesHeaders,[row,row]);assert.equal(d.salesFacts.length,1);assert.equal(d.duplicateRows,1);assert.equal(management360(d).finance.total.sales,50);});
test('05 · versión equivalente más reciente reemplaza a la anterior',()=>{const a=createDataset(),b=createDataset();addUsageRows(a,usageHeaders,[usageRow()]);addUsageRows(b,usageHeaders,[usageRow()]);const old=record('old',a,1),latest=record('latest',b,2),picked=selectRecentWorkbooks([old,latest]);assert.deepEqual(picked.selected,[latest]);assert.deepEqual(picked.superseded,[old]);});
test('06 · Motor sin CeCo identificable queda bloqueado',()=>{const d=createDataset();addUsageRows(d,usageHeaders,[usageRow('2026-09-14','')]);assert.throws(()=>validateCeCo(createDataset(),d),/filas/);});
test('07 · Motor con columnas faltantes queda bloqueado',()=>{assert.throws(()=>addRows(createDataset(),['IDTienda','FechaHora'],[[38368,'2026-09-14']]),/Columnas incompletas/);});
test('08 · cruce sin coincidencia queda visible como bloqueado',()=>{const d=createDataset();addUsageRows(d,usageHeaders,[usageRow()]);const item=inventory(d,{store:'38368'}).items[0];assert.equal(item.blocked,true);assert.match(item.reason,/Sin cruce WOE/);});
test('09 · cruce ambiguo no multiplica registros',()=>{const d=createDataset();addReferenceRows(d,'woe',STRUCTURES.woe,[['Artículo',100,'000123','A',12]]);assert.throws(()=>addReferenceRows(d,'woe',STRUCTURES.woe,[['Artículo',200,'000456','B',6]]),/Cruce ambiguo/);assert.equal(d.woeCatalog.size,1);});
test('10 · periodos diferentes se conservan como fuentes distintas',()=>{const a=createDataset(),b=createDataset();addUsageRows(a,usageHeaders,[usageRow('2026-09-01')]);addUsageRows(b,usageHeaders,[usageRow('2026-09-08')]);const picked=selectRecentWorkbooks([record('a',a),record('b',b)]);assert.equal(picked.selected.length,2);assert.equal(new Set(picked.selected.map(workbookIdentity)).size,2);});
test('11 · datos parciales identifican exactamente el Motor faltante',()=>{const d=createDataset();addRows(d,salesHeaders,[salesRow()]);addUsageRows(d,usageHeaders,[usageRow()]);const r=management360(d);assert.equal(r.status,'partial');assert.deepEqual(r.groups.filter(group=>!group.valid).map(group=>group.id),['audit']);});
test('12 · ausencia total de fuentes no fabrica resultados',()=>{const r=management360(createDataset());assert.equal(r.status,'unavailable');assert.equal(r.finance.available,false);assert.equal(r.coverage,0);});
test('13 · resumen y detalle financiero conservan el mismo total',()=>{const d=createDataset();addRows(d,salesHeaders,[salesRow(undefined,1,38368,50,1),salesRow(undefined,2,38368,75,2)]);assert.equal(management360(d).finance.total.sales,peakHour(d).sales);});
test('14 · navegación sólo habilita módulos respaldados por datos',()=>{const d=createDataset();addAuditRows(d,'auditVoid',STRUCTURES.auditVoid,[[38368,'2026-09-14T09:00:00',1,10,206,'Otros',-50]]);assert.deepEqual(availableModules(d).map(module=>module.id),['audit']);});
test('15 · resumen mantiene respuesta rápida con volumen operativo alto',()=>{const d=createDataset(),rows=Array.from({length:25000},(_,index)=>salesRow(`2026-09-${String(1+index%14).padStart(2,'0')}T09:00:00`,index+1,38368,10,index+1));addRows(d,salesHeaders,rows);const started=performance.now(),result=management360(d),elapsed=performance.now()-started;assert.equal(result.finance.total.orders,25000);assert.ok(elapsed<1500,`Resumen tardó ${elapsed.toFixed(1)} ms`);});
