const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../marketplace.js'),'utf8');
const ctx={console,Intl,S:{tenant:'uc'},Event:class{constructor(type){this.type=type;}},
  esc:s=>String(s),setTimeout(){},showToast(){}};
vm.createContext(ctx);vm.runInContext(src,ctx);
vm.runInContext('nombresRamosParaClases=()=>({MAT1620:"Cálculo II",EAE110A:"Introducción a la Economía"})',ctx);
const campo=(value='')=>({value,hidden:true,innerHTML:'',disabled:false,placeholder:'',handlers:{},
  addEventListener(tipo,fn){this.handlers[tipo]=fn;},setAttribute(){},dispatchEvent(){},
  querySelectorAll(){return [];},querySelector(){return null;}});
const buscar=campo('cálculo'),oculto=campo('MAT1620'),lista=campo(),elegidas=campo(),tenant=campo('uc');
const fields={'siglas-buscar':buscar,siglas:oculto,'ramos-resultados':lista,'ramos-elegidos':elegidas,tenant};
ctx.__form={isConnected:true};ctx.__campo=id=>fields[id];
vm.runInContext('activarBuscadorRamosClase(__form,__campo)',ctx);
assert.equal(oculto.value,'MAT1620');
tenant.value='fen';tenant.handlers.change();
assert.equal(oculto.value,'');
assert.equal(buscar.value,'');
assert.equal(lista.hidden,true);
assert.equal(elegidas.innerHTML,'');
console.log('OK cambio de universidad borra siglas y búsqueda de la universidad anterior');
