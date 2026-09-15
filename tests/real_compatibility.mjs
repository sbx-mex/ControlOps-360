// Optional local integration audit. The operational fixtures are never committed.
// node tests/real_compatibility.mjs /absolute/path/to/real_fixtures.json
import fs from 'node:fs';
import assert from 'node:assert/strict';
import parameters from '../assets/parameters.mjs';
import {createDataset,addReferenceRows,addRows,addUsageRows,addAuditRows,classifyStructure,FACT_TYPES,mergeDataset,operationalStores} from '../assets/engine.mjs';
import {availableModules,inventory,peakHour,normalizados,bakingForecast,auditStore,reportFor} from '../assets/operations.mjs';
import {createExecutiveWorkbook,createExecutivePdf} from '../assets/export.mjs';
const files=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const seed=()=>{const d=createDataset();for(const t of parameters.tables)addReferenceRows(d,t.type,t.headers,t.rows,t);return d;};
const read=file=>{const d=createDataset();for(const t of file.tables){for(const type of classifyStructure(t.headers)){
 if(FACT_TYPES.includes(type)&&!t.sheet.endsWith('_ac'))continue;
 if(type==='sales')addRows(d,t.headers,t.rows);
 else if(type==='usage')addUsageRows(d,t.headers,t.rows);
 else if(FACT_TYPES.includes(type))addAuditRows(d,type,t.headers,t.rows);
 else addReferenceRows(d,type,t.headers,t.rows);
 }}return d;};
const sources=files.map(read),outputs=[];
assert.equal(files.length,3,'Provide venta, uso, auditoría fixtures in that order.');
const expectedSales=sources[0].salesFacts;
const expectedOrders=new Set(expectedSales.map(r=>r.transactionKey)).size;
const expectedSalesCents=Math.round(expectedSales.reduce((s,r)=>s+r.total,0)*100);
const voidTicketKeys=new Set(sources[2].auditVoids.map(r=>r.ticketKey));
const expectedNegative=sources[2].auditTickets.filter(r=>r.total<0&&voidTicketKeys.has(r.ticketKey));
const stores=new Set(sources.flatMap(s=>[...operationalStores(s)]));
assert.equal(stores.size,1,'All three local motors must belong to one store.');
const store=[...stores][0];
const localSnapshot=structuredClone({schema:1,workbooks:sources.map((dataset,index)=>({name:files[index].name,fingerprint:`fixture-${index}`,dataset}))});
const restored=seed();for(const workbook of localSnapshot.workbooks)mergeDataset(restored,workbook.dataset);
assert.deepEqual([...operationalStores(restored)],[store]);
assert.deepEqual([restored.salesFacts.length,restored.usageFacts.length,restored.auditVoids.length],[sources[0].salesFacts.length,sources[1].usageFacts.length,sources[2].auditVoids.length]);
const recovery={workbooks:localSnapshot.workbooks.length,store,salesRows:restored.salesFacts.length,usageRows:restored.usageFacts.length,auditRows:restored.auditVoids.length};
for(let mask=1;mask<8;mask++){
 const d=seed();sources.forEach((s,i)=>{if(mask&(1<<i))mergeDataset(d,s);});
 assert.deepEqual([...operationalStores(d)],[store]);
 const modules=availableModules(d).map(m=>m.id);const result={combination:mask,modules};
 if(mask&1){const p=peakHour(d,{store}),n=normalizados(d,{store});assert.equal(p.orders,expectedOrders);assert.equal(p.slots.length,48);assert.equal(p.slots.reduce((s,r)=>s+r.total,0),p.orders);assert.equal(Math.round(p.sales*100),expectedSalesCents);result.sales={rows:d.salesFacts.length,orders:p.orders,days:p.days,beverages:n.sizes,unknown:n.unknown.length};const report=reportFor('peak',p,{store});assert.ok(createExecutiveWorkbook(report).length>1000);assert.ok(createExecutivePdf(report).length>1000);const b=bakingForecast(d,{store},{},{date:new Date().toISOString().slice(0,10),slot:0});result.baking={days:b.days,products:b.items.length};}
 if(mask&2){const usage=inventory(d,{store,window:'all'});assert.equal(usage.days,new Set(sources[1].usageFacts.map(r=>r.dateKey)).size);assert.ok(usage.items.every(r=>r.totalUse>0));const providers=Object.fromEntries(['DIA','Maquila','LALA'].map(provider=>[provider,inventory(d,{store,window:'all',provider}).items.length]));assert.equal(Object.values(providers).reduce((total,count)=>total+count,0),usage.items.length);assert.ok(Object.values(providers).every(count=>count>0));result.usage={items:usage.items.length,days:usage.days,blocked:usage.excluded,providers};}
 if(mask&4){const a=auditStore(d,{store});assert.equal(d.auditVoids.length,sources[2].auditVoids.length);assert.equal(a.negativeCount,new Set(expectedNegative.map(r=>r.ticketKey)).size);assert.equal(Math.round(a.negativeAmount*100),Math.round(expectedNegative.reduce((s,r)=>s+Math.abs(r.total),0)*100));result.audit={voidRows:d.auditVoids.length,negativeOrders:a.negativeCount,voidTickets:a.voidCount};}
 if((mask&3)===3){const usage=inventory(d,{store,window:'all',normalizedCups:true}),cups=normalizados(d,{store}).cups;for(const item of usage.items.filter(r=>r.usageSource==='Normalizados'))assert.equal(item.totalUse,cups.find(c=>c.name===item.name)?.quantity);}
 // Same data, another download name: dates are replaced, not double counted.
 const before=JSON.stringify([d.salesFacts.length,d.usageFacts.length,d.auditVoids.length]);sources.forEach((s,i)=>{if(mask&(1<<i))mergeDataset(d,s);});assert.equal(JSON.stringify([d.salesFacts.length,d.usageFacts.length,d.auditVoids.length]),before);
 outputs.push(result);
}
console.log(JSON.stringify({passed:7,recovery,combinations:outputs},null,2));
