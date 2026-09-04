// La ficha limpia #cat-list antes de dibujar cada evaluación. Una categoría
// heredada sin `notas` no puede dejar en blanco las demás ni ocultarse: se
// muestra como una evaluación sin notas para que la persona pueda corregirla.
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const src=['data.js','engine.js','app.js','app-session.js','render-main.js','render-agenda.js']
  .map(f=>fs.readFileSync(raiz+f,'utf8')).join('\n');

function classList(){const clases=new Set();return{add(...xs){xs.forEach(x=>clases.add(x));},remove(...xs){xs.forEach(x=>clases.delete(x));},contains(x){return clases.has(x);}};}
function el(){
  let html='';const attrs={};
  const nodo={style:{setProperty(){},removeProperty(){}},classList:classList(),children:[],textContent:'',value:'',dataset:{},
    addEventListener(){},appendChild(hijo){this.children.push(hijo);return hijo;},setAttribute(k,v){attrs[k]=String(v);},removeAttribute(k){delete attrs[k];},getAttribute(k){return attrs[k]||null;},
    querySelector(){return nodo;},querySelectorAll(){return [];},focus(){},select(){},click(){},remove(){},clientWidth:400};
  Object.defineProperty(nodo,'innerHTML',{get(){return html;},set(v){html=String(v);this.children=[];}});
  return nodo;
}
const ids={};const byId=id=>ids[id]||(ids[id]=el());
const ctx={
  window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
  document:{getElementById:byId,createElement:el,addEventListener(){},documentElement:el(),querySelector(){return el();},querySelectorAll(){return [];},body:el()},
  localStorage:{getItem(){return null;},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',hash:''},history:{replaceState(){}},setTimeout,clearTimeout,console,
};
vm.createContext(ctx);vm.runInContext(src,ctx);
const val=n=>vm.runInContext(n,ctx);
let ok=0,fail=0;const chk=(n,c)=>{console.log(`  ${c?'OK  ':'FAIL'} ${n}`);if(c)ok++;else fail++;};

console.log('\n=== La ficha tolera una categoría malformada ===');
vm.runInContext(`
  S={...freshState(),ramos:[{
    id:'ramo-heredado',nombre:'Ramo heredado',color:'#6d5dd3',
    categorias:[
      {id:'segunda',nombre:'segunda evaluación',peso:'40',directNota:true,notas:[{id:'n-2',nombre:'Nota',valor:5.2,peso:1}]},
      {nombre:'primera evaluación',peso:'60',directNota:true}
    ]
  }]};
  currentRamoId='ramo-heredado';
`,ctx);

let error=null;try{val('renderRamo')();}catch(e){error=e;}
const filas=byId('cat-list').children;
chk('no cae si una categoría no trae notas',error===null);
chk('mantiene visibles las dos categorías aunque vengan reordenadas',filas.length===2);
chk('conserva la categoría válida que venía antes',filas[0]?.innerHTML.includes('segunda evaluación'));
chk('dibuja la categoría sin notas como una fila vacía',filas[1]?.innerHTML.includes('primera evaluación')&&/placeholder="—"/.test(filas[1]?.innerHTML||''));
chk('acepta nombre en minúscula, peso como texto, ramo sin gates e id ausente',
  !error&&filas[0]?.innerHTML.includes('40%')&&filas[1]?.innerHTML.includes('60%'));

console.log('\n=== Una categoría abierta no deja la ficha en blanco ===');
vm.runInContext(`
  S={...freshState(),ramos:[{
    id:'ramo-lista',nombre:'Ramo con controles',color:'#6d5dd3',
    categorias:[
      {id:'prueba',nombre:'Prueba 1',peso:70,directNota:true,notas:[]},
      {id:'controles',nombre:'Controles',peso:30,directNota:false,notas:[]}
    ]
  }]};
  currentRamoId='ramo-lista';
`,ctx);
error=null;try{val('renderRamo')();}catch(e){error=e;}
const listaAbierta=byId('cat-list').children;
chk('marcar varias notas no rompe el render',error===null);
chk('mantiene visible la prueba junto a Controles',listaAbierta.length===2&&listaAbierta[0]?.innerHTML.includes('Prueba 1')&&listaAbierta[1]?.innerHTML.includes('Controles'));
chk('Controles conserva la puerta para agregar sus notas',/Agregar nota/.test(listaAbierta[1]?.innerHTML||''));

console.log('\n=== Una pauta oficial no invita a borrar una evaluación ===');
const pautaBiocel=val("presetRamo('Biología de la Célula','uc','ING-PC')");
const biocel={id:'biocel',nombre:'Biología de la Célula',color:'#6d5dd3',origen:{tenant:'uc',carrera:'ING-PC'},categorias:pautaBiocel.categorias,gates:pautaBiocel.gates};
biocel.pautaHuella=val(`huellaPauta(${JSON.stringify(pautaBiocel.categorias)})`);
vm.runInContext(`S={...freshState(),ramos:${JSON.stringify([biocel])}};currentRamoId='biocel';`,ctx);
error=null;try{val('renderRamo')();}catch(e){error=e;}
const talleres=byId('cat-list').children.find(f=>f.innerHTML.includes('Talleres'));
chk('Talleres oficial no muestra un botón que borra toda la evaluación',
  error===null&&!/Eliminar evaluación Talleres/.test(talleres?.innerHTML||''));
val('S').ramos[0].categorias.find(c=>c.nombre==='Talleres').peso=15;
val('renderRamo')();
const talleresCorregidos=byId('cat-list').children.find(f=>f.innerHTML.includes('Talleres'));
chk('una pauta que la persona corrigió conserva la opción de borrar su propia fila',
  /Eliminar evaluación Talleres/.test(talleresCorregidos?.innerHTML||''));

console.log('\n=== Una cantidad esperada dibuja todas sus casillas ===');
const reparada=val('normalize')({ramos:[{
  id:'ramo-slots',nombre:'Ramo con controles fijados',color:'#6d5dd3',
  categorias:[{id:'controles-fijos',nombre:'Controles',peso:30,directNota:false,slots:3,notas:[]}]
}]});
vm.runInContext(`S={...freshState(),ramos:${JSON.stringify(reparada.ramos)}};currentRamoId='ramo-slots';`,ctx);
error=null;try{val('renderRamo')();}catch(e){error=e;}
const controlesFijos=byId('cat-list').children[0];
chk('una categoría guardada con cantidad se repara como casillas fijas',
  error===null&&reparada.ramos[0].categorias[0].directNota===true);
chk('la ficha muestra las tres casillas esperadas para Controles',
  /Controles 1/.test(controlesFijos?.innerHTML||'')&&/Controles 2/.test(controlesFijos?.innerHTML||'')&&/Controles 3/.test(controlesFijos?.innerHTML||''));

console.log('\n=== El Lab de Dinámica conserva el nombre y número de cada entrega ===');
const pautaLab=val("presetRamo('Laboratorio de Dinámica','uc','ING-PC')");
const informes=pautaLab.categorias.find(c=>c.nombre==='Informes');
vm.runInContext(`S={...freshState(),ramos:[{id:'lab-dinamica',nombre:'Laboratorio de Dinámica',color:'#6d5dd3',origen:{tenant:'uc',carrera:'ING-PC'},categorias:${JSON.stringify(pautaLab.categorias)},gates:${JSON.stringify(pautaLab.gates)}}]};currentRamoId='lab-dinamica';`,ctx);
error=null;try{val('renderRamo')();}catch(e){error=e;}
const informesLab=byId('cat-list').children[1];
chk('la pauta empieza sin notas ni ceros inventados',error===null&&informes.notas.length===0&&!informes.notas.some(n=>n.valor===0));
chk('los seis informes se numeran desde el Lab 0 y en singular',
  /Informe 0/.test(informesLab?.innerHTML||'')&&/Informe 5/.test(informesLab?.innerHTML||'')&&!/Informes 1/.test(informesLab?.innerHTML||''));

console.log('\n=== Una sola casilla no cierra el grupo ni infla el avance ===');
informes.notas=[{id:'informe-0',nombre:'Informe 0',valor:5.4,peso:1,slot:0}];
const labConInforme={id:'lab-con-informe',nombre:'Laboratorio de Dinámica',color:'#6d5dd3',origen:{tenant:'uc',carrera:'ING-PC'},categorias:pautaLab.categorias,gates:pautaLab.gates};
vm.runInContext(`S={...freshState(),ramos:${JSON.stringify([labConInforme])}};currentRamoId='lab-con-informe';openCats={};`,ctx);
const promedioAntes=val('ramoAvg')(labConInforme);
const avance=val('ramoProgress')(labConInforme);
error=null;try{val('renderRamo')();}catch(e){error=e;}
const informesConNota=byId('cat-list').children[1];
chk('la primera nota abre el grupo y deja visible su valor',
  error===null&&/eval-group-body open/.test(informesConNota?.innerHTML||'')&&/value="5\.4"/.test(informesConNota?.innerHTML||''));
val('openCats')[informes.id]=false;val('renderRamo')();
chk('si se cerró a mano conserva esa decisión',
  !/eval-group-body open/.test(byId('cat-list').children[1]?.innerHTML||''));
chk('1 de 6 Informes aporta solo una sexta parte de su 70%',avance.pct===12&&avance.pending>80&&avance.pending<90);
chk('corregir el avance no cambia el promedio parcial del ramo',promedioAntes===5.4&&val('ramoAvg')(labConInforme)===promedioAntes);

console.log('\n=== Recargar conserva y recupera la posición de cada casilla ===');
const pautaAlRecargar=JSON.parse(JSON.stringify(pautaLab));
pautaAlRecargar.categorias.find(c=>c.nombre==='Informes').notas=[{id:'informe-0',nombre:'Informe 0',valor:5.4,peso:1,slot:0}];
const ramaRecargada=val('normalize')({ramos:[{id:'lab-recargado',nombre:'Laboratorio de Dinámica',color:'#6d5dd3',origen:{tenant:'uc',carrera:'ING-PC'},categorias:pautaAlRecargar.categorias,gates:pautaAlRecargar.gates}]});
const informeRecargado=ramaRecargada.ramos[0].categorias.find(c=>c.nombre==='Informes');
vm.runInContext(`S={...freshState(),ramos:${JSON.stringify(ramaRecargada.ramos)}};currentRamoId='lab-recargado';openCats={};`,ctx);
error=null;try{val('renderRamo')();}catch(e){error=e;}
const informesTrasRecargar=byId('cat-list').children[1];
chk('Informe 0 sigue asociado a su casilla después de normalizar y recargar',
  error===null&&informeRecargado.notas[0]?.slot===0&&/value="5\.4"/.test(informesTrasRecargar?.innerHTML||''));
const respaldoSinSlot=JSON.parse(JSON.stringify(ramaRecargada));
delete respaldoSinSlot.ramos[0].categorias.find(c=>c.nombre==='Informes').notas[0].slot;
const legadoRecuperado=val('normalize')(respaldoSinSlot).ramos[0].categorias.find(c=>c.nombre==='Informes');
chk('una nota ya afectada se recupera solo si su nombre identifica la casilla',legadoRecuperado.notas[0]?.slot===0);

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);process.exit(fail?1:0);
