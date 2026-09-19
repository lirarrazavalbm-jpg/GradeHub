// Un borrador no puede decir "guardado" si la red falló ni pasar a publicado
// porque el formulario añadió por error una propiedad privilegiada.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(process.env.GRADEHUB_MARKETPLACE||path.join(__dirname,'..','marketplace.js'),'utf8');
const dueno='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const ajeno='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const anuncioId='cccccccc-cccc-4ccc-cccc-cccccccccccc';
const ctx={currentUser:{id:dueno},supabaseClient:null,console};
vm.createContext(ctx);vm.runInContext(src,ctx);
const run=s=>vm.runInContext(s,ctx);
if(!['validarBorradorClase','abrirBorradorClase','guardarBorradorClase','enviarBorradorClase'].every(n=>run(`typeof ${n}`)==='function')){
  console.error('FAIL: falta el ciclo de vida del borrador');process.exit(1);
}
let rows=[],fallar=false;
const calls=[];
ctx.supabaseClient={from(tabla){
  if(tabla!=='tutor_anuncios')throw Error('Tabla inesperada');
  const q={tipo:'select',filtros:[],orden:null,datos:null,campos:''};
  calls.push(q);
  const builder={
    select(campos){q.campos=campos;return this;},
    eq(campo,valor){q.filtros.push([campo,valor]);return this;},
    order(campo,opts){q.orden=[campo,opts.ascending];return this;},
    limit(){return this;},
    insert(datos){q.tipo='insert';q.datos=datos;return this;},
    update(datos){q.tipo='update';q.datos=datos;return this;},
    async single(){return resolver(q,true);},
    async maybeSingle(){return resolver(q,false);}
  };
  return builder;
}};
function resolver(q,obligatorio){
  if(fallar)return {data:null,error:{message:'red desconectada'}};
  if(q.tipo==='insert'){
    const row={...q.datos,id:anuncioId,estado:'borrador',created_at:'2026-09-19T12:00:00Z'};
    rows.push(row);return {data:row,error:null};
  }
  const encontrados=rows.filter(row=>row.autor_id===ctx.currentUser.id&&
    q.filtros.every(([clave,valor])=>row[clave]===valor));
  const row=encontrados[0];
  if(!row)return {data:null,error:obligatorio?{message:'sin fila'}:null};
  if(q.tipo==='update')Object.assign(row,q.datos);
  return {data:row,error:null};
}
const clase={
  tenant:'uc',ramos_siglas:['MAT1610'],criterios:{promedioMenorA:5,avanceMinimo:20},
  modalidad:'individual',ubicacion:'online',precio_clp:15000,
  titulo:'Clases de Cálculo I',descripcion:'Repasamos ejercicios y preparamos evaluaciones de Cálculo I.',
  contacto_tipo:'whatsapp',contacto_valor:'+56 9 1234 5678',
  estado:'publicado',pagado_at:'2099-01-01',notas:[1.0]
};
ctx.clase=clase;
let n=0;
function check(nombre,condicion){if(!condicion)throw Error(nombre);n++;}
(async()=>{
  const sinTitulo=await run('guardarBorradorClase({...clase,titulo:""})');
  check('un campo incompleto no escribe nada',!sinTitulo.ok&&sinTitulo.campo==='titulo'&&calls.length===0);
  const siglasRepetidas=await run('guardarBorradorClase({...clase,ramos_siglas:["MAT1610","mat1610"]})');
  check('una sigla repetida no se cuela como dos ramos',!siglasRepetidas.ok&&siglasRepetidas.campo==='ramos_siglas'&&calls.length===0);
  const guardado=await run('guardarBorradorClase(clase)');
  check('un anuncio completo se crea exclusivamente como borrador',guardado.ok&&guardado.anuncio.estado==='borrador'&&rows.length===1);
  check('la escritura solo lleva campos comerciales permitidos',!Object.keys(calls.at(-1).datos).some(k=>['estado','pagado_at','notas','flyer_path'].includes(k))&&
    calls.at(-1).datos.autor_id===dueno);
  check('ninguna consulta intenta leer autor_id público',calls.at(-1).campos.indexOf('autor_id')<0);
  const abierto=await run('abrirBorradorClase()');
  check('se puede reabrir el propio borrador',abierto.ok&&abierto.anuncio.id===anuncioId);
  ctx.currentUser={id:ajeno};
  const otro=await run(`abrirBorradorClase('${anuncioId}')`);
  check('otra cuenta no ve el borrador',otro.ok&&otro.anuncio===null);
  const otraEdicion=await run(`guardarBorradorClase(clase,'${anuncioId}')`);
  check('otra cuenta no puede editarlo ni recibir falso éxito',!otraEdicion.ok&&rows[0].autor_id===dueno);
  ctx.currentUser={id:dueno};
  const editado=await run(`guardarBorradorClase({...clase,titulo:'Clases de cálculo con ejercicios'},'${anuncioId}')`);
  check('editarlo conserva la identidad y no cambia su estado',editado.ok&&rows.length===1&&rows[0].estado==='borrador'&&rows[0].titulo==='Clases de cálculo con ejercicios');
  check('una edición está condicionada al estado borrador y la RLS',calls.at(-1).filtros.some(f=>f[0]==='estado'&&f[1]==='borrador'));
  fallar=true;
  const noGuardado=await run(`guardarBorradorClase(clase,'${anuncioId}')`);
  check('una caída de red no se anuncia como guardado',!noGuardado.ok&&/No se guardó/.test(noGuardado.error));
  const noEnviado=await run(`enviarBorradorClase('${anuncioId}')`);
  check('una caída de red no se anuncia como enviado',!noEnviado.ok&&rows[0].estado==='borrador');
  fallar=false;
  const enviado=await run(`enviarBorradorClase('${anuncioId}')`);
  check('enviar solo marca en revisión, nunca publica',enviado.ok&&rows[0].estado==='en_revision'&&
    !calls.at(-1).datos.publicado_at&&calls.at(-1).datos.estado==='en_revision');
  const otraVez=await run(`enviarBorradorClase('${anuncioId}')`);
  check('no se puede reenviar un anuncio que ya salió de borrador',!otraVez.ok&&rows[0].estado==='en_revision');
  console.log(`Borradores OK: ${n}`);
})().catch(error=>{console.error('FAIL:',error.message);process.exitCode=1;});
