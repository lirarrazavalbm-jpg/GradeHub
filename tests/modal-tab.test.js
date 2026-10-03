// El recorrido con Tab se verifica con botones/campos visibles y ocultos.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const inicio=app.indexOf('// Cerrar con tecla Escape (confirmación');
const fin=app.indexOf('let _confirmFn=null;',inicio);
function preparar(){
 const listeners=[],doc={activeElement:null,addEventListener:(_tipo,fn)=>listeners.push(fn)};
 const nodo=(id,opciones={})=>({id,tagName:'INPUT',tabIndex:0,disabled:false,hidden:false,focus(){doc.activeElement=this;},matches(){return false;},closest(){return null;},getClientRects(){return this.hidden?[]:[{}];},...opciones});
 const primero=nodo('nombre'),oculto=nodo('peso-oculto',{hidden:true}),deshabilitado=nodo('deshabilitado',{disabled:true}),ultimo=nodo('guardar',{tagName:'BUTTON'}),fuera=nodo('agenda');
 let abierto=true,confirmacion=false;
 const contenedor={querySelectorAll:()=>[oculto,deshabilitado,primero,ultimo,nodo('oculto-final',{hidden:true})]};
 const overlay={classList:{contains:()=>abierto},querySelectorAll:contenedor.querySelectorAll,querySelector:()=>contenedor};
 doc.getElementById=id=>id==='modal'?overlay:{classList:{contains:()=>confirmacion},querySelectorAll:()=>[]};
 doc.querySelector=()=>contenedor;
 const ctx={document:doc};vm.createContext(ctx);vm.runInContext(app.slice(inicio,fin),ctx);
 const tecla=(shiftKey=false,key='Tab')=>{const e={key,shiftKey,target:doc.activeElement,prevented:false,preventDefault(){this.prevented=true;}};listeners.forEach(fn=>fn(e));return e;};
 return {doc,primero,ultimo,fuera,tecla,cerrar:()=>abierto=false,confirmar:()=>confirmacion=true};
}
let fallos=0;
function prueba(nombre,fn){try{fn();console.log('OK: '+nombre);}catch(e){fallos++;console.error('FAIL: '+nombre+' — '+e.message);}}
prueba('Tab desde Guardar vuelve al primer campo de la hoja',()=>{const h=preparar();h.ultimo.focus();assert.equal(h.tecla().prevented,true);assert.equal(h.doc.activeElement,h.primero);});
prueba('Shift+Tab desde el primer campo vuelve a Guardar',()=>{const h=preparar();h.primero.focus();assert.equal(h.tecla(true).prevented,true);assert.equal(h.doc.activeElement,h.ultimo);});
prueba('El recorrido interior conserva Tab nativo',()=>{const h=preparar();h.primero.focus();assert.equal(h.tecla().prevented,false);});
prueba('Si el foco quedó afuera, Tab lo recupera dentro de la hoja',()=>{const h=preparar();h.fuera.focus();assert.equal(h.tecla().prevented,true);assert.equal(h.doc.activeElement,h.primero);});
prueba('La hoja cerrada no intercepta Tab',()=>{const h=preparar();h.cerrar();h.fuera.focus();assert.equal(h.tecla().prevented,false);});
prueba('La confirmación encima conserva la prioridad de teclado',()=>{const h=preparar();h.confirmar();h.ultimo.focus();assert.equal(h.tecla().prevented,false);});
prueba('Una tecla de escritura sigue llegando al campo',()=>{const h=preparar();h.primero.focus();assert.equal(h.tecla(false,'5').prevented,false);});
if(fallos)process.exitCode=1;
