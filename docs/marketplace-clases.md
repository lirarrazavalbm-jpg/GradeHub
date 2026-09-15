# Marketplace de clases particulares

Este documento define el recorrido antes de construir la interfaz. Su objetivo
es que un estudiante encuentre apoyo para un ramo sin convertir sus notas en un
dato que GradeHub entregue a profesores o anunciantes.

## Principio que no se negocia

La recomendación personalizada se decide **en el navegador**. La petición que
trae avisos no incluye qué ramos tiene la persona, qué promedio lleva, si puede
aprobar ni una señal de riesgo. Para cotizar, un proceso interno y restringido
puede calcular un total usando los datos ya sincronizados en GradeHub, pero solo
devuelve ese agregado. Un tutor nunca ve quién recibió su aviso.

## Dos puertas distintas

1. **Explorar clases.** Siempre disponible. La persona busca por ramo o sigla y
   ve el mismo catálogo público que cualquier estudiante de su universidad.
   No necesita mirar notas ni pedir consentimiento especial.
2. **Recomendaciones de apoyo.** GradeHub puede destacar una clase que calza
   con un ramo que se está poniendo difícil. La condición se declara en los
   términos y la política, no como una preferencia de configuración.

No se usa la palabra "reprobando" en la tarjeta. La intención es ofrecer una
salida, no diagnosticar ni presionar: “Puede servirte apoyo para Cálculo II”.

## Una identidad, dos espacios separados

La cuenta de Supabase sigue siendo una sola. Una persona puede usar GradeHub
como estudiante y, si quiere ofrecer clases, crear además una ficha de profesor.
Eso evita obligarla a mantener dos correos y dos contraseñas, pero la interfaz
de estudiante y el espacio de profesor no comparten formularios ni estados.

Ser estudiante **no habilita automáticamente** a publicar:

1. La persona completa su ficha de profesor. Nace `pendiente`.
2. Lucas revisa la postulación y la deja `aprobada`, `rechazada` o `suspendida`.
3. Solo una ficha aprobada puede crear y enviar anuncios.
4. Cada anuncio se revisa por separado. El profesor puede mandarlo a revisión,
   pero no puede marcarlo como revisado, pagado ni publicado.

Son dos aprobaciones distintas a propósito. Aprobar a una persona no convierte
en válido cualquier texto que publique después. Si edita el contenido de un
anuncio publicado, primero tiene que sacarlo de publicación y volver a enviarlo
a revisión. Si se suspende al profesor, todos sus anuncios dejan de ser públicos
de inmediato; no se borran, para conservar el historial y permitir una revisión.

En el primer lanzamiento la aprobación se hace manualmente en Supabase con un
rol privilegiado. El cliente no recibe permisos para cambiar `estado` ni las
marcas de revisión. Un panel interno para Lucas puede reemplazar ese paso más
adelante sin cambiar el modelo ni abrir la aprobación a los estudiantes.

### Postulación y entrada al espacio de profesor

Después de iniciar sesión, el menú de la cuenta ofrece **Espacio de profesor**.
Si todavía no tiene ficha, ahí puede postular; no se crea otro login ni se mezcla
el formulario con las notas. La postulación pide nombre público, una presentación
breve, universidad o vínculo académico, ramos que ofrece por sigla, modalidad,
contacto y al menos un antecedente que Lucas pueda revisar. Ningún campo aprueba
automáticamente a la persona.

Lucas decide la postulación completa, no una puntuación automática. `rechazado`
permite corregir y volver a postular; `suspendido` corta el acceso comercial hasta
una revisión manual. La aplicación estudiantil sigue funcionando en ambos casos.
Toda negativa muestra un motivo breve: un estado que cambia sin explicación no
le permite a la persona corregir nada.

Para aprobar una ficha, Lucas comprueba que la identidad y el contacto sean
plausibles y que exista algún antecedente académico o docente relacionado con
los ramos ofrecidos. No se promete una certificación formal ni se aprueba por
tener buenas notas dentro de GradeHub. Para aprobar un anuncio se exige ramo y
servicio claros, precio de la clase visible, modalidad, contacto válido y nada de
garantías de aprobación, suplantación institucional o alusiones a las notas de
quien lo recibe.

## Decisión al crear la cuenta

En el registro se amplía la casilla obligatoria que ya acepta los términos; no
se agrega un segundo control:

> ☐ Acepto los términos y la política de privacidad, incluido que GradeHub use
> mis notas y ramos para mostrarme recomendaciones de clases. Se calcula dentro
> de GradeHub; los profesores no ven mis notas ni saben quién eres.

Parte desmarcada. Para crear la cuenta debe marcarla: así queda un acto visible
antes de que GradeHub use sus notas y ramos para ordenar recomendaciones. No hay
una casilla adicional, modal extra ni insistencia en cada visita.

Las cuentas que ya existen reciben el mismo trato: no aparece un selector en
Ajustes, no se crea una preferencia por cuenta y no se reinterpreta ningún dato
guardado. Antes de activar la función, los términos y la política tienen que
decir claramente que el uso local de notas y ramos para ordenar avisos forma
parte del servicio para todas las cuentas.

## Público configurable por campaña

Cada aviso declara universidad, siglas y sus propios `criterios`:

```js
{promedioMenorA: 5, avanceMinimo: 20}
{promedioMenorA: 4, avanceMinimo: 40}
```

Son ejemplos, no reglas globales. El promedio debe ser estrictamente menor al
umbral y el avance al menos el mínimo. La comparación usa el avance sin
redondear: un 19,9% mostrado como 20% no cumple un mínimo de 20%.

`seleccionarClaseApoyo` usa `ramoAvg` y `ramoProgress` existentes. Mantiene el
orden de ramos del estudiante y el orden de avisos para desempatar. El cálculo
queda en el navegador, sin enviar notas para seleccionar el anuncio.

Una sigla solo coincide dentro de la misma universidad. Los ramos sin sigla
verificada, sin notas, con pautas incompletas o listas abiertas sin cantidad
conocida no se usan para personalizar. Tampoco los completamente evaluados.
Un aviso sin criterios queda como catálogo general, no hereda una regla nueva.

Solo se destaca un aviso por pantalla y siempre se muestra su etiqueta de
“Publicidad · Clase particular”. En el piloto aparece únicamente en **Inicio**,
junto al ramo que produjo la coincidencia; no interrumpe la Agenda, el ingreso de
notas, la calculadora ni la ficha del ramo. La persona puede cerrarlo y esa
campaña no vuelve a mostrarse en ese dispositivo. No se reemplaza inmediatamente
por otra: como máximo se intenta una recomendación contextual por día.

El cierre y ese límite viven en una clave local separada
(`gradehub_marketplace_v1`), no dentro de `gradehub_v1`: activar o quitar el
marketplace no migra ni reescribe el estado académico.

El catálogo general sigue siendo el camino para comparar alternativas. Ahí los
avisos se ordenan por ramo y vigencia, no por las notas del estudiante.

## Cotización y cobro: cantidades diferentes

La recomendación comercial es cotizar por público potencial y cobrar por
alcance único efectivo, con un máximo de presupuesto por campaña:

- **Elegibles:** cuentas que cumplen los criterios; sirven para estimar el alcance.
- **Alcanzados:** cuentas distintas que efectivamente vieron el anuncio. Una cuenta
  que abre la app cinco veces no debe cobrarse cinco veces.
- **Precio de la clase:** lo que cobra el tutor por enseñar (`precio_clp` en el aviso).
- **Tarifa publicitaria:** lo que cobra GradeHub por cada cuenta alcanzada. Es aparte.

`cotizarCampanaClases` recibe conteos agregados y una tabla configurable de tarifas.
No recibe notas ni listas de estudiantes. Si cumplen varios tramos toma la tarifa
más alta; una tarifa específica exige ambos criterios. Así la tarifa de bajo 4,0
y al menos 40% no se aplica a bajo 4,0 con solo 20%.

El piloto parte con dos tarifas. Son una decisión comercial configurable por
GradeHub, no un precio que el profesor pueda editar:

| Segmentación | Elegibles | Tarifa por alcance | Si todos lo ven | Si solo lo ven 12 |
|---|---:|---:|---:|---:|
| Bajo 5,0 y ≥20% | 30 | $1.000 | $30.000 | $12.000 |
| Bajo 4,0 y ≥40% | 20 | $2.000 | $40.000 | $24.000 |

El anunciante propone el público y el presupuesto; Lucas puede corregir ambos
antes de aprobar. La cotización definitiva queda congelada cuando el profesor
acepta y paga. Cambiar siglas, texto, criterios, contacto, precio de la clase o
presupuesto crea una nueva revisión: nunca cambia retroactivamente lo cobrado.

La campaña dura 30 días o hasta agotar su presupuesto, lo que ocurra primero. El
presupuesto se paga antes de publicar. Al cerrar, lo que no se gastó queda como
saldo para otra campaña o se devuelve si el profesor lo pide. Con $15.000 y una
tarifa de $2.000 caben siete alcances; los $1.000 restantes no autorizan un octavo.

### Qué se cotiza y qué se cobra

- La **cotización** usa el número de cuentas activas que cumplen la regla en el
  momento de la revisión. Es una fotografía, no una promesa de alcance.
- El **cobro** usa personas alcanzadas realmente, una sola vez por campaña, con
  el tope del presupuesto. Abrir GradeHub cinco veces no cobra cinco veces.
- Un alcance cuenta cuando al menos la mitad de la tarjeta estuvo visible durante
  un segundo. Un clic o contacto se informa aparte, pero no cambia el cobro.
- El profesor ve conteos agregados, costo consumido y saldo. Nunca ve identidades,
  notas, promedios ni la lista de quienes cumplieron la regla.

Para este cálculo, una cuenta activa es una que abrió GradeHub durante los 30 días
anteriores y tiene al menos una nota vigente en el ramo. La marca de actividad es
solo una fecha, no un historial de sesiones. Sin esa señal la cuenta no infla la
cotización, aunque su semestre antiguo siga guardado.

Para deduplicar de verdad, el lanzamiento necesita una tabla privada de alcance
con `(anuncio_id, user_id)` único, ambas FK con `ON DELETE CASCADE`. Solo una RPC
`security definer` escribe en ella usando `auth.uid()`; no hay permisos directos
de lectura para el profesor. Las filas se eliminan 90 días después de terminar la
campaña. Esto permite cobrar una vez sin entregar la identidad al anunciante.

El conteo de elegibles se calcula dentro de GradeHub con el mismo motor académico
y devuelve únicamente un total agregado. No se implementa de nuevo la aritmética
en SQL. La regla y la tarifa aprobadas se guardan como una instantánea inmutable
de la campaña.

`anuncio_metricas` sigue sirviendo para observar impresiones, clics y contactos,
pero **no factura**: cuenta eventos y no personas. La tabla privada de alcance,
el saldo prepago, la fecha de última actividad y el cálculo agregado requieren
otro SQL aditivo y un paso manual antes de activar cobros. No cambian `gradehub_v1`
ni el significado de las notas.

## Muestra revisable sin cuentas reales

```bash
node bin/preview-marketplace.js /tmp/gradehub-marketplace-muestra.html
```

Abre ese HTML: permite cambiar universidad, ramo, promedio máximo, avance mínimo,
tarifas iniciales del piloto y presupuesto. Muestra cotización y tarjeta para perfiles
sintéticos. Las 120 cuentas están inventadas y no salen del navegador. Si una
cuenta calza con dos ramos se cuenta una vez. El ejemplo usa el motor real y
extrae `ramoProgress` desde `app.js`, en vez de mantener otra cuenta de pesos.

El generador y la plantilla viven en `bin/`, excluido del deploy. La muestra se
genera fuera del repo. No hay formulario público de tutor ni tarjeta activada en
Inicio todavía: la segmentación y cotización quedan preparadas para esa interfaz.

## Frontera de datos y métricas

El módulo de datos del primer PR (`marketplace.js`) conserva esta separación:

```text
Supabase -> catálogo público por universidad -> navegador
S.ramos y notas -> cálculo local -> coincidencia local -> tarjeta
datos sincronizados -> cálculo interno restringido -> total elegible
```

Las métricas llevan únicamente `anuncio_id`, tipo de evento y sigla del aviso.
No incluyen `user_id`, correo, carrera, semestre, promedio, nota, estado de
consentimiento ni un indicador de riesgo. Los reportes para tutores salen solo
agregados y desde quince eventos; cuentan eventos, no personas.

## Orden de lanzamiento

1. **Modelo revisado y SQL aplicado manualmente.** El PR de datos incluye
   `supabase/clases_particulares.sql`; Martín debe aplicarlo y comprobar RLS
   antes de que cualquier interfaz lo llame. Un deploy de Cloudflare no ejecuta
   SQL.
2. **Flujo de tutor.** Crear borrador, enviar a revisión y publicar solo después
   de que la ficha del profesor haya sido aprobada, y después de revisión y pago
   manuales del anuncio. El pago inicial es transferencia y se acredita como
   presupuesto; no hay pasarela automática en el primer lanzamiento.
3. **Catálogo general para estudiantes.** Explorar avisos por ramo o sigla, sin
   mirar notas y sin recomendaciones personalizadas. Sirve para probar que los
   avisos son útiles antes de usar cualquier señal académica.
4. **Registro y recomendación local.** La casilla de aceptación obligatoria,
desmarcada al crear cuenta, incorpora el uso local de notas; las cuentas
existentes reciben el mismo trato sin selector. Los términos y la política se
actualizan en el mismo PR antes de activar la tarjeta contextual.
5. **Alcance facturable.** Agregar la tabla privada deduplicada, saldo, expiración
   a 30 días y borrado a 90 días. Va en un PR borrador con SQL manual y pruebas
   de RLS antes de cobrar la primera campaña.
6. **Medición y revisión.** Revisar métricas agregadas, calidad de los avisos y
   frecuencia. No ampliar el público ni agregar nuevos lugares de publicidad sin
   comprobar primero que el piloto ayuda y no interrumpe el uso diario.

Los puntos pendientes de esta lista son implementación, no decisiones de
producto. El flujo, los estados, la ubicación, la frecuencia, las tarifas, la
duración, la unidad de cobro y quién puede aprobar quedaron fijados arriba. Si la
prueba real obliga a cambiarlos, se modifica esta decisión explícitamente; no se
dejan variantes ocultas en distintas funciones.

## Fuera de alcance por ahora

- Vender notas, riesgos, listas de ramos o identidades a profesores.
- Cobros dentro de GradeHub, comisiones por nota o verificaciones falsas de
  inscritos.
- Ranking de estudiantes o listas de perfiles académicos para anunciantes.
  Elegir un umbral de nota en un aviso no autoriza a consultar quién lo cumple.
- Activar recomendaciones personalizadas sin publicar antes los términos y la
  política que describen el uso local de datos académicos.
