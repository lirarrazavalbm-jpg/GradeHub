# Editorial: la información lleva la jerarquía

Dirección elegida por Lucas en la muestra `02-editorial-interaccion.html`:
filas abiertas, línea lateral de color, flecha alineada con la nota y una
respuesta sutil de esa línea al apuntar. Esta entrega la lleva a la app real,
sin recalcular, migrar ni reescribir datos.

## Qué cambia y qué no

- Inicio conserva el promedio en su lugar. La nota mantiene `--grade-color`;
  se quita el brillo, no el semáforo. La comparación ahora dice a qué semestre
  corresponde. Los avisos siguen presentes debajo de los ramos.
- El avance de **Inicio sí cambia de representación**: de un gradiente que
  llena la fila a un riel neutro con `scaleX`. Sale del mismo `ramoProgress`,
  muestra el porcentaje bajo el nombre y conserva el momento de cierre al
  llegar a 100%. No se cambia el avance del motor ni el promedio.
- Los gradientes funcionales de Estadísticas quedan idénticos. El color de
  identidad de un ramo nunca se aplica a su nota.
- Ficha, Agenda, Estadísticas, Ajustes, editores, login y onboarding comparten
  superficies mates, controles más sobrios y la misma tipografía. Las páginas
  públicas reciben esa tipografía y base neutra; sus textos no cambian.
- La fuente pasa de Onest descargada a la pila del sistema, como en la muestra
  aprobada: cero peticiones de fuentes y cifras tabulares. No hay dependencias.
- Neutro pasa a blanco / `#080809`. Papel, Pizarra, acentos y preferencias
  guardadas se conservan. Cambia lo que ve una cuenta existente, no lo guardado.
- El nombre del ramo es un botón nativo; su click llega al mismo manejador de
  apertura de la fila. Enter y Espacio no requieren otra delegación y el control
  de arrastre sigue separado.

## Verificación

Base de comparación: `9bd605d`.

| Comprobación | Resultado |
|---|---|
| `npm test` | 95 archivos de prueba, exit code 0 |
| `tests/editorial.test.js` actual | 17 comprobaciones, exit code 0 |
| Mismo test apuntando al árbol anterior | 13 fallan, 4 invariantes pasan; exit code 1 |
| Inicio: 375, 768 y 1440 px, claro y oscuro | Sin desborde de documento ni contenedores |
| Ficha, calculadora, Agenda/detalle, Stats y Ajustes: 375 px | Navegación y controles operativos, sin desborde |
| Agenda, Stats y Ajustes: 1440 px, ambos modos | Sin desborde |
| Primer uso, login, registro, onboarding, páginas públicas | Revisados sin datos reales ni llamadas a cuentas |
| Riel al 0 / 40 / 100% | Ancho medido / ancho total: 0 / 0.40000004 / 1 |
| Alineación flecha / nota | Diferencia entre centros verticales: 0 px |
| Hover de línea de 2 px | `scaleX(1.65) scaleY(1.05)`, brillo 1.2 |
| Movimiento reducido | Sin transformación; conserva brillo y halo |
| Apertura con Enter e ingreso de nota en casilla | La ficha abre; el nuevo valor queda en su mismo `slot` |

La revisión visual usa Chrome local en el puerto **8876**, service worker
bloqueado y datos ficticios. No es una prueba en un teléfono físico.

El test nuevo permite `GRADEHUB_ROOT=/ruta/al/arbol-anterior` o
`GRADEHUB_APP=/ruta/al/arbol-anterior/app.js`. Las comprobaciones numéricas que
pasan en ambos árboles son deliberadas: verifican que renderizar no cambia el
promedio ni escribe en `S` o localStorage.

Además se compararon los archivos: `engine.js`, `app-session.js`,
`render-agenda.js`, `sw.js`, `_headers` y deploy son idénticos a la base.
En `app.js` solo cambia la fuente en los estilos inline. `data.js` solo cambia
la presentación de `FONDOS.neutro`; no sus datos académicos ni `SEMAFORO`.

Los tests existentes que cambian fijaban la apariencia sustituida (Onest y el
gradiente de Inicio). Se adaptan a la dirección aprobada; no se suavizan las
reglas de contraste, semáforo, movimiento ni cálculos.

## Alcance del merge

Sin SQL, cambios de Auth ni pasos de Cloudflare. Sin archivos nuevos de runtime,
sin alterar el orden de scripts ni `CACHE_NAME`. Este PR no incluye los PRs de
agentes ni marketplace. No requiere migración ni cambia `gradehub_v1`.
