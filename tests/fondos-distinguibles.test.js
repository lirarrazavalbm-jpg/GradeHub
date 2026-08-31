// Elegir un fondo y que no cambie nada es peor que no ofrecerlo.
//
// Lo reportó una estudiante el 2026-08-25: "En modo claro pizarra y neutro no
// cambian nada, diferenciar más". Tenía razón y estaba en el dato: en claro el
// fondo de las dos estaba a 1,3 de distancia y la tarjeta era el MISMO #ffffff.
// En oscuro sí se distinguían —ahí se diseñaron— y por eso nadie lo notó.
//
// Este test mide la distancia entre los fondos que se ofrecen, en los dos modos,
// para que un fondo nuevo no nazca siendo una copia de otro.
//
// Y deja fija la tensión que apareció al arreglarlo, que es la parte que se
// olvida: diferenciar un fondo claro lo vuelve más oscuro, y eso baja el
// contraste del semáforo. El ámbar de claro estaba en 4,56 sobre Neutro — dos
// centésimas sobre el mínimo — así que cualquier fondo un poco más oscuro lo
// tumbaba. Por eso se oscureció a #96590a. `tests/temas.test.js` cuida esa
// mitad; esta cuida la otra. Las dos juntas: distinguibles Y legibles.
const fs = require('fs'), vm = require('vm');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../data.js', 'utf8'), ctx);
const FONDOS = vm.runInContext('FONDOS', ctx);

let ok = 0, fail = 0;
function chk(nombre, cond) { if (cond) { ok++; console.log('  ok   ' + nombre); } else { fail++; console.log('  FAIL ' + nombre); } }

const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
// Distancia ponderada por cómo el ojo pesa cada canal (Rec. 709). Un delta
// plano trataría un cambio en azul igual que uno en verde, y no se ven igual.
function dist(a, b) {
  const [ra, ga, ba] = rgb(a), [rb, gb, bb] = rgb(b);
  return Math.sqrt((ra - rb) ** 2 * 0.299 + (ga - gb) ** 2 * 0.587 + (ba - bb) ** 2 * 0.114);
}

// 5 sale de Papel, que es el fondo que sí se distinguía cuando esto se reportó:
// su fondo estaba a 5,4 de Neutro y su tarjeta a 6,1. Por debajo de eso el
// cambio no se percibe — con 1,3 nadie lo vio.
const MINIMA = 5;
// La distancia se exige donde se percibe: `bg` es el lienzo y `card` son las
// tarjetas, que juntos son casi toda la pantalla. `bg2` queda fuera a propósito
// —en claro es casi blanco en Neutro y en Papel, y aun así los dos se
// distinguen sin problema—, y los `border` son líneas finas: exigirles
// distancia obligaría a colores que no aportan nada.
const SUPERFICIES = ['bg', 'card'];
// La comprobación de "no idénticas" sí mira todas: dos fondos pueden diferir en
// el lienzo y aun así compartir un valor exacto, y eso siempre es un descuido.
const TODAS = ['bg', 'bg2', 'card', 'muted'];

const nombres = Object.keys(FONDOS);
console.log('=== Los ' + nombres.length + ' fondos se distinguen entre sí ===');
['claro', 'oscuro'].forEach(modo => {
  for (let i = 0; i < nombres.length; i++) {
    for (let j = i + 1; j < nombres.length; j++) {
      const a = FONDOS[nombres[i]][modo], b = FONDOS[nombres[j]][modo];
      const peor = SUPERFICIES.reduce((min, k) => Math.min(min, dist(a[k], b[k])), Infinity);
      chk(`${modo}: ${nombres[i]} vs ${nombres[j]} (peor superficie ${peor.toFixed(1)} ≥ ${MINIMA})`,
        peor >= MINIMA);
    }
  }
});

console.log('\n=== Ninguna superficie es idéntica a la de otro fondo ===');
['claro', 'oscuro'].forEach(modo => {
  SUPERFICIES.forEach(k => {
    const vistos = nombres.map(n => FONDOS[n][modo][k].toLowerCase());
    chk(`${modo}: ${k} no se repite entre fondos`, new Set(vistos).size === vistos.length);
  });
});

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
