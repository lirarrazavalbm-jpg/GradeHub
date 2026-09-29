# Campañas seguras (#515)

## Cuentas existentes

Antes de aplicar el SQL, el cliente nuevo reconoce únicamente los errores de
esquema 42883, 42703, PGRST202, PGRST204, 42P01 y PGRST205. Con el esquema
anterior se puede enviar un anuncio a revisión aunque no exista el guardado de
campaña; la pantalla aclara que días/tope no se guardaron y deben confirmarse
antes de publicar. WhatsApp sigue exigiendo nueve dígitos después del 56 al
ENVIAR, mientras guardar el borrador admite el número incompleto. Red caída,
permisos denegados y una campaña ausente en el esquema nuevo bloquean el envío.

El admin avisa que usa SQL anterior y puede marcar el cobro actual mediante la
RPC anterior. Relee la fecha antes de esa llamada: no redirige intencionalmente
un cobro histórico ni una fila ya renovada. Esa API vieja no tiene control
atómico por fecha: mientras se use, no renovar publicaciones simultáneamente
con cobros. El SQL nuevo elimina esa limitación con la RPC por publicación.
Nunca se reintenta una escritura con error de red o permisos.

Después del SQL, las métricas antiguas quedan en el grupo `-infinity`; no se
reparte el pasado entre fechas inventadas. La campaña vigente conserva sus
contadores y la siguiente publicación comienza otra medición. Los cobros
anteriores permanecen y se pueden editar por fecha. No se recalculan ni borran
importes guardados. La retención de alcance/interacciones sigue el vencimiento
de cada publicación (90 días).

Los anuncios ya publicados sin campaña no se ocultan ni necesitan una campaña
inventada. Las revisiones heredadas aún se pueden publicar con el respaldo
anterior de días; solo los envíos NUEVOS a revisión exigen campaña persistida.
Un anuncio pausado no se reactiva al reaplicar ni al reactivar al profesor.

Suspensiones registra solo aprobado → suspendido; no registra pendientes ni
rechazados. Para suspendidos existentes con evidencia de publicación se inicia
el intervalo desde la instalación, sin inventar un historial anterior. La
tabla es privada, con RLS y FK directa a auth.users ON DELETE CASCADE.

## Pasos para Lucas, en orden

Nada de esto se ejecutó en producción. El cliente anterior también funciona
con el SQL nuevo; no hace falta desplegar primero. Aplicar con baja actividad:
el cambio de llaves necesita bloquear brevemente las tablas de métricas.

1. **Respaldo.** En SQL Editor ejecutar completo
   `supabase/respaldo_campanas_515.sql`. Crea copias con `CREATE TABLE … AS SELECT
   * …` y guarda las definiciones REALES de las 13 funciones afectadas en el
   esquema privado `respaldo_515`. Tiene RLS, permisos revocados y borrado en
   cascada para las copias con identidades. Falla si el respaldo existe o la
   migración ya está aplicada; no sobrescribirlo. Requiere las tres tablas de
   métricas, campañas y admin existentes: si falta alguna, detenerse y revisar
   el esquema en lugar de suponer que una base vacía reproduce producción.
2. **Aplicar el SQL**, archivos completos, en este orden:
   `supabase/clases_particulares.sql`, `supabase/admin_clases.sql`,
   `supabase/administradores.sql`. Cada uno usa BEGIN/COMMIT y se puede reaplicar.
   Si falla uno, detener la secuencia y corregir o usar la reversión de abajo.
3. **Verificar** con las consultas siguientes. La comparación de estados/cobros
   debe dar cero filas salvo escrituras legítimas ocurridas durante el trabajo;
   no restaurar la copia automáticamente si hay diferencias.
4. **Mergear #515**, solo después de la revisión y de las consultas.
5. **Mergear #522**, después de #515. Su base debe quedar en main conservando
   sus commits; sus vistas y handlers de muestra viven en bin/ y no se publican.

```sql
-- Respaldo completo: 13 funciones; conteos de referencia.
select count(*) as funciones_respaldadas from respaldo_515.funciones;
select 'metricas' tabla, count(*) filas from respaldo_515.anuncio_metricas
union all select 'alcance', count(*) from respaldo_515.anuncio_alcance
union all select 'interacciones', count(*) from respaldo_515.anuncio_interacciones;

-- No deben cambiar los estados ni las fechas de anuncios ya existentes.
select a.id, b.estado antes, a.estado despues
from public.tutor_anuncios a join respaldo_515.tutor_anuncios b using(id)
where (a.estado,a.publicado_at,a.vence_at) is distinct from
      (b.estado,b.publicado_at,b.vence_at);
-- Ningún cobro previo perdido o alterado.
select b.* from respaldo_515.cobros b
left join admin.cobros c using(anuncio_id,publicado_at)
where c.anuncio_id is null or (c.estado,c.monto_clp) is distinct from (b.estado,b.monto_clp);
-- Tres PK con publicacion. Las filas heredadas siguen en -infinity.
select conrelid::regclass tabla, pg_get_constraintdef(oid) llave
from pg_constraint where contype='p' and conrelid in
 ('public.anuncio_metricas'::regclass,'public.anuncio_alcance'::regclass,'public.anuncio_interacciones'::regclass);
select 'alcance' tabla, count(*) filas from public.anuncio_alcance where publicacion='-infinity'
union all select 'interacciones',count(*) from public.anuncio_interacciones where publicacion='-infinity'
union all select 'metricas',count(*) from public.anuncio_metricas where publicacion='-infinity';
-- Los anuncios publicados sin campaña siguen visibles si son vigentes/aprobados.
select a.id, public.campana_visible(a.id) visible
from public.tutor_anuncios a left join public.anuncio_campanas c on c.anuncio_id=a.id
where a.estado='publicado' and c.anuncio_id is null and a.publicado_at<=now()
  and (a.vence_at is null or a.vence_at>now()) and public.tutor_aprobado(a.autor_id);
-- Nueva tabla privada, RLS sí y FK a auth.users con borrado CASCADE.
select relrowsecurity from pg_class where oid='public.tutor_suspensiones'::regclass;
select pg_get_constraintdef(oid) from pg_constraint
where conrelid='public.tutor_suspensiones'::regclass and contype='f';
select grantee,privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name='tutor_suspensiones'
  and grantee in ('anon','authenticated','PUBLIC'); -- cero filas
select to_regprocedure('public.admin_marcar_cobro_publicacion(uuid,timestamp with time zone,text,integer)');
```

## Reversión

Si solo se aplicó clases_particulares o se aplicaron los tres archivos:

1. Suspender publicaciones/renovaciones manuales durante la operación.
2. Ejecutar completo `supabase/revertir_campanas_515.sql`. Usa una transacción
   y bloqueo de escritura. Falla sin respaldo completo. Archiva todas las
   métricas posteriores (incluidas publicaciones distintas de la misma cuenta)
   en `respaldo_515.*_posterior` con RLS y FK; deja en las tablas operativas solo
   la publicación actual, restaura las llaves antiguas y las funciones reales
   respaldadas. Las columnas aditivas y las suspensiones privadas quedan como
   evidencia. No vuelve anuncios, cuentas ni cobros a una foto vieja.
3. Verificar:

```sql
select conrelid::regclass,pg_get_constraintdef(oid) from pg_constraint
where contype='p' and conrelid in ('anuncio_metricas'::regclass,'anuncio_alcance'::regclass,'anuncio_interacciones'::regclass);
-- Las PK ya no contienen publicacion; la RPC nueva debe ser NULL.
select to_regprocedure('public.admin_marcar_cobro_publicacion(uuid,timestamp with time zone,text,integer)');
select count(*) from respaldo_515.anuncio_alcance_posterior;
select count(*) from respaldo_515.anuncio_interacciones_posterior;
select count(*) from admin.cobros;
```

El cliente detecta de nuevo la RPC anterior. No aplicar simplemente los SQL
viejos: no restauran por sí solos las llaves. Tras revertir, la medición vuelve
al comportamiento anterior; el detalle separado permanece en el archivo
privado. Conservar ese archivo para conciliación y luego eliminarlo de acuerdo
con la retención; no mantener copias indefinidamente. No ejecutar una segunda
reversión con el mismo archivo posterior: aborta antes de tocar datos.

## Validación

`npm test` incluye el flujo de WhatsApp, compatibilidad de seis códigos de error,
SQL nuevo/antiguo, permisos, fallas de red y cobro histórico. PGlite prueba la
migración desde el esquema fijado en `2a6118e` con anuncios publicados, pausados
y en revisión, campañas y deuda sintética; reaplicación sin reconstruir PK,
reversión tras renovar, RLS, MFA y eliminación de cuentas.

```sh
npm run sql -- bin/fixtures/campanas-515/antes.sql bin/fixtures/campanas-515/datos.sql supabase/respaldo_campanas_515.sql supabase/clases_particulares.sql supabase/admin_clases.sql supabase/administradores.sql bin/fixtures/campanas-515/verificar.sql supabase/clases_particulares.sql supabase/admin_clases.sql supabase/administradores.sql bin/fixtures/campanas-515/verificar.sql supabase/revertir_campanas_515.sql
```

Se usa `bin/supabase-stubs.sql`; los fixtures son completamente sintéticos.
Estas pruebas no certifican el esquema real de producción.

## Diseño (HIG)

Se conserva el error rojo de WhatsApp, aria-invalid y foco en el campo; el aviso
de compatibilidad es texto persistente con role=status. Referencias: Apple
[Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback),
[Text fields](https://developer.apple.com/design/human-interface-guidelines/text-fields)
y [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility).
Se mantienen controles de 44×44, foco visible, contraste 4,5:1 en ambos modos y
prefers-reduced-motion. No se activan vistas nuevas en #515.
