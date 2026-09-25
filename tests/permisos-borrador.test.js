// Todo lo que el formulario escribe en un borrador tiene que tener permiso en
// el servidor, al crearlo Y al editarlo.
//
// Pasó el 2026-09-25: la edición mandaba `tenant` y el SQL no lo concedía para
// UPDATE. Postgres rechaza el UPDATE entero por una sola columna, así que
// ninguna edición de un borrador guardado funcionaba, y los tests no lo veían
// porque simulan Supabase. Este lee los grants reales del SQL.
const fs=require('fs'),path=require('path'),vm=require('vm');
const raiz=path.join(__dirname,'..');
const sql=fs.readFileSync(path.join(raiz,'supabase/clases_particulares.sql'),'utf8').split('\n').map(l=>l.replace(/--.*$/,'')).join('\n');
const ctx={console};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(raiz,'marketplace.js'),'utf8'),ctx);
let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

const concedidas=tipo=>{
  const cols=new Set();
  const re=new RegExp('grant\\s+'+tipo+'\\s*\\(([^)]*)\\)\\s*on\\s+public\\.tutor_anuncios\\s+to\\s+[^;]*authenticated','gi');
  for(const m of sql.matchAll(re))m[1].split(',').forEach(c=>cols.add(c.trim()));
  return cols;
};
const r=vm.runInContext(`validarBorradorClase({tenant:'uc',ramos_siglas:['MAT1610'],criterios:{promedioMenorA:5,avanceMinimo:20},
  modalidad:'otra',modalidad_otra:'Grupos de 3',ubicacion:'online',detalles:[{etiqueta:'Duración',valor:'90 minutos'}],
  precio_clp:15000,titulo:'Clases de Cálculo I',descripcion:'Repasamos ejercicios y preparamos evaluaciones.',
  contacto_tipo:'whatsapp',contacto_valor:'+56 9 1234 5678'})`,ctx);
chk('el borrador de ejemplo es válido',r.ok);
const campos=Object.keys(r.datos);
const insert=concedidas('insert'),update=concedidas('update');
const faltaInsert=campos.filter(c=>!insert.has(c)),faltaUpdate=campos.filter(c=>!update.has(c));
chk('crear: cada campo del formulario tiene INSERT'+(faltaInsert.length?' (falta '+faltaInsert+')':''),!faltaInsert.length);
chk('editar: cada campo del formulario tiene UPDATE'+(faltaUpdate.length?' (falta '+faltaUpdate+')':''),!faltaUpdate.length);
chk('y nunca se concede escribir el estado de pago o revisión',
  !['pagado_at','revisado_at','publicado_at','vence_at','autor_id'].some(c=>update.has(c)));
console.log('\nPASS: '+ok+'   FAIL: '+fail);
process.exit(fail?1:0);
