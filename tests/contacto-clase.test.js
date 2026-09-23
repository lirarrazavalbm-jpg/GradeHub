// Los enlaces de contacto de una clase son lo único que el marketplace tiene
// que hacer bien: si no se abren, no hay clase.
//
// El del correo estaba mal formado. `encodeURIComponent` convertía el `@` en
// %40, y el RFC 6068 no admite el separador escapado: hay clientes que abren
// el mensaje sin destinatario o directamente no lo abren.
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const stub={style:{setProperty(){},removeProperty(){}},addEventListener(){},appendChild(){},classList:{add(){},remove(){},contains(){return false}},value:'',innerHTML:'',textContent:'',focus(){},select(){},setAttribute(){},removeAttribute(){},getAttribute(){return null},querySelectorAll(){return[]},querySelector(){return stub},clientWidth:400,dataset:{},click(){}};
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},document:{getElementById:()=>stub,createElement:()=>stub,addEventListener(){},documentElement:{style:{setProperty(){},removeProperty(){}},setAttribute(){},removeAttribute(){},getAttribute(){return null}},querySelector:()=>stub,querySelectorAll:()=>[],body:stub},localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'',hash:''},setTimeout,clearTimeout,console};
vm.createContext(ctx);
['data.js','engine.js','app.js','marketplace.js'].forEach(f=>vm.runInContext(fs.readFileSync(raiz+f,'utf8'),ctx));
const enlace=vm.runInContext('enlaceContactoClase',ctx), pesos=vm.runInContext('pesosClase',ctx);
let ok=0,fail=0;const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

console.log('\n=== El correo se abre de verdad ===');
chk('el @ NO va escapado', enlace('email','alguien@uc.cl')==='mailto:alguien@uc.cl');
chk('con punto en el nombre tampoco', enlace('email','j.perez@edu.uai.cl')==='mailto:j.perez@edu.uai.cl');
// Un ? o un & en la dirección los leería el cliente como encabezados del
// mailto —asunto, cuerpo, copia oculta— en vez de como parte del correo.
chk('pero los caracteres que abrirían encabezados sí se codifican', (()=>{
  const e=enlace('email','ra?ro&x@uc.cl');
  return e==='' || (!/[?&]/.test(e.slice(7)) && e.includes('@'));
})());
chk('una dirección inválida no genera enlace', enlace('email','no-es-correo')==='');

console.log('\n=== Los otros dos canales ===');
chk('WhatsApp limpia el formato', enlace('whatsapp','+56 9 1234 5678')==='https://wa.me/56912345678');
chk('un teléfono corto no genera enlace', enlace('whatsapp','123')==='');
chk('Instagram saca el arroba', enlace('instagram','@alguien')==='https://www.instagram.com/alguien/');
chk('y no deja escapar de la ruta', enlace('instagram','a/../../evil')==='');
chk('un canal desconocido no genera nada', enlace('telegram','x')==='');

console.log('\n=== El precio nunca sale negativo ===');
// El formulario exige entre 1.000 y 500.000, así que un negativo solo llega de
// una fila corrupta. "$-500" en el catálogo es peor que no mostrar nada.
chk('un precio negativo se muestra como 0', !/-/.test(pesos(-500)));
chk('basura se muestra como 0', !/NaN|-/.test(pesos('abc')));
chk('un precio real se muestra igual', /12\.?000/.test(pesos(12000)));

console.log(`\n${ok} OK, ${fail} FAIL`);
process.exit(fail?1:0);
