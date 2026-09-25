// El formulario del profesor escribe los datos como se leen —$15.000,
// +56 9 1234 5678, @usuario— y la página de Clases no le dice "publicado" a una
// campaña que ya terminó.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'..','marketplace.js'),'utf8');
const ctx={console,Intl,S:{tenant:'uc'},currentUser:{id:'u1'},supabaseClient:null,
  document:{getElementById(){return null;}},esc:s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')};
vm.createContext(ctx);vm.runInContext(src,ctx);
const run=s=>vm.runInContext(s,ctx);
let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

console.log('=== Pesos ===');
chk('15000 se ve $15.000',run("textoPesosEscrito('15000')")==='$15.000');
chk('1000000 se ve $1.000.000',run("textoPesosEscrito('1000000')")==='$1.000.000');
chk('lo que no es dígito se ignora',run("textoPesosEscrito('$1.5a00')")==='$1.500');
chk('vacío queda vacío, no "$0"',run("textoPesosEscrito('')")===''&&run("textoPesosEscrito('$')")==='');
chk('ceros a la izquierda no se muestran',run("textoPesosEscrito('0015')")==='$15');
chk('el número sale del texto con formato',run("pesosDeTexto('$15.000')")===15000);
chk('sin dígitos no es un precio',Number.isNaN(run("pesosDeTexto('$')")));
chk('un precio guardado se muestra con formato al reabrir',run("textoPesosEscrito(18000)")==='$18.000');

console.log('\n=== WhatsApp e Instagram ===');
chk('+56 9 se completa con sus espacios',run("textoWhatsappEscrito('+56912345678')")==='+56 9 1234 5678');
chk('a medio escribir también',run("textoWhatsappEscrito('+56 9 123')")==='+56 9 123'&&run("textoWhatsappEscrito('+56 9 12345')")==='+56 9 1234 5');
chk('no pasa de 8 dígitos después del 9',run("textoWhatsappEscrito('+56 9 1234 56789')")==='+56 9 1234 5678');
chk('un número de otro país se deja como está',run("textoWhatsappEscrito('+54 11 5555 1234')")==='+54 11 5555 1234');
chk('Instagram lleva @',run("textoInstagramEscrito('profe.calculo')")==='@profe.calculo'&&run("textoInstagramEscrito('@profe')")==='@profe');
chk('los prefijos son exactamente "+56 9 " y "@"',run("PREFIJO_CONTACTO_CLASE.whatsapp")==='+56 9 '&&run("PREFIJO_CONTACTO_CLASE.instagram")==='@');

console.log('\n=== Un prefijo solo no es un contacto ===');
const base="({tenant:'uc',ramos_siglas:['MAT1610'],criterios:{promedioMenorA:5,avanceMinimo:20},modalidad:'individual',ubicacion:'online',precio_clp:15000,titulo:'Clases de Cálculo I',descripcion:'Repasamos ejercicios y preparamos evaluaciones.'})";
const valida=(tipo,valor)=>run(`validarBorradorClase({...${base},contacto_tipo:${JSON.stringify(tipo)},contacto_valor:${JSON.stringify(valor)}})`);
chk('"+56 9 " sin número no pasa',!valida('whatsapp','+56 9 ').ok&&/WhatsApp/.test(valida('whatsapp','+56 9 ').error));
chk('"@" sin usuario no pasa',!valida('instagram','@').ok);
chk('un número completo sí pasa',valida('whatsapp','+56 9 1234 5678').ok);
chk('un usuario con @ sí pasa',valida('instagram','@profe.calculo').ok);
chk('un correo mal escrito no pasa',!valida('email','profe@').ok);

console.log('\n=== Cursor al formatear ===');
// Un input de mentira: escribir un dígito en medio no manda el cursor al final.
function input(valor,cursor){
  const h={};return {value:valor,selectionStart:cursor,addEventListener(t,f){h[t]=f;},
    setSelectionRange(a){this.selectionStart=a;},disparar(e){h.input(e||{});}};
}
ctx.__i=input('$1.0005',7);run('campoPesos(__i)');ctx.__i.disparar({inputType:'insertText'});
chk('agregar un dígito reordena los puntos',ctx.__i.value==='$10.005');
ctx.__i=input('$15.0000',3);run('campoPesos(__i)');ctx.__i.disparar({inputType:'insertText'});
chk('el cursor queda después del mismo dígito',ctx.__i.value==='$150.000'&&ctx.__i.selectionStart===3);
ctx.__i=input('+56 9',5);run("formatearAlEscribir(__i,textoWhatsappEscrito)");ctx.__i.disparar({inputType:'deleteContentBackward'});
chk('borrar no vuelve a poner lo borrado',ctx.__i.value==='+56 9');

console.log('\n=== La página de Clases ===');
const ahora=Date.parse('2026-09-25T12:00:00Z');ctx.__ahora=ahora;
const a=(estado,extra)=>Object.assign({id:estado,estado,titulo:'Clase',ramos_siglas:['MAT1620']},extra||{});
ctx.__lista=[a('publicado',{vence_at:'2026-10-10T00:00:00Z',publicado_at:'2026-09-10T00:00:00Z'}),
  Object.assign(a('publicado',{vence_at:'2026-09-20T00:00:00Z'}),{id:'vencido'}),
  a('en_revision'),a('borrador'),a('pausado')];
const g=run('gruposPanelClases(__lista,__ahora)');
chk('un publicado vencido cuenta como terminado',run("vigenciaAnuncio(__lista[1],__ahora)")==='expirado'&&g.cerrados.some(x=>x.id==='vencido'));
chk('y no entra al resumen de activas',g.activos.length===1&&g.activos[0].id==='publicado');
chk('cada estado va a su sección',g.revision.length===1&&g.borradores.length===1&&g.cerrados.length===2);
chk('quedan 15 días de campaña',run("diasRestantesAnuncio(__lista[0],__ahora)")===15);
const html=run("tarjetaPanelClase(__lista[1],n=>'$'+n,__ahora)");
chk('el vencido se ofrece volver a publicar, no pausar',/data-retomar="vencido"/.test(html)&&!/data-pausar/.test(html)&&/Terminado/.test(html));
chk('un borrador se puede seguir editando',/data-editar="borrador"/.test(run("tarjetaPanelClase(__lista[3],n=>'$'+n,__ahora)")));
chk('el embudo no se dibuja con width',!/width/.test(run("embudoClase({impresion:40,clic:10,contacto:4})")));

console.log('\nPASS: '+ok+'   FAIL: '+fail);
process.exit(fail?1:0);
