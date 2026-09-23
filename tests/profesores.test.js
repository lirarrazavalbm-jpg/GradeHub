const assert=require('assert');
const fs=require('fs');
const path=require('path');

const raiz=path.join(__dirname,'..');
const jsPath=path.join(raiz,'profesores.js');
const sqlPath=path.join(raiz,'supabase','profesores.sql');
assert.ok(fs.existsSync(jsPath),'falta profesores.js');
assert.ok(fs.existsSync(sqlPath),'falta el SQL del registro de profesores');

const {
  limpiarTextoProfesor,normalizarNombreProfesor,coincidenNombresProfesor,
  seccionProfesorRamo,promedioProfesor,cursosProfesorSeguro,detalleProfesorSeguro
}=require(jsPath);
const sql=fs.readFileSync(sqlPath,'utf8');
const cliente=fs.readFileSync(jsPath,'utf8');
const html=fs.readFileSync(path.join(raiz,'index.html'),'utf8');
const css=fs.readFileSync(path.join(raiz,'styles.css'),'utf8');
const privacidad=fs.readFileSync(path.join(raiz,'privacidad.html'),'utf8');
const terminos=fs.readFileSync(path.join(raiz,'terminos.html'),'utf8');

assert.strictEqual(normalizarNombreProfesor('  MARÍA-José  Pérez  '),'maria jose perez','las tildes y separadores no deben partir el consenso');
assert.ok(coincidenNombresProfesor('María José Pérez','Maria Jsoe Perez'),'una transposición pequeña debe tolerarse');
assert.ok(coincidenNombresProfesor('Cristóbal González','Cristobal Gonzales'),'una letra y una tilde deben tolerarse');
assert.ok(!coincidenNombresProfesor('María José Pérez','Carlos Soto'),'dos profesores distintos no deben colapsar');
assert.strictEqual(limpiarTextoProfesor('Ana\u202E Pérez\n Soto',100),'Ana Pérez Soto','se deben quitar controles bidi y colapsar saltos');
assert.strictEqual(seccionProfesorRamo({seccion:12}),12);
assert.strictEqual(seccionProfesorRamo({seccion:'12'}),12);
assert.strictEqual(seccionProfesorRamo({seccion:0}),null,'sin sección no se puede aportar');
assert.strictEqual(promedioProfesor(4.5),4.5);
assert.strictEqual(promedioProfesor(8),null,'un promedio fuera de 1 a 5 no se pinta');

assert.deepStrictEqual(cursosProfesorSeguro('[{"ramo":"Cálculo I","clave":"MAT1610","seccion":2}]'),[
  {ramo:'Cálculo I',clave:'MAT1610',seccion:2,periodo:''}
]);
const detalle=detalleProfesorSeguro({
  id:'11111111-1111-4111-8111-111111111111',nombre_publico:'Profesora Ejemplo',promedio:4.8,total_resenas:2,
  cursos:[],puede_resenar:true,mi_resena:null,
  resenas:[{id:'22222222-2222-4222-8222-222222222222',rating:5,comentario:'Muy clara',fecha:'2026-09-22',es_mia:false,user_id:'NO DEBE SALIR'}]
});
assert.ok(detalle&&detalle.resenas.length===1);
assert.ok(!Object.prototype.hasOwnProperty.call(detalle.resenas[0],'user_id'),'el cliente debe copiar solo campos públicos de una reseña');

assert.match(sql,/unique \(user_id, tenant, ramo_clave, seccion, periodo\)/i,'cada cuenta debe contar una vez por ramo, sección y período');
assert.match(sql,/unique \(tenant, ramo_clave, seccion, periodo\)/i,'un semestre nuevo no debe heredar al profesor de la misma sección antigua');
assert.match(sql,/count\(distinct o\.user_id\)/i,'el umbral debe contar cuentas distintas');
assert.match(sql,/v_confirmaciones < 3/i,'menos de tres coincidencias no deben publicar una asociación');
assert.match(sql,/after delete on public\.profesor_menciones[\s\S]*profesor_mencion_borrada_reconciliar/i,'borrar una cuenta debe recalcular el consenso');
assert.match(sql,/profesor_nombres_coinciden/i,'el consenso debe usar comparación tolerante');
assert.match(sql,/extensions\.unaccent/i,'el servidor también debe perdonar tildes');
assert.match(sql,/unique \(user_id, profesor_id\)/i,'una cuenta debe tener una sola reseña editable por profesor');
assert.match(sql,/rating between 1 and 5/i,'las estrellas deben quedar limitadas en la base');
assert.match(sql,/primero confirma a este profesor en tu ramo y sección/i,'reseñar debe exigir pertenencia verificada');
assert.match(sql,/revoke all on public\.profesor_menciones from public, anon, authenticated/i,'las menciones no deben admitir lectura directa');
assert.match(sql,/revoke all on function public\.profesor_nombre_normalizar\(text\) from public, anon, authenticated/i,'las funciones internas no deben quedar expuestas por los privilegios por defecto de Supabase');
assert.match(sql,/revoke all on function public\.profesores_listar\(text,text\) from public, anon, authenticated[\s\S]*grant execute on function public\.profesores_listar\(text,text\) to authenticated/i,'la lista debe abrirse solo después de revocar explícitamente a anon');
assert.match(sql,/security definer[\s\S]+set search_path/i,'las RPC privilegiadas deben fijar search_path');
assert.doesNotMatch(sql,/\b(from|join|update|insert into)\s+(public\.)?gradehub_v1\b/i,'el registro no debe leer ni reescribir gradehub_v1');

const reporte=cliente.slice(cliente.indexOf("profesorRpc('profesor_reportar'"),cliente.indexOf("profesorRpc('profesor_reportar'")+500);
assert.ok(reporte.includes('p_tenant')&&reporte.includes('p_ramo_clave')&&reporte.includes('p_seccion')&&reporte.includes('p_nombre'));
assert.ok(reporte.includes('p_periodo')&&/periodo:typeof semester===/.test(cliente),'el aporte debe usar el período actual que GradeHub ya calcula');
assert.doesNotMatch(reporte,/p_(nota|promedio|gpa|categorias)/i,'el aporte de profesor no debe mandar datos académicos');
assert.doesNotMatch(cliente,/gradehub_v1|localStorage|\bsave\s*\(/,'el registro no debe migrar ni reescribir el estado académico local');

assert.ok(html.includes('id="screen-profesores"')&&html.includes('id="nav-profesores"'),'falta la lista navegable de profesores');
assert.ok(html.includes('id="ramo-profesor"'),'falta el registro dentro de la ficha del ramo');
const docCss=css.slice(css.indexOf('/* REGISTRO COMUNITARIO DE PROFESORES'),css.indexOf('/* SCREEN TRANSITIONS */'));
assert.doesNotMatch(docCss,/var\(--(green|yellow|red)(?:-|\))/,'las estrellas no pueden reutilizar el semáforo académico');
assert.match(privacidad,/Estudiante verificado/,'la política debe explicar cómo se publica una reseña');
assert.match(privacidad,/aportes de profesores, reseñas/,'borrar la cuenta debe incluir el contenido comunitario propio');
assert.match(terminos,/Reseña solo una experiencia propia/,'los términos deben fijar reglas de contenido y moderación');
assert.match(terminos,/puede reportar una ajena/,'los términos deben explicar el camino de reporte');

console.log('✓ registro de profesores: consenso, privacidad, reseñas y navegación');
