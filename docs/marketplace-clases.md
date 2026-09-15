# Marketplace de clases particulares

Este documento define el recorrido antes de construir la interfaz. Su objetivo
es que un estudiante encuentre apoyo para un ramo sin convertir sus notas en un
dato que GradeHub entregue a profesores o anunciantes.

## Principio que no se negocia

La recomendación personalizada se decide **en el navegador**. El servidor puede
entregar el catálogo público de avisos de una universidad, pero no recibe qué
ramos tiene la persona, qué promedio lleva, si puede aprobar ni una señal de
riesgo. Un tutor tampoco ve quién recibió su aviso.

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
“Publicidad · Clase particular”. La persona puede cerrarlo; el catálogo general sigue siendo
el camino para comparar alternativas.

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

Ejemplos para probar el modelo, **no precios aprobados ni alcance real**:

| Segmentación | Elegibles | Tarifa por alcance | Si todos lo ven | Si solo lo ven 12 |
|---|---:|---:|---:|---:|
| Bajo 5,0 y ≥20% | 30 | $1.000 | $30.000 | $12.000 |
| Bajo 4,0 y ≥40% | 20 | $2.000 | $40.000 | $24.000 |

El anunciante puede acotar público y presupuesto. Las tarifas las administra
GradeHub; no pueden ser un campo que el anunciante mande como precio definitivo.
Con $15.000 de presupuesto y $2.000 por persona caben siete alcances facturables,
no ocho. Sin medición disponible, la cotización devuelve desconocido (`null`),
nunca cero cuentas. Los precios/criterios acordados deberán fijarse al publicar:
editarlos después no puede cambiar retroactivamente una factura.

### Lo que todavía impide cobrar

Las métricas de `anuncio_metricas` cuentan eventos agregados y limitan su frecuencia
globalmente. **No son cuentas únicas y no sirven como facturas.** No hay un conteo
real de cuentas elegibles implementado en este PR ni se consultó producción.

Para activar cotizaciones reales y cobros falta un diseño adicional: ventana de
medición para elegibles, deduplicación de alcance por cuenta/campaña, presupuesto
aplicado en el servidor y tarifas fijadas al publicar. El tutor debe recibir solo
agregados. La deduplicación requiere un registro nuevo y definir cuánto dura y
cómo se elimina con la cuenta; no se puede prometer alcance único usando el
contador actual ni afirmar que no guarda identidad mientras depende de ella.

No se cambia la persistencia de notas ni `gradehub_v1` para resolver esto. Antes
de implementar esos registros se acuerda su modelo y se prepara SQL aditivo.

## Muestra revisable sin cuentas reales

```bash
node bin/preview-marketplace.js /tmp/gradehub-marketplace-muestra.html
```

Abre ese HTML: permite cambiar universidad, ramo, promedio máximo, avance mínimo,
tarifas de ejemplo y presupuesto. Muestra cotización y tarjeta para perfiles
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
   manuales del anuncio. No hay pasarela de pago ni publicación automática en
   el primer lanzamiento.
3. **Catálogo general para estudiantes.** Explorar avisos por ramo o sigla, sin
   mirar notas y sin recomendaciones personalizadas. Sirve para probar que los
   avisos son útiles antes de usar cualquier señal académica.
4. **Registro y recomendación local.** La casilla de aceptación obligatoria,
desmarcada al crear cuenta, incorpora el uso local de notas; las cuentas
existentes reciben el mismo trato sin selector. Los términos y la política se
actualizan en el mismo PR antes de activar la tarjeta contextual.
5. **Medición y revisión.** Se revisan métricas agregadas, calidad de los
   avisos y el límite de datos local. Antes de escalar, hacer revisión legal de
   publicidad dirigida a estudiantes y del tratamiento de usuarios menores de
   edad.

## Fuera de alcance por ahora

- Vender notas, riesgos, listas de ramos o identidades a profesores.
- Cobros dentro de GradeHub, comisiones por nota o verificaciones falsas de
  inscritos.
- Ranking de estudiantes o listas de perfiles académicos para anunciantes.
  Elegir un umbral de nota en un aviso no autoriza a consultar quién lo cumple.
- Activar recomendaciones personalizadas sin publicar antes los términos y la
  política que describen el uso local de datos académicos.
