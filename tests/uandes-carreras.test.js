// La UAndes pasó de 5 carreras escritas a mano a la lista oficial de admisión.
// Lo que no puede pasar es que alguien que ya eligió su carrera deje de verla
// marcada: los códigos que ya están guardados en cuentas reales se conservan.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const ctx={console};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname+'/../data.js','utf8')+';globalThis.CD=CARRERAS_DECLARABLES;globalThis.CU=CARRERAS_UANDES;',ctx);
const ua=ctx.CD.uandes;

assert.ok(ua.length>=30,'trae la lista oficial completa');
assert.equal(new Set(ua.map(c=>c.n)).size,ua.length,'sin nombres repetidos');
for(const [codigo,n] of [['COM-UA','Ingeniería Comercial'],['DER-UA','Derecho'],['MED-UA','Medicina'],['PSI-UA','Psicología']]){
  assert.equal((ua.find(c=>c.malla===codigo)||{}).n,n,codigo+' sigue apuntando a '+n);
  assert.equal(ctx.CU[codigo],n,codigo+' sigue en CARRERAS_UANDES');
}
assert.ok(ctx.CU['ING-UA'],'ING-UA sigue resolviendo su nombre para quien ya la tiene');
console.log('OK: carreras UAndes oficiales sin perder los códigos guardados');
