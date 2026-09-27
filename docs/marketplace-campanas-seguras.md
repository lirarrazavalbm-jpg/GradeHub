# Campañas, suspensiones y cobros por publicación

Esta actualización corrige cuatro fallas: días cobrados mientras el profesor
está suspendido, métricas arrastradas al republicar, deuda histórica ausente
del panel y envíos a revisión sin haber guardado la campaña.

## Comportamiento

- Suspender al profesor oculta sus anuncios y detiene el tiempo facturable.
  Reactivarlo conserva ese descuento. No prolonga la fecha de término ni
  reactiva un anuncio que se pausó individualmente.
- Cada publicación nueva tiene su propia medición. La misma cuenta puede
  contar otra vez en esa publicación, una vez por tipo de interacción.
  Los registros de la publicación anterior permanecen sujetos a su retención.
- Admin suma todos los cobros guardados. Los anteriores aparecen en la ficha
  del anuncio y se pueden saldar por su fecha, sin alterar el cobro actual.
- Si falla el guardado de días, fecha o tope, el anuncio permanece en borrador.
  El servidor también exige campaña antes de enviarlo o publicarlo.

## Datos anteriores

Las métricas anteriores no permiten reconstruir con certeza a qué publicación
pertenecía cada persona. Se conservan juntas en el grupo interno `-infinity`:
la campaña vigente mantiene sus totales y la próxima publicación empieza en
cero. No se inventa una distribución histórica ni se borra el alcance.

La retención de alcance e interacciones se liga al vencimiento de la
publicación; para filas anteriores se conserva el vencimiento conocido al
aplicar el SQL. Si no existe, se mantiene el respaldo al vencimiento del
anuncio. Republicar no extiende la retención de filas con vencimiento conocido.

Para profesores que ya estaban suspendidos, el intervalo empieza al aplicar
esta actualización. No hay un historial fiable para descontar suspensiones
anteriores: cualquier corrección retroactiva de esos importes requiere revisión
manual. Los cobros guardados nunca se recalculan ni eliminan al republicar.

## Aplicación pendiente de aprobación

El PR prepara el SQL; no lo ejecuta en producción. Aplicarlo cambia datos
persistidos y necesita aprobación. Antes de aplicarlo, comprobar el esquema
real y disponer de un respaldo de las tablas afectadas.

Ejecutar completos en el SQL Editor de Supabase, en este orden, antes de
desplegar el cliente:

1. `supabase/clases_particulares.sql`
2. `supabase/admin_clases.sql`
3. `supabase/administradores.sql`

Cada archivo usa una transacción. El primero agrega columnas de publicación,
amplía las tres claves primarias y agrega una tabla privada de suspensiones.
La ampliación puede bloquear brevemente las tablas de métricas; programar la
aplicación con baja actividad. No modifica ramos, notas ni estados académicos.
La firma anterior de publicación y la RPC anterior de cobros se conservan.

Si falla un archivo, detener la secuencia y resolver el error antes del
despliegue. No aplicar los SQL antiguos como rollback: sus claves más pequeñas
no admiten registros de varias publicaciones. El cliente anterior puede seguir
funcionando con el SQL nuevo; volver atrás el esquema necesita una migración
específica que preserve los registros.

## Verificación

`npm test` incluye pruebas de formulario, deduplicación en el cliente, resumen
y edición de cobros históricos, y PostgreSQL en memoria con PGlite. Las pruebas
SQL ejercitan suspensión/reactivación, publicación, conservación de registros,
retención, reaplicación, RLS y segundo factor con cuentas sintéticas.

También se comprobó localmente la actualización desde los tres SQL del commit
`2624ead`, con métricas y deuda sintéticas ya guardadas. Se conservaron costo,
deuda y registros, y la publicación siguiente comenzó en cero. Estas pruebas
no afirman que el esquema de producción coincida con el del repositorio.
