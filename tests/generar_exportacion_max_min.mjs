import {writeFile} from 'node:fs/promises';
import {STRUCTURES,addReferenceRows,addUsageRows,createDataset} from '../assets/engine.mjs';
import {inventory,reportFor} from '../assets/operations.mjs';
import {createExecutiveWorkbook} from '../assets/export.mjs';

const output=process.argv[2];
if(!output)throw new Error('Indica la ruta de salida XLSX.');

const dataset=createDataset(),headers=[...STRUCTURES.usage,'Unidad','NombreClasificador'];
addUsageRows(dataset,headers,[
 [38368,'2026-08-24',10,'Vaso de Papel 20 oz',80,'PZA:','Vasos'],
 [38368,'2026-08-24',11,'Tapa Plana Grande',200,'PZA:','Tapas'],
 [38368,'2026-08-25',10,'Vaso de Papel 20 oz',40,'PZA:','Vasos'],
 [38368,'2026-08-25',11,'Tapa Plana Grande',100,'PZA:','Tapas'],
]);
addReferenceRows(dataset,'stock',STRUCTURES.stock,[[10,'Vaso de Papel 20 oz','PZA:','CJA: Caja 20','PZA:'],[11,'Tapa Plana Grande','PZA:','CJA: Caja 10','PZA:']]);
addReferenceRows(dataset,'woe',[...STRUCTURES.woe,'Relacion Unidad de Medida Micros con # Total','Unidad WOE','UMP WOE','Comentario Para Revision'],[['Vaso de Papel 20 oz',149001,'010001','Vaso de Papel 20 oz',800,800,'PZA','CAJ',''],['Tapa Plana Grande',149002,'010002','Tapa Plana Grande',1000,1000,'PZA','CAJ','']]);
const result=inventory(dataset,{store:'38368',window:'all',orders:2}),report=reportFor('maxmin',result,{selectedKeys:result.items.map(item=>item.key)});
await writeFile(output,createExecutiveWorkbook(report));
