# GradeHub · contexto y pendientes

Este archivo NO se carga solo al empezar una sesión: está separado de
`AGENTS.md` para que cada sesión gaste menos tokens. Léelo cuando tu tarea toque
alguno de estos temas: seguridad y Supabase, qué está tomado o pendiente, hacia
dónde va el producto, el marketplace de clases, reportes de usuarios o reglas
que el motor todavía no calcula. Las reglas que se aplican siempre siguen en
`AGENTS.md`.

Lo que se termina se saca de acá en la misma PR que lo cierra.

## Pendientes conocidos

### Seguridad · auditoría del 13 de agosto de 2026

La rama `codex/security-hardening` ya está en producción: limpia tokens de
recovery de la URL, evita enumerar correos al registrarse, agrega HSTS, fija
Wrangler con lockfile y pone límites server-side a los reportes.

**Ya hecho, no lo repitas:** `catalog_consensus.sql` aplicado (y borrada la
sobrecarga vieja `catalog_consensus(text,text)`, que contaba filas en vez de
personas distintas), `calendar_feed.sql` aplicado y verificado de punta a punta
(el feed devuelve un `.ics` con 10 eventos y sin notas), `eliminar_mi_cuenta`
aplicado, `user_feedback.sql` aplicado el 2026-08-17. HSTS y CSP verificados en
producción.

`calendar_feed_data` se volvió a aplicar el 2026-08-21 para que devuelva `hora`
(#160). Ojo si hay que reaplicarla otra vez: agregar una columna cambia el tipo
de retorno y Postgres no lo acepta con `create or replace`, así que el archivo
empieza con un `drop function`. Verificado contra el feed real: la evaluación
con hora sale `DTSTART:20260821T123000` —sin `Z` y sin `TZID`, o sea hora local
flotante— y las que no tienen hora siguen siendo de día completo.

**Lo que falta es todo manual, lo lleva Martín, y va PRIMERO.** Desde el
2026-08-17 tiene administrador en Supabase y Cloudflare. Ningún deploy hace nada
de esto: Cloudflare publica archivos estáticos y no ejecuta SQL ni toca la
configuración de Auth.

Que vaya primero es una decisión de Lucas del 2026-08-18, y tiene una razón
concreta: el repositorio es público, así que esta lista de pendientes también lo
es. Cerrarlos es lo que la vuelve inofensiva. Cualquier otra tarea de la cola
espera.

1. En Supabase → Authentication, dejar y **anotar** los valores de Sessions,
   Rate Limits y Password Security. El repo no puede demostrarlos. JWT ≤ 1 h,
   rotación de refresh tokens, y el mínimo de contraseña en 8 para que calce
   con `PASS_MIN` en `app.js`. No cambiar sesiones existentes a ciegas.
2. Turnstile en registro y recuperar contraseña. **El orden importa:** activar
   el CAPTCHA en Supabase antes de que el código mande el `captchaToken` deja
   registro, recuperación y login caídos para todos, y falla del lado del
   servidor, así que ningún test del repo lo atrapa. La CSP necesita
   `https://challenges.cloudflare.com` en `script-src` **y** una directiva
   `frame-src` nueva: hoy no existe, la cubre `default-src 'self'` y el iframe
   del widget queda bloqueado. Turnstile no pide `'unsafe-inline'`.
3. Prueba RLS autenticada con dos cuentas: A no puede leer, editar ni borrar
   filas de B. La prueba anónima devuelve `[]` y no demuestra nada —
   `auth.uid()` es NULL para anon, así que ninguna política calza. La prueba
   vale solo si además se comprueba que B **sí** ve lo suyo con la misma
   consulta; si no, un `[]` puede ser aislamiento o un UID mal escrito.
4. Recovery completo en producción: que el correo llegue, que el cambio
   funcione y que la URL quede sin `access_token`, `refresh_token` ni
   `type=recovery` (van en el fragmento, así que hay que mirar `location.hash`).

**Deuda de hardening, no mezclar con features:** retirar gradualmente handlers
`onclick` y `innerHTML` para poder sacar `'unsafe-inline'` de la CSP. Mientras
la sesión de Supabase viva en storage accesible a JavaScript, una XSS podría
leer notas y actuar como la cuenta aunque `connect-src` limite la exfiltración.
MFA puede ser opcional para estudiantes; pasa a ser obligatorio si aparece un
panel administrativo.

**Base de datos actual:** además de las tres tablas históricas existen
`calendar_feeds` y `user_feedback`. El SQL de `user_feedback` se aplicó en
producción el 17 de agosto de 2026: RLS activa, única política INSERT atada a
`auth.uid()`, sin lectura para clientes y FK a `auth.users` con
`ON DELETE CASCADE`. `calendar_feeds` mantiene cero políticas y acceso solo por
RPC. Toda tabla nueva reabre la auditoría RLS y de borrado — y el `CASCADE` no
se da por bueno porque esté escrito: se comprueba borrando una cuenta de prueba
y mirando que no queden filas suyas en ninguna tabla.

- **Ponderaciones oficiales: 12 de 88 ramos FEN.** Las MALLAS ya están
  completas (88 ramos únicos, los 10-11 semestres de las tres mallas); lo que
  falta son las pautas de evaluación. A casi todos los estudiantes la malla se
  les carga sola y las ponderaciones las escriben a mano — ese es el camino real
  del 95%, y hay que hacerlo rápido
- La cobertura ya no es "el tronco común de 2°": **1° está completo (5 de 5)** y
  **2° va en 6 de 7** — solo falta Inglés I. Después cae de golpe: 3° va 2 de 7,
  4° va 0 de 6, 5° va 1 de 9. En la UC, Ingeniería plan común va 8 de 18 y
  Comercial 5 de 31. Los dos primeros semestres de FEN son lo mejor cubierto del
  producto. Estos números salen de contar, no de memoria: recuéntalos antes de
  citarlos
- Notas de reemplazo y exámenes recuperativos distintos al de Microeconomía:
  aparecen en la mayoría de los programas FEN transcritos y siguen sin
  calcularse. Ver la tabla de reglas pendientes más abajo
- **La RLS quedó auditada el 2026-08-10 y está correcta.** Las tres tablas
  (`user_ramos`, `profiles`, `catalog_reports`) tienen `rowsecurity` activo y
  doce políticas: todo INSERT con `WITH CHECK`, todo UPDATE con `USING` y
  `WITH CHECK`, siempre atando `auth.uid()` a la columna de usuario. Que SELECT
  y DELETE no lleven `with_check` es correcto, no un hueco. Que las políticas
  estén sobre el rol `public` tampoco: `auth.uid()` es NULL para anon y la
  comparación nunca da verdadero. **No hace falta volver a auditarlo** salvo que
  se agregue una tabla — y ahí sí, porque una tabla sin política es legible por
  cualquiera. La consulta está en el historial de este PR.
- Cualquier tabla nueva con datos de usuario tiene que referenciar
  `auth.users` con `ON DELETE CASCADE`. Sin eso, esos datos sobreviven al
  borrado de cuenta y la política de privacidad pasa a ser mentira sin que
  falle nada. Ver `supabase/eliminar_mi_cuenta.sql`
- Refrescar `ramoKey` en `normalize()`. Los ramos guardan su clave de consenso
  desde que se crearon y `claveReporte()` prefiere esa, así que un sinónimo
  agregado después no reagrupa los reportes viejos. Con 3 reportes no cuesta
  nada; conviene resolverlo antes de que sí cueste

## En vuelo

Lo que está tomado ahora mismo. Se borra cuando se mergea. Si tu tarea no está
acá, pregunta antes de empezar — hay tres agentes sobre cuatro archivos.

### Con qué parte cada uno

**Codex — la revisión estética, PR 3 en adelante.** Los PR 1 (tokens de
movimiento) y 2 (el momento de la nota) ya están en producción. Sigue jerarquía
de Home, después los vacíos, estadísticas y Agenda. Su carril es `app.js` y,
durante la revisión estética, `styles.css`.

**La auditoría de movimiento está cerrada.** Salió de correr la skill
`improve-animations` sobre `styles.css` y `app.js` el 2026-08-11. Se arreglaron
tres defectos (#90: hover pegado en táctil, 340ms de `screenIn` que nunca
corrían, dos `transition:all`) y el modal, que aparecía y desaparecía de golpe
(#91). Después cayeron los cuatro pendientes: las duraciones salen de la escala
(#99), `prefers-reduced-motion` dejó de ser nuclear (#95), `button:active` ya
tiene su transición, y las dos barras de progreso pasaron de animar `width` a
`scaleX()`. Queda dicho porque la lista sobrevivió a tres de sus arreglos: un
traspaso que enumera trabajo ya hecho manda a rehacerlo.

`tests/movimiento.test.js` fija lo arreglado y cuatro reglas más: nada de
`ease-in`, nada de `transition:all`, nada de `scale(0)`, ningún `@keyframes`
huérfano, y ninguna transición sobre propiedades de layout — `width`, `height`,
`top`, `margin` y compañía recalculan el layout en cada fotograma.

**Dos cosas que hacen perder tiempo al verificar movimiento**, y que costaron
descubrir: un documento oculto pausa el compositor, así que si mides una
transición con el panel del navegador escondido siempre vas a leer el valor
inicial congelado — usa `document.getAnimations()` en vez de `getComputedStyle`.
Y en local el `CACHE_NAME` es siempre `gradehub-dev`, así que el service worker
se queda pegado con la copia vieja entre sesiones: desregístralo y borra las
cachés antes de creerle a lo que ves.

Los detalles de Agenda son un acordeón exclusivo. Al cerrar una evaluación que
está más arriba, conserva la posición en pantalla de la que se acaba de tocar;
si no compensas ese cambio de altura, en móvil la fila salta bajo el dedo.

**El consenso de reportes ya está construido. Lo que falta son reportes.** El
recorrido completo existe: `submit_catalog_report` y `catalog_consensus` en
`supabase/catalog_consensus.sql` —agrupa por (ramo, huella) y exige **tres
personas distintas**, no tres reportes; la huella la calcula el servidor con
`huella_catalogo()` y junta la misma pauta escrita distinto, incluido "Control
1, 2 y 3" del mismo peso con "Controles" en 3 casillas—, y `aplicarConsensoAuto()` en
`app.js` lo aplica solo. **Solo donde no hay nada que pisar**: ramos del catálogo
sin pauta. Si hay programa oficial transcrito, ese manda; si el estudiante editó
la suya, manda la suya; y lo aplicado queda marcado con `consensoRespaldos`, con
la ficha diciendo que lo reportaron estudiantes. Sin esa etiqueta sería la
ponderación inventada que prohíbe la regla de más arriba.

El pronóstico del traspaso anterior se cumplió al pie de la letra: decía que si
en dos semanas había tres reportes, el problema no era el consenso sino que
nadie reporta. Al 2026-08-29 hay **3 reportes de 3 personas en 2 ramos**, o sea
ningún grupo llega a tres y el consenso devuelve vacío. Por eso ahora se le pide
el dato a quien corrige una pauta oficial (`pautaEditada()`): esa persona ya
demostró saber cuál es la buena. Antes de agregar nada más acá, **mira cuántos
reportes hay**:

```sql
select count(*) reportes, count(distinct user_id) personas from public.catalog_reports;
```

Si el número no se mueve, el problema sigue siendo ese y no el consenso.

**Martín — las pegas manuales de Supabase y Cloudflare.** Desde el 2026-08-17
tiene administrador en los dos paneles, así que los cuatro puntos de la
auditoría de seguridad de más arriba son suyos. Ninguno se puede hacer desde el
repo: Cloudflare publica archivos estáticos y no ejecuta SQL ni toca Auth.

Las preguntas frecuentes (issue #86) ya se mergearon: están en
`/preguntas.html`.

**Claude de Martín — pautas oficiales.** El traspaso anterior decía que el
consenso de reportes era "lo único" que podía llevar el catálogo a 88 porque no
había más programas oficiales. Resultó que sí había: con ocho PDFs el catálogo
pasó de 5 a 10 pautas en una tarde, y el pipeline de extracción quedó
documentado y probado. Mientras sigan apareciendo programas, transcribirlos es
más rápido y más exacto que cualquier consenso, y además es `data.js` puro: no
sale del carril de contenido.

### Hacia dónde va el producto

**GradeHub tiene que entender tu semestre, no solo llevar la cuenta.** Decisión
de Lucas del 2026-08-18. La app deja de pensarse como un registro de notas y
pasa a ser el lugar que sabe qué viene, cuánto pesa, qué necesitas y qué pasa si
te va mal. "¿Qué nota necesito para aprobar?" sigue siendo el corazón, pero deja
de ser el techo.

Dos cosas que conviene tener claras antes de construir hacia allá:

**El foso es la pauta, no las funciones.** "Segundo cerebro" es la categoría más
poblada que existe —Notion, Obsidian, las notas del teléfono— y ninguna de esas
sabe si vas a aprobar Cálculo II. Lo que solo GradeHub puede hacer es lo que
pasa alrededor de una evaluación, porque es el único que tiene las
ponderaciones. Una función que podría vivir igual de bien en una app de notas
genérica es una función que se va a comparar con gigantes y va a perder.

**Notificaciones y widgets NO son del mismo tamaño.** Las notificaciones se
pueden hacer sin tienda: iOS las soporta en PWA desde 16.4 si el estudiante la
agregó a su pantalla de inicio, `sw.js` ya existe —solo le falta el handler de
push— y Supabase trae `pg_cron` instalado para disparar el aviso diario. Los
widgets, en cambio, **no se pueden hacer desde una PWA**: los de iOS necesitan
WidgetKit y una app nativa. O sea, widgets implica App Store, y eso arrastra
US$99 al año, la revisión de Apple —que rechaza envoltorios de sitios web— y su
comisión sobre pagos digitales, que choca con la decisión de monetización
todavía abierta. Notificaciones primero; widgets solo si se decide ir a nativo.

### Ya hechas, no las vuelvas a proponer

Se sacaron de la cola cuando se mergearon. Están acá con su PR porque lo que se
borra sin dejar rastro se vuelve a pedir, y porque si alguna se rompe conviene
saber dónde empezar a mirar.

| Pedido | Dónde quedó |
|---|---|
| Las estadísticas tienen que decir algo que importe | #203 — rango del promedio final y qué necesitas en cada ramo, en vez de mejor/peor nota |
| Faltan términos de uso y un descargo honesto | #206 — `terminos.html` |
| Tocar una evaluación en la Agenda no muestra nada más | #180 — se expande con su detalle |
| La barra de orden de la Agenda ocupa demasiado | #207 — se subió al encabezado |
| El orden manual no se puede arrastrar | *"El orden manual ahora se puede decidir de verdad"* + #176 (el ícono) y #204 (el foco con teclado) |
| El consenso de reportes no lo consume nadie | #234 — se aplica solo en ramos sin pauta, etiquetado como reportado por estudiantes |
| El consenso no se veía en los ramos que ya tienen pauta | #274 — se ofrece, con la pauta a la vista, y nunca se aplica solo |
| El correo salía 2 por hora y sin autenticar | #150 — Resend + SPF/DKIM/DMARC propios, 30 por hora, entregado en 2 s |
| Las plantillas de correo estaban en inglés | #320 — en español y versionadas en `supabase/plantillas-correo.md` |
| El feed de calendario se cacheaba público | #314 — `private`, y el plegado del .ics pasó a contar octetos |
| El consenso guardaba texto ajeno sin limpiar | #315 — bidi, ancho cero y control se filtran al entrar; rangos revalidados |
| Una evaluación en 0% rompía el consenso | #272 — no viaja en el reporte: cinco personas de acuerdo daban cinco grupos de una |
| Actualizar la pauta oficial borraba notas | #235 — se emparejan por nombre normalizado y lo que sale de la pauta queda en 0% con sus notas |
| Contabilidad no se podía reportar (la pauta sumaba 99,9) | #236 — `estructuraDe` redondeaba a un decimal; de paso el orden dejó de depender del idioma del dispositivo |
| Gestión de Personas y Marketing solo aparecían en un semestre | #225 — van en 2° y en 3°, que es como se cursan |
| "Contabilidad I" no encontraba su pauta | #261 — `claveCatalogo()`, y OJO: no fusiona los pares que sí son ramos distintos |
| Métodos Cuantitativos con y sin número contaban aparte | #262 — tabla `SINONIMOS` de pares verificados contra el código del ramo |
| `bin/estado.sh` no mostraba las issues asignadas | #257 |

### Pedidas por Martín, sin dueño todavía

**Meter a la Universidad de los Andes.** El andamiaje ya está: `uandes` es un
tenant en `TENANTS` y `CARRERAS_UANDES` declara cinco carreras (Ingeniería
Civil, Ingeniería Comercial, Derecho, Medicina, Psicología) más "Otra". Lo que
no existe es nada de contenido: no hay `MALLA_UANDES`, ni `PRESETS_UANDES`, ni
`CREDITOS_UANDES`, y `CARRERAS_DECLARABLES` solo tiene `fen` y `uc` — así que
quien elige UANDES hoy entra a una app vacía y arma todo a mano.

El orden que se sostiene solo, mirando cómo se construyeron FEN y UC:

1. **Carreras declarables primero.** Es la lista completa de lo que se estudia
   ahí, sin malla asociada. Barata, no necesita ningún programa, y hace que la
   app deje de sentirse ajena: el estudiante se ve en la lista.
2. **Una malla, la de la carrera con más gente.** `MALLA_UANDES` con la misma
   forma que `MALLA_UC`, y su carrera pasa a llevar `malla:` en declarables.
3. **Presets solo con programas oficiales en la mano.** Vale la regla de
   siempre: si el documento no dice la ponderación, no se rellena. Diez pautas
   FEN tomaron semanas de juntar PDFs, así que esto es lo lento y no se
   improvisa.

Ojo con dos cosas antes de escribir código. **El vocabulario de cada universidad
es distinto** —en FEN son Solemnes, en la UC Interrogaciones— y hay un test que
lo vigila (`tests/vocabulario.test.js`): las evaluaciones de UANDES tienen que
hablar como habla UANDES, y si aparece un tercer vocabulario hay que separarlo
igual que los otros dos. Y **los créditos**: la UC usa SCT y FEN también; si
UANDES pondera distinto, `creditosDe` y el modo de promedio necesitan saberlo
antes de que alguien cargue notas y el número salga mal.

Tamaño realista: el paso 1 es una sesión, el 2 depende de conseguir la malla
publicada, el 3 es trabajo continuo de transcripción como el que lleva FEN.

### Pedidas por Lucas, sin dueño todavía

Están acá para que no se pierdan, no porque alguien las esté haciendo. **Las
puede tomar cualquiera de los dos lados** —Lucas o Martín, con sus agentes—; lo
único que se respeta es el carril del archivo que toque. Avisa antes de partir
para que no la tomen dos.

El contexto de cada una sale de mirar el código, no del pedido: sirve para
dimensionar antes de empezar.

**Los metadatos y la licencia del repositorio siguen pendientes.** El README ya
explica qué es GradeHub, cómo correrlo y cómo contribuir, pero GitHub todavía no
tiene descripción, sitio ni topics. Tampoco hay un archivo `LICENSE`: que el
repo sea público permite verlo y bifurcarlo dentro de GitHub, pero no concede
un permiso general de uso, modificación o distribución. Lucas tiene que elegir
la licencia antes de agregarla; ningún agente debe decidirla por su cuenta.

Ojo con una cosa al hacerlo: este mismo archivo es público en github.com, **con
la lista de lo que todavía no está asegurado**. Lucas lo decidió el 2026-08-18:
**el repo se queda público**, y la respuesta es cerrar los huecos, no taparlos.
Por eso los cuatro puntos de la auditoría de seguridad pasan a ser lo PRIMERO
que hace Martín, antes que cualquier cosa de esta cola. Mientras sigan abiertos,
están descritos en un archivo que cualquiera puede leer.

**Las pautas vencidas YA están resueltas. Lo que queda es declarar el período
en las que faltan.** Al 2026-08-31: `periodo` existe en el preset,
`estadoPeriodoPauta()` decide si sigue vigente, `presetRamo()` retiene las
fechas cuando venció y la ficha muestra "Pauta del 2026-2" o "período sin
confirmar" (`pauta-periodo` en `render-main.js`). Las diez evaluaciones con
fecha fija del catálogo pertenecen todas a pautas que sí declaran su período, y
`tests/pautas-con-fecha-declaran-periodo.test.js` lo exige de acá en adelante.

Lo que falta es transcripción, no código: **15 pautas con ponderaciones no
declaran período** —7 de FEN y 8 de la UC— y salen como "período sin confirmar".
El dato no está en el repo: sale de mirar el PDF de cada programa. No se deduce
del comentario ni del año: "programa oficial actualizado julio 2026" no dice si
es 2026-1 o 2026-2, y esa diferencia es justo la que decide si sus fechas se
entregan o se retienen.

**Las ponderaciones y las fechas NO envejecen igual.** Los porcentajes de un
programa suelen repetirse entre semestres; las fechas de las pruebas cambian
siempre. Así que la pauta de 2026-2 probablemente sigue sirviendo en 2027-1 y
sus fechas con seguridad no. Tratarlas como una sola cosa lleva a descartar
pautas todavía buenas o a cargar fechas falsas: son dos decisiones separadas y
el modelo tiene que poder decirlas por separado.

**No priorizar PWA instalada ni notificaciones por ahora.** La gente usa
GradeHub desde el navegador; antes de invertir en push, widgets o permisos hay
que resolver necesidades visibles en ese camino y volver a medir la adopción.

**Aceptar términos al crear la cuenta, y actualizar la política.** Se pide un
paso explícito de aceptación en el registro. Dos cosas que hay que resolver
antes de escribirlo: qué pasa con las cuentas que ya existen —se registraron sin
aceptar nada, y pedirles aceptación al entrar es una interrupción que hay que
diseñar, no improvisar— y dónde queda constancia de que aceptaron, porque si no
se guarda, el paso es decorativo. La política se actualiza junto con esto para
que las dos páginas digan lo mismo.

**Reactivar la verificación por correo. Ya no hay nada que la bloquee.** El
correo propio está resuelto desde el 2026-09-06 (#150, cerrado): Resend como
SMTP en Supabase, `gradehub.cl` con SPF, DKIM y DMARC propios, remitente
`hola@gradehub.cl` —que además recibe, vía Email Routing— y el límite subido de
2 a 30 correos por hora. Una recuperación de contraseña real llegó a bandeja de
entrada en 2 segundos con SPF, DKIM y DMARC en `pass`.

Lo que falta es la decisión y un texto. **Activarla obliga a reescribir el aviso
del registro el mismo día**: hoy dice "Ya puedes entrar con ese correo y tu
contraseña" justamente porque no se manda ningún correo, y con la confirmación
encendida esa frase pasa a ser falsa. Está anotado en `app.js`, junto a
`MSG_VERIFICA`. La plantilla en español ya está escrita, en
`supabase/plantillas-correo.md`.

Y no es solo higiene: **es el control que sostiene el consenso de reportes.** Ese
umbral son tres `user_id` distintos, y mientras crear una cuenta no cueste nada,
"tres personas" no significa tres personas.

### Marketplace de clases: decisiones cerradas, todavía sin activar

El diseño aprobado está en `docs/marketplace-clases.md`. Una misma identidad de
Supabase puede tener un espacio de estudiante y una ficha separada de profesor;
ser estudiante no habilita a ofrecer clases. Lucas aprueba primero al profesor y
después cada anuncio. Suspender al profesor oculta todas sus campañas sin borrar
el historial.

La recomendación usa universidad, sigla, promedio y avance, pero se decide dentro
de GradeHub y el profesor recibe solo agregados. Se muestra solo en Inicio, una
vez en la mañana (hasta las 14:00) y una en la tarde: en la primera entrada de
cada franja, y no vuelve si la persona entra de nuevo en la misma franja o la
cerró. La primera vez que se cierra una clase se esconde hasta la próxima
franja; la segunda, no vuelve más en ese dispositivo y recién ahí se avisa "no
te la volvemos a mostrar" (decisión de Lucas del 2026-09-25). Los anuncios también se pueden explorar en un
catálogo general.

La tarifa cambió el 2026-09-25 (decisión de Lucas): $100 por día publicada y,
por persona, $10 si la vio, $50 si la abrió y $1.000 si contactó. Cada persona
cuenta una vez por anuncio. El profesor elige los días (o las fechas: puede dejar
el anuncio programado) y un tope, que es lo máximo que pagaría; al llegar, la
clase deja de mostrarse. Filtrar por nota no cuesta más. No cuentan el propio
profesor ni cuentas sin ramos. En el piloto no se cobra: se muestra lo que
costaría. La tarifa vive en `tarifa_campana_clp` (SQL) y `TARIFA_CAMPANA`
(marketplace.js), y `tests/tarifa-campana.test.js` exige que coincidan. El
contacto es solo por WhatsApp, con el número oculto tras un botón.

Desde el 2026-09-25 están el flujo de profesor, el catálogo, la tarjeta junto
al ramo en Inicio y el alcance por camino (recomendación, búsqueda, lista).
El SQL de `clases_particulares.sql` y `admin_clases.sql` se aplica a mano. Esta última necesita una tabla privada con FK a
`auth.users`, `ON DELETE CASCADE`, retención de 90 días y SQL aplicado a mano;
por eso su PR será borrador. `anuncio_metricas` cuenta eventos y no se usa para
facturar personas.

**Cada evaluación de un grupo puede tener su propia fecha.** Hecho el
2026-09-12. El modelo y la Agenda ya lo soportaban —`agendaEvents` lo dice y lo
comenta— pero no había cómo ponerla: una casilla solo aceptaba el número, y la
fecha existía únicamente para el grupo entero. "Controles" tenía una sola fecha
para los tres.

Al hacerlo apareció una pérdida silenciosa que ya estaba: `setSlotNota` borraba
la nota de la casilla y la volvía a crear en cada cambio, así que escribir la
nota del Control 2 borraba que era el 18 de octubre. Nada fallaba; la
evaluación simplemente desaparecía de la Agenda. Ahora la casilla se edita en
vez de rehacerse, y vaciar la nota la deja pendiente si tiene fecha.

Ojo con el contador del grupo: cuenta casillas CON NOTA, no casillas
registradas. Una casilla creada solo para fecharla no puede sumar al "2/3
ingresadas".
**Tres cosas pedidas por Lucas el 2026-09-12 para la pantalla de Ajustes y la
conexión de agentes.** Las tres están implementadas.

**1. Sacar el camino del código (Claude Code y Codex) — implementado.**
Ajustes solo ofrece la conexión por URL. Se retiraron el desplegable, las
instrucciones de comandos, la generación del código y su temporizador del cliente.
La lista y la desconexión conservan todos los agentes existentes, aunque se hayan
vinculado por código. No se revoca ni migra ningún acceso.

`crear_codigo_agente` y `canjear_codigo_agente` siguen en Supabase y no las llama
la interfaz: retirarlas requiere otra migración explícita. Este cambio no toca
SQL ni el servidor MCP. Los tests conservan el handshake, la URL y la revocación;
las garantías de errores y sesión vencida ahora se prueban sobre la URL.

**2. Ordenar Ajustes y poner un buscador arriba — implementado.** Las siete
secciones se reúnen en Tu cuenta, Tu semestre y La app. El buscador filtra por
título, bajada y opciones internas: "cambiar mi carrera" y "borrar mi cuenta"
encuentran su sección. Buscar solo repinta la navegación, no el formulario.
El correo de acceso vive en Perfil; respaldos y eliminación siguen en Datos y
cuenta. `tests/ajustes-orden.test.js` fija estos caminos sin guardar preferencias.

**3. Explicar de verdad cómo conectar un agente, empezando por un prompt —
implementado.** La pantalla primero entrega un mensaje inocuo para pegarle al
agente. Ese mensaje le pide que explique dónde se configura un conector MCP en
la app que la persona ya usa. Después se nombra la conexión y recién al final se
crea la URL.

El prompt no lleva el token. La URL se copia aparte y la pantalla dice que debe
pegarse solo en el campo del conector que indicó el agente, nunca en el chat. Así
no mantenemos instrucciones de productos que cambian solos ni dejamos una llave
guardada dentro de una conversación.

**Un agente propone notas; no las escribe.** Pedido por Lucas el 2026-09-12 y
hecho: `proponer_notas` deja una propuesta pendiente y la ficha del ramo la
muestra con Aceptar, Editar y Rechazar, con la nota anterior tachada al lado de
la nueva cuando hay una.

Esto NO relaja la regla de que un agente no escribe notas: es su forma. La regla
nunca fue "el agente no nombra notas" sino "la nota que queda guardada la acepta
el estudiante". Lo que sigue prohibido, y lo vigila
`tests/agente-permisos.test.js`, es que una herramienta de tipo `escritura`
reciba una nota como argumento — ahí sí entraría sola. El test también exige lo
contrario: toda herramienta que reciba notas tiene que ser de tipo `propuesta`,
así que cambiarle el tipo a `proponer_notas` revienta en vez de pasar callado.

Dos decisiones que conviene no deshacer sin pensarlas. La propuesta se marca
resuelta en el servidor ANTES de tocar el ramo, para que una red caída no deje
una propuesta aplicable dos veces. Y editar aplica lo editado: un campo que
quedó vacío se OMITE en vez de guardarse como 1,0, porque vaciarlo es lo que la
persona quiso decir.

### Reportes de usuarios todavía abiertos

Revisados el 2026-09-12 contra la tabla de sugerencias. Se dejan solo los que
NO están resueltos; los que sí (apagar secciones de Estadísticas, borrar y
renombrar un semestre del historial, las dos Dinámicas, "sigue a tu teléfono"
en iPad, los fondos pizarra y neutro) ya salieron y no vuelven a la cola.

**1. Las evaluaciones de una categoría con varias notas desaparecen.** Lo más
grave de la lista: TRES reportes, dos usuarios distintos más Lucas, entre el
2026-08-29 y el 08-30. "Cuando agrego controles y le pongo que son varias notas
dentro de esa categoría, no me aparece después y deja de funcionar. Si saco que
son varias notas, vuelven a aparecer todos." Otro lo describe desde la otra
punta: "al poner que una nota depende de varias evaluaciones que se promedian
como que desaparecen, ya no puedo verlas ni poner mis notas". Y el tercero lo
encontró armando Dinámica ICE a mano. Uno dice que empezó "luego de la última
actualización", así que hay una regresión con fecha. Primero reproducirlo: son
tres descripciones que pueden ser el mismo camino o dos.

**2. No hay dónde cambiar la clave estando dentro de la app.** El mecanismo ya
existe entero —`submitNewPassword` en `app-session.js`— pero solo se alcanza
por el correo de recuperación, en `screen-reset`. Falta la puerta en Ajustes,
no la función.

**3. Sección del ramo, opcional.** Pedida por Lucas el 2026-09-12. **Hecha**:
`seccion` se escribe en Editar ramo, la ficha la muestra, y un agente puede
proponer el semestre entero con sigla y sección desde el horario
(`proponer_ramos`, con su bandeja en Inicio). Lo que queda de esa idea es
reconocer el horario sin agente, dentro de la app: el de BuscaCursos trae
`SIGLA-SECCIÓN` de todos los ramos, y el estudiante lo tiene a mano. Validar cada sigla contra
`cursos-uc.js` hace el reconocimiento robusto: lo que no sea una sigla real se
descarta solo. De las 6 siglas de un horario de prueba, 5 estaban en el
catálogo. La sección también le daría sentido a la comparación por curso
—compararse con su sección y no con el ramo entero—, que hoy agrupa por sigla.

**4. "Controles 1, Controles 2".** Si la categoría se llama en plural, las
evaluaciones heredan el plural y quedan con un nombre que no se dice así. Hay
que derivar el singular o dejar que el nombre de la evaluación se separe del de
la categoría.

**5. "No me muestra cómo voy comparado al resto del curso."** Reportado el
2026-09-12. Puede ser el mínimo de 5 participantes funcionando como se diseñó
—y entonces el problema es que en la práctica casi nadie llega a verlo— o puede
ser que no esté subiendo la nota. Antes de tocar nada, mirar `curso_notas` y
contar cuántas filas hay por sigla.

**6. "Está mal la sigla del teológico."** De otro usuario, el 2026-09-11.
Probablemente es lo que arregla el PR de la sigla de los presets, donde la
sigla salía vacía. Pero el reporte dice "mal", no "falta": hay que confirmarlo
con esa persona después del deploy en vez de darlo por cerrado.
**Muchos ramos se quedan sin créditos aunque el catálogo SÍ los tenga.**
Reportado por Lucas el 2026-09-12. Su ejemplo: "Principios Ecológicos y Medio
Ambiente" aparece sin créditos en la app, y en `cursos-uc.js` está la fila
`["BIO143M","Principios Ecológicos y Medio Ambiente",10]`. O sea el dato lo
tenemos y no llega. Y dice que no es un ramo suelto: "muchos no más no tienen
créditos".

No está medido cuántos son. Lo primero es contarlos —recorrer las mallas y ver
a cuántos `creditosDe` les devuelve null— porque eso separa "faltan tres" de
"falta el mecanismo".

Dos pistas para quien lo tome, ninguna comprobada todavía:

- `cursos-uc.js` es de CARGA DIFERIDA (`cargarCursosUC()`, ~660 KB que solo se
  bajan al buscar un ramo). `creditosDe` cae al catálogo completo con
  `cursoUcCompleto`, pero si el ramo se crea o se normaliza ANTES de que el
  archivo esté cargado, `CURSOS_UC_FULL` no existe y devuelve null. Nadie
  reintenta después.
- `CREDITOS_POR_TENANT` solo tiene `uc` y `fen` (app.js), y el respaldo del
  catálogo completo corre solo `if(tenant==='uc')`. Para UAI y UAndes no hay
  ninguna fuente de créditos: ahí el null es esperado, no un bug.

Por qué importa y no es cosmético: el promedio general se pondera por créditos
SOLO si todos los ramos con nota los tienen. Un ramo sin créditos arrastra a
toda la cuenta a promedio simple —otro número— sin que falle nada ni aparezca
ningún error. Es justo lo que ya documenta `tests/creditos-pendientes.test.js`.

### Las reglas que el motor todavía no calcula

`drop_lowest` fue la primera de `noCalcula` que pasó a calcularse. La segunda
fueron las **inasistencias justificadas**: `ausenciasJustificadas` se declara en
el preset (hoy solo Micro, que es el único programa que dice a qué evaluación
pasa el porcentaje), `presetRamo()` la resuelve a ids y el estudiante marca la
inasistencia en la ficha. Está hecha: no la vuelvas a proponer.

Quedan, en orden de dificultad:

| Regla | Qué falta |
|---|---|
| Eximición del examen con Casos ≥ 5,5 (Gestión de Personas) | Falta el dato: “Casos y ensayos” está agrupado y el programa no dice cuántos casos son. Sin poder contar cuántos quedaron bajo 4,0 no se puede decidir la eximición; requiere rediseño del preset FEN con Martín, no un `if` por ramo. |
| Examen de Segunda Fecha (Métodos) | El programa da quién puede rendirlo (examen bajo 3,0 y promedio ≥ 3,95; en Métodos I también una inasistencia justificada), pero no dice con qué nota queda el ramo al aprobarlo. Falta una nota fija o fórmula oficial; no se puede reutilizar el recuperativo de Micro sin inventarla. |
| ±10 décimas por evaluación entre compañeros | El dato no existe en la app |
| Busuu reprobatorio (Inglés IV) | El programa dice que reprueba pero no fija la nota mínima, así que no hay umbral que declarar |

Y una que **no es calculable y no lo va a ser**: el 75% de asistencia a los
controles sorpresa de Contabilidad. El programa dice "entre 4 y 6 controles", así
que no existe el denominador. Esa se queda declarada para siempre.
