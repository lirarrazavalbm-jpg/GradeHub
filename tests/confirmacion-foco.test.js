// DOM y reloj sintéticos: comprobar el foco real, no buscar líneas del arreglo.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const inicio=app.indexOf('// Cerrar con tecla Escape (confirmación');
const fin=app.indexOf('// Cobertura real del semestre:',inicio);
assert(inicio>=0&&fin>inicio);
function preparar(){
  const listeners=[],timers=new Map();let secuencia=0;
  const doc={activeElement:null,body:{},addEventListener:(_tipo,fn)=>listeners.push(fn)};
  const nodo=id=>({id,isConnected:true,disabled:false,style:{},tagName:'BUTTON',focusOpciones:[],focus(opts){this.focusOpciones.push(opts);doc.activeElement=this;},matches(){return false;},closest(){return null;}});
  const origen=nodo('origen'),cancelar=nodo('cancelar'),accion=nodo('confirm-action'),otro=nodo('otro');
  const clases=new Set(),overlay={classList:{add:n=>clases.add(n),remove:n=>clases.delete(n),contains:n=>clases.has(n)},querySelectorAll:()=>[cancelar,accion].filter(b=>!b.disabled)};
  const botones={style:{},querySelector:()=>cancelar};accion.parentElement=botones;
  const els={'confirm-overlay':overlay,'confirm-action':accion,'confirm-title':{},'confirm-desc':{},modal:{classList:{contains:()=>false}}};
  doc.getElementById=id=>els[id];
  const ctx={document:doc,setTimeout:fn=>{const id=++secuencia;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),closeModal(){throw Error('No debe cerrar la hoja de atrás');}};
  vm.createContext(ctx);vm.runInContext(app.slice(inicio,fin),ctx);
  const run=s=>vm.runInContext(s,ctx);
  const avanzar=()=>{const pendientes=[...timers.values()];timers.clear();pendientes.forEach(fn=>fn());};
  const tecla=(key,shiftKey=false)=>{const e={key,shiftKey,target:doc.activeElement,prevented:false,preventDefault(){this.prevented=true;}};listeners.forEach(fn=>fn(e));return e;};
  const abrir=()=>{origen.focus();run("showConfirm('Título sintético','Descripción',()=>{}, {focusCancel:true})");};
  return {doc,origen,cancelar,accion,otro,overlay,run,avanzar,tecla,abrir};
}
let fallos=0;
const prueba=(nombre,fn)=>{try{fn();console.log('OK: '+nombre);}catch(e){fallos++;console.error('FAIL: '+nombre+' — '+e.message);}};
prueba('Cancelar devuelve el foco al control de origen sin desplazarlo',()=>{const h=preparar();h.abrir();h.avanzar();assert.equal(h.doc.activeElement,h.cancelar);h.run('closeConfirm()');assert.equal(h.doc.activeElement,h.origen);assert.equal(h.origen.focusOpciones.at(-1).preventScroll,true);});
prueba('Escape devuelve el foco y no cierra la hoja de atrás',()=>{const h=preparar();h.abrir();h.avanzar();h.tecla('Escape');assert.equal(h.overlay.classList.contains('open'),false);assert.equal(h.doc.activeElement,h.origen);});
prueba('Tab desde la acción vuelve a Cancelar',()=>{const h=preparar();h.abrir();h.avanzar();h.accion.focus();assert.equal(h.tecla('Tab').prevented,true);assert.equal(h.doc.activeElement,h.cancelar);});
prueba('Shift+Tab desde Cancelar vuelve a la acción',()=>{const h=preparar();h.abrir();h.avanzar();assert.equal(h.tecla('Tab',true).prevented,true);assert.equal(h.doc.activeElement,h.accion);});
prueba('Tab sin confirmación conserva su comportamiento nativo',()=>{const h=preparar();h.origen.focus();assert.equal(h.tecla('Tab').prevented,false);});
prueba('Cerrar antes de 50 ms no vuelve a enfocar la confirmación oculta',()=>{const h=preparar();h.abrir();h.run('closeConfirm()');h.avanzar();assert.equal(h.doc.activeElement,h.origen);});
prueba('Una confirmación reemplazada conserva el origen y cancela el foco anterior',()=>{const h=preparar();h.abrir();h.avanzar();h.run("showConfirm('Otro título','Descripción',()=>{})");h.avanzar();h.run('closeConfirm()');assert.equal(h.doc.activeElement,h.origen);});
prueba('Confirmar deja que la acción enfoque su siguiente pantalla',()=>{const h=preparar();h.doc.activeElement=h.origen;h.doc.siguiente=h.otro;h.run("showConfirm('Título','Descripción',()=>document.siguiente.focus())");h.avanzar();h.accion.onclick();assert.equal(h.doc.activeElement,h.otro);assert.equal(h.overlay.classList.contains('open'),false);});
prueba('Un origen desconectado no recibe foco al cerrar',()=>{const h=preparar();h.abrir();h.avanzar();h.origen.isConnected=false;h.run('closeConfirm()');assert.equal(h.origen.focusOpciones.length,1);});
if(fallos)process.exitCode=1;
