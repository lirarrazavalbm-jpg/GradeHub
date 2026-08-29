const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const fuente = ['data.js', 'engine.js', 'app.js', 'app-session.js', 'render-main.js']
  .map(f => fs.readFileSync(raiz + f, 'utf8')).join('\n');

const stub = {style:{setProperty(){},removeProperty(){}},classList:{add(){},remove(){},contains(){return false;}},addEventListener(){},querySelector(){return stub;},querySelectorAll(){return [];},appendChild(){},setAttribute(){},removeAttribute(){},getAttribute(){return null;},innerHTML:'',textContent:'',value:'',dataset:{}};
const ctx = {window:{addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){},addListener(){}})},document:{getElementById:()=>stub,createElement:()=>stub,addEventListener(){},documentElement:stub,querySelector:()=>stub,querySelectorAll:()=>[],body:stub},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'',hash:''},setTimeout,clearTimeout,console};
vm.createContext(ctx); vm.runInContext(fuente, ctx);
const val = nombre => vm.runInContext(nombre, ctx);
const gpa = val('gpa'), metodo = val('descripcionMetodoGpa');
let ok = 0, fail = 0;
const chk = (nombre, condicion) => { if (condicion) { ok++; console.log('  OK   ' + nombre); } else { fail++; console.log('  FAIL ' + nombre); } };
const ramo = (id, nombre, creditos, nota) => ({id,nombre,creditos,gates:[],categorias:[{id:id+'-cat',nombre:'Evaluación',peso:100,notas:[{id:id+'-nota',nombre:'Nota',valor:nota,peso:1}]}]});

console.log('\n=== El método del promedio se explica ===');
const ponderado = [ramo('a','Álgebra',10,4),ramo('b','Física',20,6)];
const detallePonderado = metodo && metodo(ponderado);
chk('con todos los SCT dice que está ponderado', !!detallePonderado && detallePonderado.modo === 'creditos' && /ponderado por créditos/i.test(detallePonderado.texto));

const simple = [ramo('a','Álgebra',10,4),ramo('b','Seminario sin SCT',null,6)];
const antes = gpa(simple), fotoAntes = JSON.stringify(simple);
const detalleSimple = metodo && metodo(simple);
const despues = gpa(simple);
chk('sin SCT dice que el promedio es simple y nombra el ramo oficial faltante',
  !!detalleSimple && detalleSimple.modo === 'simple' && /promedio simple/i.test(detalleSimple.texto) &&
  /Seminario sin SCT/.test(detalleSimple.texto) && /crédito oficial/i.test(detalleSimple.texto) && /ponderad/i.test(detalleSimple.texto));
chk('explicar el faltante no cambia el promedio ni los datos', antes === despues && fotoAntes === JSON.stringify(simple));

const render = fs.readFileSync(raiz + 'render-main.js', 'utf8');
chk('Home muestra la explicación junto al promedio, no como una alarma aparte',
  /id="home-gpa-method"/.test(fs.readFileSync(raiz + 'index.html', 'utf8')) &&
  /getElementById\('home-gpa-method'\)/.test(render) && !/Agrega créditos a/.test(render));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail ? 1 : 0);
