// El profesor elige los ramos de su clase buscando por nombre o sigla, no
// escribiendo la sigla exacta a mano. Índice de ejemplo escrito acá.
const fs=require('fs'),path=require('path'),vm=require('vm');
const raiz=path.join(__dirname,'..');
const ctx={console,Intl};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(raiz,'marketplace.js'),'utf8'),ctx);
// normBusqueda vive en app.js; se copia la regla mínima para no cargar la app.
vm.runInContext("function normBusqueda(s){const R={i:'1',ii:'2',iii:'3',iv:'4'};return String(s||'').split(' ').map(t=>R[t]||t).join(' ');}",ctx);
let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};
ctx.__i={MAT1492:'Álgebra e Introducción al Cálculo',MAT1610:'Cálculo I',MAT1620:'Cálculo II',MAT1630:'Cálculo III',FIS1514:'Dinámica',IIC1103:'Introducción a la Programación'};
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
console.log('\nPASS: '+ok+'   FAIL: '+fail);
process.exit(fail?1:0);
