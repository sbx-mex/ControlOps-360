import test from 'node:test';
import assert from 'node:assert/strict';
import {compactCode,parseTransitLines,validateTransitOrder} from '../assets/transit.mjs';

const sourceLines=[
  'DISTRIBUIDORA E IMPORTADORA ALSEA SA DE CV',
  '4506624469 / 03/09/2026',
  'Fecha de entrega Día 15/09/2026',
  '009953 Bagel Tradicional 2 CAJ 149290',
  '000124 Salsa de prueba 1,5 BTE 149291',
];

test('SAP order text preserves codes, decimals and delivery metadata',()=>{const order=parseTransitLines(sourceLines,'pedido.pdf');assert.equal(order.purchaseOrder,'4506624469');assert.equal(order.deliveryDate,'2026-09-15');assert.equal(order.providerAlias,'DIA');assert.equal(order.lines.length,2);assert.equal(order.lines[0].material,'009953');assert.equal(order.lines[1].quantity,1.5);assert.equal(compactCode('000123'),'123');});
test('same delivery date allows distinct purchase orders',()=>{const first=parseTransitLines(sourceLines,'a.pdf'),second={...first,purchaseOrder:'4506624470',id:'4506624470'};validateTransitOrder(first,'2026-09-14');validateTransitOrder(second,'2026-09-14',new Set([first.purchaseOrder]));});
test('past, duplicate purchase order and duplicate fingerprint fail closed',()=>{const order={...parseTransitLines(sourceLines,'pedido.pdf'),fileFingerprint:'sha-a'};assert.throws(()=>validateTransitOrder(order,'2026-09-16'),/anterior/);assert.throws(()=>validateTransitOrder(order,'2026-09-14',new Set([order.purchaseOrder])),/ya fue cargado/);assert.throws(()=>validateTransitOrder(order,'2026-09-14',new Set(),new Set(['sha-a'])),/una sola copia/);});
test('malformed SAP PDF text is rejected pedagogically',()=>{assert.throws(()=>parseTransitLines(['Documento sin estructura'],'otro.pdf'),/texto seleccionable/);});
