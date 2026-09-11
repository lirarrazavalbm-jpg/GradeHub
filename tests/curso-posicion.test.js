// "Cómo vas en tus ramos" muestra el lugar del estudiante entre quienes cursan
// lo mismo. Es la primera vez que GradeHub cruza datos entre cuentas, así que lo
// que se fija acá no es la apariencia sino los límites.
const fs=require('fs'),path=require('path');
const raiz=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(raiz,'app.js'),'utf8');
const render=fs.readFileSync(path.join(raiz,'render-main.js'),'utf8');
const sql=fs.readFileSync(path.join(raiz,'supabase','curso_posicion.sql'),'utf8');
// Los comentarios del archivo explican estas mismas reglas, así que buscar en
// ellos da falsos positivos: la prosa que dice "no se filtra cuántos faltan"
// contiene la palabra que el test busca. Se mira solo el código.
const sqlCodigo=sql.split('\n').filter(l=>!l.trim().startsWith('--')).join('\n');
let ok=0,fail=0;const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

console.log('=== Ninguna nota ajena llega al navegador ===');
// El cliente pide una posición, no un listado. Si algún día alguien hace que
// `curso_posicion` devuelva las notas del curso para calcular el porcentaje en
// el navegador, el dato queda expuesto aunque la pantalla muestre solo un %.
chk('la función del servidor devuelve dos enteros y nada más',
  /returns table \(total integer, mejor_que integer\)/.test(sql));
chk('la tabla no se puede leer desde el cliente',
  /revoke all on public\.curso_notas from anon, authenticated/.test(sql) &&
  /alter table public\.curso_notas enable row level security/.test(sql));
// `auth.uid()` no es parámetro: no hay forma de escribir la fila de otro.
chk('cada quien solo puede escribir su propia nota',
  /uid uuid := auth\.uid\(\)/.test(sql) && !/p_user_id/.test(sql));

console.log('\n=== El piso de cinco se respeta ===');
chk('bajo cinco participantes no se devuelve nada', /if n < 5 then\s*\n\s*return;/.test(sql));
// Decir "te faltan 2 para ver la comparación" también informa sobre cuántos
// hay, y de ahí sobre quiénes son.
chk('y no se filtra cuántos faltan para llegar',
  !/faltan/i.test(sqlCodigo) && !/5\s*-\s*n/.test(sqlCodigo));

console.log('\n=== Solo participan los ramos con sigla ===');
// Sin sigla no hay forma de saber que la "Dinámica" de uno es la del otro:
// juntar dos ramos distintos haría que la posición no signifique nada.
// Un ramo NO guarda su sigla como propiedad: la app la deriva del nombre. La
// primera versión filtraba por `r.sigla`, que es undefined en todos, así que no
// subía nada y la sección no aparecía nunca.
chk('la sigla se deriva, no se asume guardada en el ramo',
  /function siglaParaCurso[\s\S]{0,200}siglaDeRamo\(r\)/.test(app));
chk('y un ramo sin sigla se omite en vez de mandarse',
  /const sigla=siglaParaCurso\(r\);\s*\n\s*if\(!sigla\)continue;/.test(app));
chk('y el servidor descarta la fila sin sigla', /sigla is null or tenant is null/.test(sql));

console.log('\n=== Se manda el promedio que el estudiante ya ve ===');
// Recalcularlo por otro camino es lo que hizo que el simulador mostrara 6,22
// donde la app decía 6,03. Hay una sola fórmula de promedio.
chk('el promedio sale de ramoAvg, no de una cuenta nueva',
  /subirNotasCurso[\s\S]{0,300}ramoAvg\(r,undefined,S\.ramos\)/.test(app));
chk('un ramo sin notas sale del curso en vez de congelarse',
  /p_promedio:\(avg===null\|\|avg===undefined\)\?null:avg/.test(app) &&
  /p_promedio is null then[\s\S]{0,200}delete from public\.curso_notas/.test(sql));

console.log('\n=== La sección no puede romper Estadísticas ===');
chk('la comparación se pinta aparte y no bloquea el render',
  /body\.innerHTML=html;[\s\S]{0,300}pintarPosicionesCurso\(\)/.test(render) &&
  !/await pintarPosicionesCurso/.test(render));
chk('si la consulta falla, la pantalla sigue de pie', /catch\(e\)\{\}/.test(app));
// Un catch mudo fue lo que hizo que esto llevara días sin funcionar sin que
// nadie se enterara. El cliente de Supabase DEVUELVE el error en vez de
// lanzarlo, así que sin este `throw` el catch no se activa jamás.
chk('pero un rechazo del servidor no se pierde en silencio',
  /if\(error\)throw error;/.test(app) && /No se pudieron subir/.test(app));

console.log('\n=== Quien no quiera verla, no la ve ===');
chk('el interruptor esconde la sección', /if\(!S\.ocultarCurso\)/.test(render));
chk('y existe en Ajustes', /toggleVerCurso/.test(app));
// El total va al lado del porcentaje: con cinco participantes "75%" solo puede
// ser 0, 25, 50, 75 o 100, y sin saber cuántos son suena más fino de lo que es.
chk('el porcentaje nunca va solo, siempre con cuántos son',
  /\$\{p\.total\} llevan este ramo/.test(render));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
