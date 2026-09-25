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

console.log('\n=== Formato, lugar y detalles a medida ===');
const conCampos=extra=>run(`validarBorradorClase({...${base},contacto_tipo:'email',contacto_valor:'profe@ejemplo.cl',...${JSON.stringify(extra)}})`);
chk('formato y lugar se pueden dejar sin indicar',(r=>r.ok&&r.datos.modalidad===null&&r.datos.ubicacion===null)(conCampos({modalidad:'',ubicacion:''})));
chk('"Otra" guarda su texto',(r=>r.ok&&r.datos.ubicacion==='otra'&&r.datos.ubicacion_otra==='En la biblioteca')(conCampos({ubicacion:'otra',ubicacion_otra:' En la biblioteca '})));
chk('"Otra" sin texto no pasa',!conCampos({modalidad:'otra',modalidad_otra:''}).ok);
chk('el texto de "Otra" no se guarda si no se eligió "Otra"',conCampos({modalidad:'grupal',modalidad_otra:'basura'}).datos.modalidad_otra===null);
chk('una opción inventada no pasa',!conCampos({modalidad:'vip'}).ok);
chk('los detalles vacíos se descartan',(r=>r.ok&&r.datos.detalles===null)(conCampos({detalles:[{etiqueta:'',valor:''}]})));
chk('un detalle se guarda recortado',JSON.stringify(conCampos({detalles:[{etiqueta:' Duración ',valor:'90 minutos '}]}).datos.detalles)==='[{"etiqueta":"Duración","valor":"90 minutos"}]');
chk('un detalle a medias no pasa',!conCampos({detalles:[{etiqueta:'Duración',valor:''}]}).ok);
chk('no más de cuatro',!conCampos({detalles:Array.from({length:5},()=>({etiqueta:'a',valor:'b'}))}).ok);
chk('ni textos largos',!conCampos({detalles:[{etiqueta:'x'.repeat(31),valor:'b'}]}).ok&&!conCampos({detalles:[{etiqueta:'a',valor:'x'.repeat(81)}]}).ok);
chk('un detalle no puede traer campos extra al servidor',Object.keys(conCampos({detalles:[{etiqueta:'a',valor:'b',href:'http://x'}]}).datos.detalles[0]).join()==='etiqueta,valor');
chk('el catálogo muestra el texto de "Otra"',run("formatoClase({modalidad:'otra',modalidad_otra:'Grupos de 3',ubicacion:'online'})")==='Grupos de 3 · Online');
chk('y nada si no se indicó',run("formatoClase({modalidad:null,ubicacion:null})")==='');

console.log('\n=== Qué va bajo el título ===');
const conDetalle={detalles:[{etiqueta:'Duración',valor:'90 minutos'}]};
chk('sin elegir nada queda null: lo de siempre',conCampos(conDetalle).datos.linea_datos===null);
chk('se puede elegir un detalle',JSON.stringify(conCampos({...conDetalle,linea_datos:['precio','detalle:Duración']}).datos.linea_datos)==='["precio","detalle:Duración"]');
chk('un detalle que no existe no pasa',!conCampos({...conDetalle,linea_datos:['detalle:Incluye']}).ok);
chk('ninguno no pasa',!conCampos({linea_datos:[]}).ok);
chk('más de tres no pasa',!conCampos({...conDetalle,modalidad:'grupal',ubicacion:'online',linea_datos:['modalidad','ubicacion','precio','detalle:Duración']}).ok);
chk('una clave inventada no pasa',!conCampos({linea_datos:['href']}).ok);
const aviso={modalidad:'grupal',ubicacion:'online',precio_clp:15000,detalles:[{etiqueta:'Duración',valor:'90 minutos'}]};
ctx.__aviso=aviso;
chk('un anuncio viejo muestra formato, lugar y precio',run('lineaDatosClase(__aviso)')==='Grupal · Online · $15.000');
ctx.__aviso={...aviso,linea_datos:['detalle:Duración','precio']};
chk('lo elegido sale en el orden del formulario',run('lineaDatosClase(__aviso)')==='$15.000 · 90 minutos');
ctx.__aviso={...aviso,linea_datos:['detalle:Borrado','precio']};
chk('un detalle que ya no está se salta',run('lineaDatosClase(__aviso)')==='$15.000');

console.log('\n=== Si el servidor todavía no tiene las columnas nuevas ===');
(async()=>{
  const pedidas=[];
  // Falta la capa más vieja (detalles): se baja capa por capa hasta los campos de siempre.
  ctx.__hacer=async campos=>{pedidas.push(campos);return campos.includes('detalles')?{data:null,error:{code:'42703',message:'column tutor_anuncios.detalles does not exist'}}:{data:[1],error:null};};
  const r=await run('consultaCamposClase(__hacer,"id,titulo")');
  chk('repite la consulta con los campos de siempre',r.data&&pedidas[pedidas.length-1]==='id,titulo');
  const antes=pedidas.length;
  await run('consultaCamposClase(__hacer,"id,titulo")');
  chk('y no vuelve a pedir las nuevas',pedidas.length===antes+1&&pedidas[antes]==='id,titulo');
  // Falta solo la última (linea_datos): se conservan formato, lugar y detalles.
  run('capasColumnasClase=CAPAS_CAMPOS_CLASE.length');pedidas.length=0;
  ctx.__hacer=async campos=>{pedidas.push(campos);return campos.includes('linea_datos')?{data:null,error:{code:'PGRST204',message:"Could not find the 'linea_datos' column"}}:{data:[1],error:null};};
  await run('consultaCamposClase(__hacer,"id")');
  chk('sin linea_datos se siguen pidiendo los detalles',pedidas.length===2&&pedidas[1]==='id,modalidad_otra,ubicacion_otra,detalles');
  run('capasColumnasClase=CAPAS_CAMPOS_CLASE.length');
  ctx.__hacer=async()=>({data:null,error:{code:'42501',message:'permission denied'}});
  const otro=await run('consultaCamposClase(__hacer,"id")');
  chk('un error distinto no se disfraza de columna faltante',otro.error&&otro.error.code==='42501'&&run('capasColumnasClase')===run('CAPAS_CAMPOS_CLASE.length'));
  terminar();
})();

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

function terminar(){console.log('\nPASS: '+ok+'   FAIL: '+fail);process.exit(fail?1:0);}
