// La UAndes pasó de 5 carreras escritas a mano a la lista oficial de admisión,
// con sus mallas en mallas-uandes.js. Lo que no puede pasar es que alguien que
// ya eligió su carrera deje de verla marcada: los códigos que ya están
// guardados en cuentas reales se conservan, y son los que reciben la malla.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const raiz=__dirname+'/../';
const ctx={console};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(raiz+'data.js','utf8')+';globalThis.CD=CARRERAS_DECLARABLES;globalThis.CU=CARRERAS_UANDES;',ctx);
vm.runInContext(fs.readFileSync(raiz+'mallas-uandes.js','utf8')+';globalThis.MU=MALLAS_UANDES_EXTRA;',ctx);
// Las funciones reales del cargador, no una copia: si app.js deja de mirar el
// archivo de la UAndes, esto falla.
const app=fs.readFileSync(raiz+'app.js','utf8');
for(const f of ['mallaFor','mallaDeCarrera','mallasExtraDe'])
  vm.runInContext(app.match(new RegExp('function '+f+'\\([\\s\\S]*?\\n}\\n'))[0],ctx);
vm.runInContext(app.match(/const ARCHIVO_MALLAS=\{[^}]*\};/)[0].replace('const ','globalThis.'),ctx);
const ua=ctx.CD.uandes;

assert.ok(ua.length>=30,'trae la lista oficial completa');
assert.equal(new Set(ua.map(c=>c.n)).size,ua.length,'sin nombres repetidos');
for(const [codigo,n] of [['COM-UA','Ingeniería Comercial'],['DER-UA','Derecho'],['MED-UA','Medicina'],['PSI-UA','Psicología']]){
  assert.equal((ua.find(c=>c.malla===codigo)||{}).n,n,codigo+' sigue apuntando a '+n);
  assert.equal(ctx.CU[codigo],n,codigo+' sigue en CARRERAS_UANDES');
}
assert.ok(ctx.CU['ING-UA'],'ING-UA sigue resolviendo su nombre para quien ya la tiene');

// Ninguna carrera promete una malla que no existe, y ninguna malla queda huérfana.
for(const c of ua.filter(c=>c.malla))assert.ok(ctx.MU[c.malla],c.n+' declara '+c.malla+' y no está en mallas-uandes.js');
const declaradas=new Set(ua.map(c=>c.malla).filter(Boolean));
for(const k of Object.keys(ctx.MU))assert.ok(declaradas.has(k),k+' no la declara ninguna carrera');
assert.equal(ua.filter(c=>!c.malla).map(c=>c.n).join(),'Arquitectura','solo Arquitectura queda sin malla (no publica una)');
for(const [k,m] of Object.entries(ctx.MU)){
  assert.ok(m[1]&&m[1].length,k+' tiene ramos en 1°');
  for(const [s,ramos] of Object.entries(m)){
    assert.equal(new Set(ramos).size,ramos.length,k+' '+s+'° sin repetidos');
    for(const r of ramos)assert.doesNotMatch(r,/^(electivo|optativo|minor|menci[oó]n|peg\b)|\*/i,k+': casillero genérico '+r);
  }
}

// El cargador la encuentra: archivo declarado y malla por carrera.
assert.equal(ctx.ARCHIVO_MALLAS.uandes,'mallas-uandes.js');
assert.ok(vm.runInContext("mallaDeCarrera('uandes','COM-UA')[1].includes('Cálculo I')",ctx),'Comercial 1° trae Cálculo I');
assert.ok(vm.runInContext("mallaDeCarrera('uandes','UA-INGENIERIA-CIVIL-INDUSTRIAL')[10].includes('Gestión Estratégica')",ctx),'Industrial 10°');
assert.equal(vm.runInContext("mallaDeCarrera('uandes','ING-UA')",ctx),null,'ING-UA no inventa una malla');
assert.equal(vm.runInContext("mallaDeCarrera('uai','COM-UA')",ctx),null,'no se cruza con otra universidad');
console.log('OK: carreras y mallas UAndes oficiales sin perder los códigos guardados');
