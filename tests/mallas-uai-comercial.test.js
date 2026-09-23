// Las tres carreras más pobladas de la UAI —Ingeniería Comercial, su
// bachillerato e Ingeniería Civil Industrial— eran declarables pero no tenían
// malla: el estudiante se declaraba bien y no recibía ninguna sugerencia de
// ramos. No falla nada, solo no aparece.
//
// Estas mallas no se pueden verificar contra su PDF desde un test, así que lo
// que se fija acá es lo que sí es comprobable: que estén enlazadas, que no
// traigan casilleros y que sean consistentes con lo que ya sabíamos de la UAI
// por otras vías.
const fs=require('fs'),vm=require('vm'),path=require('path');
const raiz=path.join(__dirname,'..');
const ctx={};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(raiz,'mallas-uai.js'),'utf8'),ctx);
const datos=fs.readFileSync(path.join(raiz,'data.js'),'utf8');
let ok=0,fail=0;const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};
const M=ctx.MALLAS_UAI_EXTRA;
const ramosDe=k=>Object.values(M[k]||{}).flat();

console.log('=== Las tres carreras tienen malla y están enlazadas ===');
[['UAI-INGENIERIA-COMERCIAL','Ingeniería Comercial'],
 ['UAI-BACHILLERATO-DE-INGENIERIA-COMERCIAL','Bachillerato de Ingeniería Comercial'],
 ['UAI-INGENIERIA-CIVIL-INDUSTRIAL','Ingeniería Civil Industrial']].forEach(([k,nombre])=>{
  chk(`${nombre} tiene malla`, !!M[k] && ramosDe(k).length>10);
  // Sin el enlace en CARRERAS_DECLARABLES la malla existe pero nadie la alcanza.
  chk(`${nombre} está enlazada desde la carrera`,
    new RegExp(`\\{n:'${nombre.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&')}',malla:'${k}'\\}`).test(datos));
});

console.log('\n=== Ningún casillero se coló ===');
// "Minor I", "Electivo", "Optativo" no nombran un curso: son huecos del plan y
// en la lista de ramos se leen como si el estudiante tuviera que cursarlos.
const CASILLERO=/^(electivo|optativo|disciplinar|especializaci[oó]n|formaci[oó]n general|minor|major)\b/i;
const colados=Object.entries(M).flatMap(([k,c])=>Object.values(c).flat().filter(r=>CASILLERO.test(r)).map(r=>`${k}: ${r}`));
chk('ninguna malla UAI trae casilleros'+(colados.length?' → '+colados.slice(0,3).join(' · '):''), colados.length===0);
chk('ningún semestre quedó vacío',
  Object.values(M).every(c=>Object.values(c).every(l=>Array.isArray(l)&&l.length>0)));

console.log('\n=== Consistencia con lo que ya sabíamos de la UAI ===');
// Las pautas UAI se transcriben de programas oficiales, y la malla de otra
// fuente. Que cada pauta corresponda a un ramo que la malla conoce es la
// validación cruzada de que ninguna de las dos salió de la nada.
const bloque=datos.slice(datos.indexOf('const PRESETS_UAI'));
const presets=[...bloque.slice(0,bloque.indexOf('\nconst ')).matchAll(/^  '([^']+)':/gm)].map(m=>m[1]);
const enAlgunaMalla=new Set(Object.values(M).flatMap(c=>Object.values(c).flat()));
// Pautas con programa oficial en mano de un ramo que las mallas NO tienen. No
// es una excepción para que el test pase: es la lista de huecos detectados, y
// cada una dice qué falta comprobar. Si se resuelve, se saca de acá.
const FUERA_DE_MALLA={
  // Programa CORE oficial 2026-2 de un estudiante de Comercial que lo cursa en
  // SEGUNDO semestre. Las mallas solo tienen "Civilización Contemporánea", sin
  // número, en primero, y ponen "Literatura y Humanidades" como el CORE de
  // segundo. Falta confirmar si la secuencia CORE cambió o si hay más de una.
  'Civilización Contemporánea II':'la malla no tiene la II; ver si la secuencia CORE cambió',
};
const huerfanas=presets.filter(p=>!enAlgunaMalla.has(p)&&!FUERA_DE_MALLA[p]);
chk('cada pauta UAI corresponde a un ramo de alguna malla'+(huerfanas.length?' → '+huerfanas.join(' · '):''),
  presets.length>0 && huerfanas.length===0);
// Que la lista de huecos no se llene en silencio: si crece, hay que mirar las
// mallas en vez de seguir agregando excepciones.
chk(`los huecos conocidos entre pauta y malla siguen siendo pocos (${Object.keys(FUERA_DE_MALLA).length})`,
  Object.keys(FUERA_DE_MALLA).length<=3);

// El plan común de ingeniería de la UAI está en seis mallas transcritas aparte.
// Industrial tiene que calzar con ellas o una de las dos fuentes está mal.
const otrasIng=Object.keys(M).filter(k=>/^UAI-INGENIERIA-CIVIL-(INFORMATICA|OBRAS-CIVILES|EN-ENERGIA|MECANICA|EN-MINERIA)$/.test(k));
const ind=M['UAI-INGENIERIA-CIVIL-INDUSTRIAL'];
[1,2,3].forEach(s=>{
  const iguales=otrasIng.filter(k=>JSON.stringify(M[k][s])===JSON.stringify(ind[s]));
  chk(`el ${s}° semestre de Industrial calza con el plan común (${iguales.length}/${otrasIng.length})`, iguales.length>=4);
});

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
