// Pack de clases y descuento por venir de GradeHub (pedido de Lucas del
// 2026-09-30, con el pack de 4 clases de Salva Ramos). El precio guardado sigue
// siendo POR CLASE; el pack solo lo multiplica. El descuento lo fija GradeHub:
// el profesor no tiene permiso de escribirlo.
const fs=require('fs'),vm=require('vm'),path=require('path');
const raiz=path.join(__dirname,'..');
const ctx={console,esc:s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),currentUser:null,supabaseClient:null};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(raiz,'marketplace.js'),'utf8'),ctx);
const run=s=>vm.runInContext(s,ctx);
let ok=0,fail=0;const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

const base={id:'x',precio_clp:12500,titulo:'Clase sintética',ramos_siglas:['MAT1610']};
ctx.__a=a=>JSON.parse(JSON.stringify(a));

console.log('=== Cuentas ===');
ctx.__p={...base,pack_clases:4,descuento_gradehub_pct:10};
let p=run('preciosClase(__p)');
chk('pack de 4 a $12.500 son $50.000',p.packTotal===50000);
chk('con 10% queda en $45.000',p.packFinal===45000);
chk('y por clase $11.250',p.porClase===12500&&p.porClaseFinal===11250);
ctx.__p={...base};
p=run('preciosClase(__p)');
chk('sin pack ni descuento no cambia nada',p.pack===null&&p.descuento===null&&p.porClaseFinal===12500);
ctx.__p={...base,precio_clp:0,pack_clases:4,descuento_gradehub_pct:10};
chk('una clase gratis sigue siendo "Gratis"',run('precioClase(__p)')==='Gratis');
ctx.__p={...base,descuento_gradehub_pct:80};
chk('un descuento fuera de rango se ignora',run('preciosClase(__p)').porClaseFinal===12500);

console.log('\n=== Cómo se lee ===');
ctx.__p={...base,pack_clases:4,descuento_gradehub_pct:10};
chk('línea corta: "$45.000 pack de 4"',run('precioClase(__p)')==='$45.000 pack de 4');
let html=run('precioCatalogoHTML(__p)');
chk('el total del pack va tachado',/<del>[^]*\$50\.000<\/del>/.test(html));
chk('y el precio con descuento al lado',/\$45\.000 <small>pack de 4<\/small>/.test(html));
chk('el chip dice de dónde viene el descuento',/−10% por venir de GradeHub/.test(html));
chk('el precio por clase también, tachado y con descuento',/<del>[^]*\$12\.500<\/del> \$11\.250 por clase/.test(html));
chk('lo tachado se anuncia como "antes" a lectores de pantalla',(html.match(/sr-precio">antes/g)||[]).length===2);
ctx.__p={...base,pack_clases:4};
html=run('precioCatalogoHTML(__p)');
chk('pack sin descuento: nada tachado',!/<del>/.test(html)&&/\$50\.000 <small>pack de 4<\/small>/.test(html)&&!/por venir de GradeHub/.test(html));
ctx.__p={...base};
chk('sin pack: se ve igual que antes',/\$12\.500 <small>por clase<\/small>/.test(run('precioCatalogoHTML(__p)')));

console.log('\n=== El filtro usa lo que paga el estudiante ===');
ctx.__lista=[{...base,id:'con',descuento_gradehub_pct:10},{...base,id:'sin'}];
chk('$11.250 entra en "hasta $12.000" y $12.500 no',
  run("filtrarPrecioCatalogoClases(__lista,{hasta:'12000'}).anuncios.map(a=>a.id).join()")==='con');

console.log('\n=== El profesor pone el pack; el descuento, no ===');
const src=fs.readFileSync(path.join(raiz,'marketplace.js'),'utf8');
const validar=src.slice(src.indexOf('function validarBorradorClase'),src.indexOf('const ERROR_CONTACTO_CLASE'));
chk('la validación devuelve pack_clases',/precio_clp:entrada\.precio_clp,pack_clases,/.test(validar));
chk('y nunca descuento_gradehub_pct',!/descuento_gradehub_pct/.test(validar));
const sql=fs.readFileSync(path.join(raiz,'supabase/clases_pack_descuento.sql'),'utf8');
chk('el profesor puede escribir el pack',/grant insert \(pack_clases\)/.test(sql)&&/grant update \(pack_clases\)/.test(sql));
chk('pero no el descuento',!/grant (insert|update) \([^)]*descuento_gradehub_pct/.test(sql));
chk('el descuento se fija con una función de admin cerrada',/create or replace function admin\.descuento_anuncio/.test(sql)&&/revoke all on function admin\.descuento_anuncio[^;]*from public, anon, authenticated/.test(sql));
chk('el descuento está acotado en la base',/descuento_gradehub_pct between 1 and 50/.test(sql));
chk('el descuento no va en verde',!/catalogo-clase-descuento\{[^}]*--green/.test(fs.readFileSync(path.join(raiz,'styles.css'),'utf8')));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
