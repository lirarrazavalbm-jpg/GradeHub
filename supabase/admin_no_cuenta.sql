-- Las cuentas de administrador no cuentan como interacción en los anuncios.
-- Pedido de Lucas del 2026-09-30: al revisar anuncios publicados, sus vistas,
-- aperturas y contactos se sumaban a lo que se le cobra al profesor.
--
-- Reaplicable en SQL Editor. Las dos marcas auxiliares no modifican importes
-- ni deduplicación cobrable; las filas anteriores no se vuelven a sumar.
--
-- Son copia EXACTA de las definiciones en clases_particulares.sql, que sigue
-- siendo la fuente: tests/admin-no-cuenta.test.js exige que sean idénticas,
-- así reaplicar cualquiera de los dos archivos deja lo mismo.

begin;

alter table public.anuncio_alcance add column if not exists metrica_aux_registrada boolean not null default true;
alter table public.anuncio_alcance alter column metrica_aux_registrada set default false;
alter table public.anuncio_interacciones add column if not exists metrica_aux_registrada boolean not null default true;
alter table public.anuncio_interacciones alter column metrica_aux_registrada set default false;

create or replace function public.es_administrador(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, admin
as $$
begin
  -- plpgsql y no sql: una función sql valida la tabla al crearse, y
  -- clases_particulares.sql se aplica antes que administradores.sql.
  return p_user_id is not null
     and exists (select 1 from admin.administradores a where a.user_id = p_user_id);
end;
$$;
revoke all on function public.es_administrador(uuid) from public, anon, authenticated;

create or replace function public.cuenta_para_campana(p_anuncio_id uuid, p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_user_id is null or not public.campana_visible(p_anuncio_id) then return false; end if;
  if exists (select 1 from public.tutor_anuncios where id = p_anuncio_id and autor_id = p_user_id) then
    return false;
  end if;
  if public.es_administrador(p_user_id) then
    return false;
  end if;
  return exists (select 1 from public.user_ramos where user_id = p_user_id);
end;
$$;
revoke all on function public.cuenta_para_campana(uuid, uuid) from public, anon, authenticated;

create or replace function public.registrar_metrica_anuncio(
  p_anuncio_id uuid,
  p_tipo text,
  p_ramo_sigla text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  anuncio public.tutor_anuncios%rowtype;
  filas_escritas integer := 0;
  dia_evento date;
  sigla text := upper(btrim(coalesce(p_ramo_sigla, '')));
begin
  if auth.uid() is null then
    raise exception 'hay que haber iniciado sesión';
  end if;
  if p_tipo not in ('impresion', 'clic', 'contacto') then
    raise exception 'tipo de métrica inválido';
  end if;
  -- Un administrador revisando anuncios no suma eventos (2026-09-30).
  if public.es_administrador(auth.uid()) then
    return false;
  end if;
  if char_length(sigla) not between 2 and 24 then
    raise exception 'sigla inválida';
  end if;

  select * into anuncio
  from public.tutor_anuncios
  where id = p_anuncio_id;

  if not found then
    raise exception 'anuncio no disponible';
  end if;
  if not (sigla = any(anuncio.ramos_siglas)) then
    raise exception 'la sigla no corresponde al anuncio';
  end if;

  -- Solo el primer evento auxiliar de una fila que YA se contó para cobro
  -- puede sumar al gráfico. La RPC cobrable conserva canal, llave y tarifa.
  -- También permite terminar el registro si la campaña se pausó o agotó
  -- inmediatamente después de contar esa fila.
  if p_tipo = 'impresion' then
    update public.anuncio_alcance set metrica_aux_registrada = true
    where anuncio_id = p_anuncio_id and user_id = auth.uid()
      and publicacion = anuncio.medicion_desde and not metrica_aux_registrada
    returning dia into dia_evento;
  else
    update public.anuncio_interacciones set metrica_aux_registrada = true
    where anuncio_id = p_anuncio_id and user_id = auth.uid()
      and publicacion = anuncio.medicion_desde
      and tipo = case p_tipo when 'clic' then 'apertura' else 'contacto' end
      and not metrica_aux_registrada
    returning dia into dia_evento;
  end if;
  if dia_evento is null then return false; end if;

  -- El agregado sigue sin identidad, notas, ramos del estudiante ni canal.
  insert into public.anuncio_metricas (anuncio_id, dia, tipo, tenant, ramo_sigla, eventos, publicacion, vence_publicacion)
  values (anuncio.id, dia_evento, p_tipo, anuncio.tenant, sigla, 1, anuncio.medicion_desde, anuncio.vence_at)
  on conflict (anuncio_id, dia, tipo, tenant, ramo_sigla, publicacion) do update
    set eventos = public.anuncio_metricas.eventos + 1,
        updated_at = now();

  get diagnostics filas_escritas = row_count;
  return filas_escritas = 1;
end;
$$;

commit;
