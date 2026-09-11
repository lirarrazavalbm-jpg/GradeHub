// La muestra aprobada tiene dos señales distintas: color para identificar el
// ramo y un riel neutro para su avance. Nunca intercambiar ninguno con su nota.
// Para probar contra main: GRADEHUB_ROOT=/ruta/al/arbol-anterior node tests/editorial.test.js
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=process.env.GRADEHUB_ROOT||(process.env.GRADEHUB_APP&&path.dirname(process.env.GRADEHUB_APP))||path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const source=['data.js','engine.js','app.js','app-session.js','render-main.js','render-agenda.js'].map(read).join('\n');
function el(){
  let html='';const attrs={},classes=new Set();
  const node={style:{setProperty(k,v){this[k]=v;},removeProperty(k){delete this[k];}},dataset:{},children:[],textContent:'',value:'',clientWidth:375,
    classList:{add(...xs){xs.forEach(x=>classes.add(x));},remove(...xs){xs.forEach(x=>classes.delete(x));},contains(x){return classes.has(x);}},
    addEventListener(){},appendChild(x){this.children.push(x);},setAttribute(k,v){attrs[k]=v;},getAttribute(k){return attrs[k]||null;},removeAttribute(k){delete attrs[k];},
    querySelector(){return node;},querySelectorAll(){return [];},focus(){},select(){},remove(){}};
  Object.defineProperty(node,'innerHTML',{get(){return html;},set(v){html=String(v);node.children=[];}});return node;
}
const nodes={},get=id=>nodes[id]||(nodes[id]=el());let writes=0;
const ctx={document:{getElementById:get,createElement:el,querySelector:el,querySelectorAll:()=>[],addEventListener(){},documentElement:el(),body:el()},
  window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){}})},
  localStorage:{getItem(){return null;},setItem(){writes++;},removeItem(){writes++;}},navigator:{},location:{origin:'',pathname:'/',hash:''},
  history:{replaceState(){}},setTimeout,clearTimeout,console};
vm.createContext(ctx);vm.runInContext(source,ctx);const run=s=>vm.runInContext(s,ctx);
let passed=0,failed=0;const check=(label,ok)=>{console.log(`${ok?'OK':'ERROR'} ${label}`);ok?passed++:failed++;};
for(const [count,pct,grade] of [[0,0,null],[2,40,5.5],[5,100,3.6]]){
  run(`S={...freshState(),tenant:'uc',userName:'Prueba',sortMode:'name',onboardingDone:true,ramos:[{id:'lab',nombre:'Laboratorio de prueba',color:'#9873bd',categorias:[{id:'informes',nombre:'Informes',peso:100,directNota:true,slots:5,notas:Array.from({length:${count}},(_,i)=>({id:'n'+i,slot:i,valor:${count===2?'i===0?5:6':'3.6'},peso:1,nombre:'Informe '+i}))}]}]};`);
  const before=run('JSON.stringify(S)'),avg=run('ramoAvg(S.ramos[0])'),beforeWrites=writes;
  run('renderHome()');const row=get('home-ramos').children[0];
  check(`${pct}%: el riel representa exactamente el porcentaje calculado`,row.style['--ramo-progress-scale']===String(pct/100)&&row.innerHTML.includes('ramo-progress-fill'));
  check(`${pct}%: la nota y su acción comparten alineación, sin mezclarse con la identidad`,/class="ramo-grade-action"><div class="ramo-nota/.test(row.innerHTML)&&/class="ramo-band" aria-hidden="true"/.test(row.innerHTML));
  check(`${pct}%: el nombre es un botón nativo sin otro manejador de teclado`,/<button type="button" class="ramo-name">/.test(row.innerHTML));
  check(`${pct}%: dibujar no mueve el promedio ni escribe datos`,avg===grade&&run('ramoAvg(S.ramos[0])')===avg&&run('JSON.stringify(S)')===before&&writes===beforeWrites);
  if(pct===100)check('100% reprobado conserva la nota 3.6 y distingue cierre de aprobación',row.innerHTML.includes('3.6')&&row.classList.contains('is-complete')&&row.innerHTML.includes('100%'));
}
const css=read('styles.css');
check('las notas conservan el color calculado, no reciben el color del ramo',/\.gpa-num:not\(\.empty\),\.ramo-num:not\(\.empty\)\{[^}]*color:var\(--grade-color\)/.test(css));
check('no queda el llenado de Home que teñía toda la fila',!css.includes('--ramo-progress-end'));
check('el oscuro neutro no es azulado',run('FONDOS.neutro.oscuro.bg')==='#080809');
check('la fuente del sistema evita descargas en las cinco páginas',
  ['index.html','404.html','preguntas.html','privacidad.html','terminos.html'].every(f=>!/<link[^>]*fonts\.(googleapis|gstatic)\.com/.test(read(f))));
console.log(`\n${passed} correctas; ${failed} errores`);process.exit(failed?1:0);
