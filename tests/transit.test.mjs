import test from 'node:test';
import assert from 'node:assert/strict';
import {compactCode,parseTransitLines,similarStoreName,validateTransitOrder,validateTransitStore} from '../assets/transit.mjs';

const sourceLines=[
  'DISTRIBUIDORA E IMPORTADORA ALSEA SA DE CV',
  '4506624469 / 03/09/2026',
  'Persona de contacto/Tel.',
  'B734 / Luna Parc',
  'Fecha de entrega Día 15/09/2026',
  '009953 Bagel Tradicional 2 CAJ 149290',
  '000124 Salsa de prueba 1,5 BTE 149291',
];

test('SAP order text preserves codes, store name, decimals and delivery metadata',()=>{const order=parseTransitLines(sourceLines,'pedido.pdf');assert.equal(order.purchaseOrder,'4506624469');assert.equal(order.deliveryDate,'2026-09-15');assert.equal(order.providerAlias,'DIA');assert.equal(order.storeName,'Luna Parc');assert.equal(order.lines.length,2);assert.equal(order.lines[0].material,'009953');assert.equal(order.lines[1].quantity,1.5);assert.equal(compactCode('000123'),'123');});
test('same delivery date allows distinct purchase orders',()=>{const first=parseTransitLines(sourceLines,'a.pdf'),second={...first,purchaseOrder:'4506624470',id:'4506624470'};validateTransitOrder(first,'2026-09-14');validateTransitOrder(second,'2026-09-14',new Set([first.purchaseOrder]));});
test('past, duplicate purchase order and duplicate fingerprint fail closed',()=>{const order={...parseTransitLines(sourceLines,'pedido.pdf'),fileFingerprint:'sha-a'};assert.throws(()=>validateTransitOrder(order,'2026-09-16'),/anterior/);assert.throws(()=>validateTransitOrder(order,'2026-09-14',new Set([order.purchaseOrder])),/ya fue cargado/);assert.throws(()=>validateTransitOrder(order,'2026-09-14',new Set(),new Set(['sha-a'])),/una sola copia/);});
test('store validation approves similar names and rejects a foreign CeCo or store name',()=>{const order=parseTransitLines(sourceLines,'pedido.pdf');assert.equal(similarStoreName('SB_Luna_Parc','Luna Parc'),true);assert.equal(similarStoreName('SB_Gal_Perinorte','Galerías Perinor'),true);assert.equal(similarStoreName('SB_Luna_Parc','Luna Azul'),false);assert.equal(similarStoreName('SB_Luna_Parc','Galerías Perinor'),false);assert.deepEqual(validateTransitStore(order,{ceco:'38368',name:'SB_Luna_Parc'}),{cecoMatch:false,nameMatch:true});assert.deepEqual(validateTransitStore({...order,storeName:'',storeCeco:'38368'},{ceco:'38368',name:'SB_Luna_Parc'}),{cecoMatch:true,nameMatch:false});assert.throws(()=>validateTransitStore({...order,storeName:'Galerías Perinor'},{ceco:'38368',name:'SB_Luna_Parc'}),/no a/);assert.throws(()=>validateTransitStore({...order,storeCeco:'38894'},{ceco:'38368',name:'SB_Luna_Parc'}),/CeCo/);assert.throws(()=>validateTransitStore(order,{ceco:'38368',name:''}),/identidad comparable/);});
test('inline SAP contact identity accepts Perinorte Motors but is rejected for Luna Parc',()=>{const lines=sourceLines.filter(line=>!['Persona de contacto/Tel.','B734 / Luna Parc'].includes(line));lines.splice(2,0,'Persona de contacto/Tel. B734 / Galerías Perinor');const order=parseTransitLines(lines,'4506624469.pdf');assert.equal(order.storeName,'Galerías Perinor');assert.doesNotThrow(()=>validateTransitStore(order,{ceco:'38894',name:'SB_Gal_Perinorte'}));assert.throws(()=>validateTransitStore(order,{ceco:'38368',name:'SB_Luna_Parc'}),/no a/);});
test('store identity is mandatory when transit is loaded against active Motors',()=>{const order={...parseTransitLines(sourceLines,'pedido.pdf'),storeName:'',storeCeco:''};assert.throws(()=>validateTransitOrder(order,'2026-09-14',new Set(),new Set(),{ceco:'38368',name:'SB_Luna_Parc'}),/no identifica/);});
test('malformed SAP PDF text is rejected pedagogically',()=>{assert.throws(()=>parseTransitLines(['Documento sin estructura'],'otro.pdf'),/texto seleccionable/);});
