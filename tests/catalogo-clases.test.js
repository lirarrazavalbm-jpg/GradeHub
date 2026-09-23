const fs=require('fs'),vm=require('vm'),path=require('path');
const raiz=path.join(__dirname,'..');
const mk=fs.readFileSync(process.env.GRADEHUB_MARKETPLACE||path.join(raiz,'marketplace.js'),'utf8');
const html=fs.readFileSync(process.env.GRADEHUB_INDEX||path.join(raiz,'index.html'),'utf8');

const stub={addEventListener(){},querySelector(){return stub;},querySelectorAll(){return [];},style:{},classList:{add(){},remove(){}},dataset:{}};
const ctx={
  console,setTimeout,clearTimeout,
  document:{getElementById(){return stub;}},
  S:{tenant:'uc',carrera:'ING'},currentUser:null,supabaseClient:null,
  esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])),
};
vm.createContext(ctx);vm.runInContext(mk,ctx);
const val=exp=>vm.runInContext(exp,ctx);
let ok=0,fail=0;
const chk=(nombre,pasa)=>{console.log(`  ${pasa?'OK  ':'FAIL'} ${nombre}`);pasa?ok++:fail++;};

console.log('\n=== El estudiante tiene una puerta general, separada de sus notas ===');
chk('Inicio ofrece explorar clases aunque la persona no sea profesora',
  /id="home-clases"/.test(html)&&/onclick="openCatalogoClases\(\)"/.test(html));
chk('existe un filtro puro que no recibe ni inspecciona ramos del estudiante',
  val("typeof prepararCatalogoClases==='function'")&&
  !/\bS\.ramos\b/.test(val('prepararCatalogoClases.toString()')));

const anuncios=[
  {id:'b',tenant:'uc',estado:'publicado',titulo:'Refuerzo semanal',descripcion:'Práctica guiada',ramos_siglas:['MAT1620'],vence_at:'2099-07-01T00:00:00Z'},
  {id:'a',tenant:'uc',estado:'publicado',titulo:'Otra clase',descripcion:'Ejercicios',ramos_siglas:['MAT1610'],vence_at:'2099-06-01T00:00:00Z'},
  {id:'viejo',tenant:'uc',estado:'publicado',titulo:'Vencido',descripcion:'No debe salir',ramos_siglas:['MAT1200'],vence_at:'2000-01-01T00:00:00Z'},
  {id:'pausa',tenant:'uc',estado:'pausado',titulo:'Pausado',descripcion:'No debe salir',ramos_siglas:['MAT1100'],vence_at:null},
];
ctx.anuncios=anuncios;ctx.nombres={MAT1620:'Cálculo II',MAT1610:'Cálculo I'};
if(val("typeof prepararCatalogoClases==='function'")){
  const porNombre=val("prepararCatalogoClases(anuncios,'calculo ii',nombres,{ahora:Date.parse('2026-09-22')})");
  chk('buscar por nombre tolera tildes y encuentra la sigla correspondiente',porNombre.length===1&&porNombre[0].id==='b');
  const todos=val("prepararCatalogoClases(anuncios,'',nombres,{ahora:Date.parse('2026-09-22')})");
  chk('solo muestra anuncios publicados y vigentes',todos.length===2&&!todos.some(a=>a.id==='viejo'||a.id==='pausa'));
  chk('sin búsqueda ordena establemente por ramo',todos.map(a=>a.id).join(',')==='a,b');
}else{
  chk('buscar por nombre tolera tildes y encuentra la sigla correspondiente',false);
  chk('solo muestra anuncios publicados y vigentes',false);
  chk('sin búsqueda ordena establemente por ramo',false);
}

console.log('\n=== El botón de contacto no acepta esquemas activos ===');
const tieneEnlace=val("typeof enlaceContactoClase==='function'");
chk('hay un constructor explícito para cada canal de contacto',tieneEnlace);
if(tieneEnlace){
  chk('WhatsApp conserva solo un teléfono plausible',val("enlaceContactoClase('whatsapp','+56 9 1234 5678')")==='https://wa.me/56912345678');
  chk('Instagram acepta usuario, no una URL arbitraria',val("enlaceContactoClase('instagram','@profe.calculo')")==='https://www.instagram.com/profe.calculo/'&&val("enlaceContactoClase('instagram','javascript:alert(1)')")==='');
  chk('correo solo genera mailto para una dirección válida',val("enlaceContactoClase('email','profe@example.cl')")==='mailto:profe%40example.cl'&&val("enlaceContactoClase('email','no es correo')")==='');
}

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
