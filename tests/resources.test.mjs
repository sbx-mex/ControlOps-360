import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {initializeResources,validatePreparedMotor} from '../assets/resources.mjs';

class Element extends EventTarget {
 constructor(){super();this.checked=false;this.open=false;this.disabled=false;this.clicks=0;this.focused=false;}
 click(){this.clicks++;this.dispatchEvent(new Event('click'));}
 focus(){this.focused=true;}
 showModal(){this.open=true;}
 close(){this.open=false;this.dispatchEvent(new Event('close'));}
 querySelectorAll(){return this.checks;}
}
function fixture(){
 const elements=Object.fromEntries(['resourcesDialog','closeResourcesButton','resourceCheckStatus','uploadPreparedButton','uploadButton'].map(id=>[id,new Element()]));
 const checks=Array.from({length:3},()=>new Element()),openers=[new Element(),new Element()];
 elements.resourcesDialog.checks=checks;
 initializeResources({getElementById:id=>elements[id],querySelectorAll:()=>openers});
 return {...elements,checks,openers};
}

test('downloads open from either entry and closing returns focus',()=>{
 const f=fixture();f.openers[1].click();assert.equal(f.resourcesDialog.open,true);
 f.closeResourcesButton.click();assert.equal(f.resourcesDialog.open,false);assert.equal(f.openers[1].focused,true);
 f.openers[0].click();assert.equal(f.resourcesDialog.open,true);
});
test('manual confirmations count and reset when leaving the guide',()=>{
 const f=fixture();f.checks[0].checked=true;f.checks[2].checked=true;
 f.resourcesDialog.dispatchEvent(new Event('change'));
 assert.match(f.resourceCheckStatus.textContent,/2 de 3/);
 f.resourcesDialog.close();assert.equal(f.checks.some(input=>input.checked),false);
 assert.match(f.resourceCheckStatus.textContent,/0 de 3/);
});
test('prepared upload closes the dialog and invokes the existing upload control',()=>{
 const f=fixture();f.openers[0].click();f.uploadPreparedButton.click();
 assert.equal(f.resourcesDialog.open,false);assert.equal(f.uploadButton.clicks,1);
});
test('an upload in progress cannot be triggered a second time',()=>{
 const f=fixture();f.openers[0].click();f.uploadButton.disabled=true;f.uploadPreparedButton.click();
 assert.equal(f.uploadButton.clicks,0);assert.equal(f.resourcesDialog.open,true);
});
test('all three downloadable originals are rejected until updated, regardless of filename',()=>{
 for(const name of ['Motor_01_Auditoria_Transacciones','Motor_02_Uso_Stock','Motor_03_Detalle_Productos']){
  const data=readFileSync(new URL(`../downloads/motores/${name}.xlsm`,import.meta.url));
  const incoming={name:'renamed.xlsm',fingerprint:createHash('sha256').update(data).digest('hex')};
  assert.throws(()=>validatePreparedMotor(incoming),/plantilla sin actualizar/);
 }
 assert.doesNotThrow(()=>validatePreparedMotor({fingerprint:'refreshed-file'}));
});
