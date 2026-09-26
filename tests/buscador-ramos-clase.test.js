// El profesor elige los ramos de su clase buscando por nombre o sigla, no
// escribiendo la sigla exacta a mano. Índice de ejemplo escrito acá.
const fs=require('fs'),path=require('path'),vm=require('vm');
const raiz=path.join(__dirname,'..');
const ctx={console,Intl,URL,S:{tenant:'uc'},esc:s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(raiz,'marketplace.js'),'utf8'),ctx);
// normBusqueda vive en app.js; se copia la regla mínima para no cargar la app.
vm.runInContext("function normBusqueda(s){const R={i:'1',ii:'2',iii:'3',iv:'4'};return String(s||'').split(' ').map(t=>R[t]||t).join(' ');}",ctx);
let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};
ctx.__i={MAT1492:'Álgebra e Introducción al Cálculo',MAT1610:'Cálculo I',MAT1620:'Cálculo II',MAT1630:'Cálculo III',FIS1514:'Dinámica',ICE1514:'Dinámica (ICE1514)',IIC1103:'Introducción a la Programación'};
const buscar=(q,elegidas=[])=>vm.runInContext(`buscarRamosParaClase(__i,${JSON.stringify(q)},${JSON.stringify(elegidas)})`,ctx);
chk('por nombre sin tildes',['MAT1610','MAT1620','MAT1630'].every(sg=>buscar('calculo').some(x=>x.sigla===sg)));
chk('un número no calza con dígitos sueltos de otra sigla',!buscar('calculo 2').some(x=>x.sigla==='MAT1492'));
chk('"cálculo 2" encuentra Cálculo II',buscar('cálculo 2')[0]?.sigla==='MAT1620');
chk('por sigla parcial',buscar('mat16')[0]?.sigla==='MAT1610');
chk('la sigla exacta va primero',buscar('MAT1620')[0]?.sigla==='MAT1620');
chk('por palabras sueltas',buscar('intro program')[0]?.sigla==='IIC1103');
chk('no repite lo ya elegido',!buscar('calculo',['MAT1620']).some(x=>x.sigla==='MAT1620'));
chk('una sigla que no está en el índice se puede usar igual',buscar('QIM100E').some(x=>x.sigla==='QIM100E'&&/Usar/.test(x.nombre)));
chk('pero una palabra suelta no se ofrece como sigla',!buscar('hola').some(x=>/Usar/.test(x.nombre)));
chk('vacío no muestra nada',buscar('  ').length===0);

const valida=siglas=>vm.runInContext(`validarBorradorClase({tenant:'uc',ramos_siglas:${JSON.stringify(siglas)},criterios:{promedioMenorA:5,avanceMinimo:20},
  precio_clp:15000,titulo:'Clases de Cálculo',descripcion:'Repasamos ejercicios y preparamos evaluaciones.',contacto_tipo:'whatsapp',contacto_valor:'+56 9 1234 5678'},__i)`,ctx);
chk('hasta dos ramos por anuncio: uno pasa',valida(['MAT1620']).ok);
chk('dos también, como Dinámica ICE1514 y FIS1514',valida(['ICE1514','FIS1514']).ok);
chk('pero no dos ramos distintos: esos son dos anuncios',(r=>!r.ok&&/mismo ramo/.test(r.error))(valida(['MAT1610','MAT1620'])));
chk('ni una sigla que no conocemos junto a otra',!valida(['FIS1514','XYZ9999']).ok);
chk('el nombre sin la sigla entre paréntesis',vm.runInContext("nombreBaseRamoClase('Dinámica (ICE1514)')",ctx)==='Dinámica');
chk('la tarjeta nombra el ramo una sola vez',(h=>/<span>Dinámica<\/span>/.test(h)&&!/ICE1514\)/.test(h))(vm.runInContext("tarjetaCatalogoClase({id:'x',titulo:'T',ramos_siglas:['ICE1514','FIS1514'],nombres_ramos:['Dinámica (ICE1514)','Dinámica'],precio_clp:0,contacto_tipo:'whatsapp',contacto_valor:'+56 9 1234 5678'})",ctx)));
chk('tres no pasan, y el mensaje dice qué hacer',(r=>!r.ok&&/otro anuncio/.test(r.error))(valida(['MAT1610','MAT1620','MAT1630'])));
chk('ninguno tampoco',!valida([]).ok);
console.log('\nPASS: '+ok+'   FAIL: '+fail);
process.exit(fail?1:0);
