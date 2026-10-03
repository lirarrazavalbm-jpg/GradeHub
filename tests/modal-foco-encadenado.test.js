// Cambiar el contenido de una hoja no cambia el control al que se vuelve.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const app=fs.readFileSync(__dirname+'/../app.js','utf8');
const classes=new Set();
const overlay={classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)}};
const titulo={id:'',textContent:'Primera hoja'};
const contenido={querySelector:()=>titulo,querySelectorAll:()=>[]};
const sheet={scrollTop:10,setAttribute(){},removeAttribute(){}};
const menu={classList:{remove(){document.activeElement=document.body;}}},backdrop={classList:{remove(){}}};
const document={activeElement:null,body:{},scrollingElement:{scrollTop:0},getElementById:id=>({modal:overlay,'modal-content':contenido,'user-avatar':avatar,'user-menu':menu,'user-menu-backdrop':backdrop})[id],querySelector:sel=>sel==='.modal-sheet'?sheet:null};
const nodo=id=>({id,isConnected:true,llamadas:0,setAttribute(){},focus(opts){this.llamadas++;document.activeElement=this;assert.equal(opts.preventScroll,true);}});
const avatar=nodo('avatar'),origen=nodo('agregar'),interno=nodo('importar'),campo=nodo('texto');
const ctx={document,console,setTimeout:fn=>fn()};vm.createContext(ctx);
vm.runInContext('let _quienAbrioModal=null;',ctx);
for(const nombre of ['etiquetarCamposDelModal','openModal','closeModal','closeUserMenu','umGo']){
 const i=app.indexOf('function '+nombre+'(');
 vm.runInContext(app.slice(i,app.indexOf('\n}',i)+2),ctx);
}
const run=s=>vm.runInContext(s,ctx);
document.activeElement=origen;run('openModal()');
document.activeElement=interno;titulo.id='';titulo.textContent='Segunda hoja';run('openModal()');
interno.isConnected=false;document.activeElement=campo;run('closeModal()');
assert.equal(document.activeElement,origen,'al cancelar la hoja encadenada vuelve al origen visible');
assert.equal(origen.llamadas,1);assert.equal(classes.has('open'),false);

// La opción del menú de usuario ya se ocultó durante su transición de salida.
const opcion=nodo('configuracion');
document.activeElement=opcion;run('umGo(openModal)');document.activeElement=campo;run('closeModal()');
assert.equal(document.activeElement,avatar,'el menú cerrado devuelve el foco a su avatar');
assert.equal(opcion.llamadas,0,'no enfoca una opción dentro de un menú oculto');

const siguiente=nodo('editar');document.activeElement=siguiente;run('openModal()');
document.activeElement=campo;run('closeModal()');
assert.equal(document.activeElement,siguiente,'cada nueva apertura conserva su propio origen');
siguiente.isConnected=false;document.activeElement=siguiente;run('openModal()');
document.activeElement=campo;run('closeModal()');
assert.equal(document.activeElement,campo,'un origen removido no fuerza un salto de foco');
document.activeElement=document.body;run('openModal()');document.activeElement=campo;run('closeModal()');
assert.equal(document.activeElement,campo,'no fuerza el foco al body');
console.log('OK: foco de hojas encadenadas, menú cerrado y aperturas independientes');
