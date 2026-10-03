-- Encuestas opcionales del equipo. Aplicar después de administradores.sql.
-- Reaplicable y aditivo: no lee user_ramos ni cambia perfiles/gradehub_v1.
-- profiles.id/universidad y auth.users.created_at son contratos ya existentes.
begin;

create table if not exists admin.encuestas_config (
  id boolean primary key default true check(id),
  instalada_at timestamptz not null default now()
);
insert into admin.encuestas_config(id) values(true) on conflict do nothing;
alter table admin.encuestas_config enable row level security;
revoke all on admin.encuestas_config from public, anon, authenticated;

create table if not exists public.encuestas (
  id uuid primary key default gen_random_uuid(),
  creado_por uuid not null references auth.users(id) on delete cascade,
  pregunta text not null check(char_length(trim(pregunta)) between 1 and 280),
  tipo text not null check(tipo in ('una','varias','texto')),
  opciones text[] not null default '{}',
  publico text not null check(publico in ('todos','fen','uc','uai','uandes')),
  inicio date not null,
  termino date not null check(termino >= inicio),
  estado text not null default 'activa' check(estado in ('activa','pausada','terminada')),
  check((tipo='texto' and cardinality(opciones)=0) or (tipo<>'texto' and cardinality(opciones) between 2 and 6))
);
create table if not exists public.encuesta_respuestas (
  encuesta_id uuid not null references public.encuestas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  opciones integer[] not null default '{}',
  texto text check(char_length(texto) between 1 and 280),
  universidad text not null check(universidad in ('fen','uc','uai','uandes')),
  fecha timestamptz not null default now(),
  primary key(encuesta_id,user_id)
);
create table if not exists public.encuesta_visitas (
  encuesta_id uuid not null references public.encuestas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  veces smallint not null check(veces between 1 and 2),
  ultima_visita uuid not null,
  fecha timestamptz not null default now(),
  primary key(encuesta_id,user_id)
);
create table if not exists public.encuestas_cuentas (
  user_id uuid primary key references auth.users(id) on delete cascade,
  primera_visita uuid not null,
  fecha timestamptz not null default now()
);
alter table public.encuestas enable row level security;
alter table public.encuesta_respuestas enable row level security;
alter table public.encuesta_visitas enable row level security;
alter table public.encuestas_cuentas enable row level security;
revoke all on public.encuestas,public.encuesta_respuestas,public.encuesta_visitas,public.encuestas_cuentas from public,anon,authenticated;

-- Solo la universidad declarada en el perfil; nunca nombre, correo o notas.
create or replace function public.encuestas_universidad()
returns text language sql stable security definer set search_path=pg_catalog,public as $$
  select case universidad
    when 'U. de Chile · FEN' then 'fen'
    when 'U. Católica · Ingeniería' then 'uc'
    when 'U. Adolfo Ibáñez' then 'uai'
    when 'U. de los Andes' then 'uandes'
    else null end
  from public.profiles where id=auth.uid();
$$;
revoke all on function public.encuestas_universidad() from public,anon;
grant execute on function public.encuestas_universidad() to authenticated;

drop policy if exists encuestas_activas on public.encuestas;
create policy encuestas_activas on public.encuestas for select to authenticated using (
  estado='activa' and (now() at time zone 'America/Santiago')::date between inicio and termino
  and (publico='todos' or publico=public.encuestas_universidad())
);
drop policy if exists encuesta_respuesta_propia on public.encuesta_respuestas;
create policy encuesta_respuesta_propia on public.encuesta_respuestas for select to authenticated using(user_id=auth.uid());
drop policy if exists encuesta_visita_propia on public.encuesta_visitas;
create policy encuesta_visita_propia on public.encuesta_visitas for select to authenticated using(user_id=auth.uid());
drop policy if exists encuestas_cuenta_propia on public.encuestas_cuentas;
create policy encuestas_cuenta_propia on public.encuestas_cuentas for select to authenticated using(user_id=auth.uid());
grant select(id,pregunta,tipo,opciones,publico,inicio,termino,estado) on public.encuestas to authenticated;
grant select on public.encuesta_respuestas,public.encuesta_visitas,public.encuestas_cuentas to authenticated;

create or replace function public.mi_encuesta_activa()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare e public.encuestas; respuesta jsonb;
begin
  if auth.uid() is null or public.encuestas_universidad() is null then return null; end if;
  select * into e from public.encuestas where estado='activa'
    and (now() at time zone 'America/Santiago')::date between inicio and termino
    and (publico='todos' or publico=public.encuestas_universidad()) limit 1;
  if not found then return null; end if;
  select jsonb_build_object('opciones',r.opciones,'texto',r.texto) into respuesta
    from public.encuesta_respuestas r where r.encuesta_id=e.id and r.user_id=auth.uid();
  return jsonb_build_object('id',e.id,'pregunta',e.pregunta,'tipo',e.tipo,'opciones',e.opciones,
    'publico',e.publico,'inicio',e.inicio,'termino',e.termino,'respuesta',respuesta);
end; $$;

-- Una sesión de uso es una visita (UUID conservado en sessionStorage por cuenta).
-- Recargar mantiene la visita; otra apertura no exige cerrar la sesión de Auth.
-- Las cuentas anteriores a instalar este SQL son elegibles desde el primer uso.
create or replace function public.encuesta_al_entrar(p_visita uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,admin as $$
declare uid uuid:=auth.uid(); primera uuid;
  creada timestamptz; instalada timestamptz; e jsonb; v public.encuesta_visitas;
begin
  if uid is null or p_visita is null then return null; end if;
  insert into public.encuestas_cuentas(user_id,primera_visita) values(uid,p_visita) on conflict do nothing;
  -- Serializa las aperturas de esta cuenta: dos pestañas no superan el máximo.
  select primera_visita into primera from public.encuestas_cuentas where user_id=uid for update;
  select created_at into creada from auth.users where id=uid;
  select instalada_at into instalada from admin.encuestas_config where id;
  if creada>=instalada and primera=p_visita then return null; end if;
  e:=public.mi_encuesta_activa();
  if e is null then return null; end if;
  if e->'respuesta'<>'null'::jsonb then return jsonb_build_object('encuesta',e,'mostrar',false); end if;
  select * into v from public.encuesta_visitas where encuesta_id=(e->>'id')::uuid and user_id=uid;
  if found and (v.veces>=2 or v.ultima_visita=p_visita) then
    return jsonb_build_object('encuesta',e,'mostrar',false);
  end if;
  insert into public.encuesta_visitas(encuesta_id,user_id,veces,ultima_visita)
    values((e->>'id')::uuid,uid,1,p_visita)
    on conflict(encuesta_id,user_id) do update set veces=encuesta_visitas.veces+1,ultima_visita=p_visita,fecha=now();
  return jsonb_build_object('encuesta',e,'mostrar',true);
end; $$;

create or replace function public.responder_encuesta(p_encuesta uuid,p_opciones integer[] default '{}',p_texto text default null)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare uid uuid:=auth.uid(); e public.encuestas; uni text:=public.encuestas_universidad();
begin
  if uid is null or uni is null then raise exception 'No pudimos confirmar tu universidad.' using errcode='42501'; end if;
  -- Comparte el candado con pausar/terminar; no acepta una respuesta después.
  select * into e from public.encuestas where id=p_encuesta for share;
  if not found or e.estado<>'activa' or (now() at time zone 'America/Santiago')::date not between e.inicio and e.termino
    or (e.publico<>'todos' and e.publico<>uni) then
    raise exception 'La encuesta ya no está disponible.' using errcode='42501';
  end if;
  p_opciones:=coalesce(p_opciones,'{}'); p_texto:=nullif(trim(p_texto),'');
  if e.tipo='texto' then
    if cardinality(p_opciones)<>0 or p_texto is null or char_length(p_texto)>280 then raise exception 'Escribe entre 1 y 280 caracteres.'; end if;
  else
    if p_texto is not null or cardinality(p_opciones)<1 or (e.tipo='una' and cardinality(p_opciones)<>1)
      or exists(select 1 from unnest(p_opciones) x where x is null or x<1 or x>cardinality(e.opciones))
      or cardinality(p_opciones)<>(select count(distinct x) from unnest(p_opciones) x) then
      raise exception 'Revisa las opciones de tu respuesta.';
    end if;
  end if;
  insert into public.encuesta_respuestas(encuesta_id,user_id,opciones,texto,universidad)
    values(e.id,uid,p_opciones,p_texto,uni)
    on conflict(encuesta_id,user_id) do update set opciones=excluded.opciones,texto=excluded.texto,universidad=excluded.universidad,fecha=now();
  return true;
end; $$;

create or replace function public.admin_crear_encuesta(p_pregunta text,p_tipo text,p_opciones text[],p_publico text,p_inicio date,p_termino date)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,admin as $$
declare nueva uuid;
begin
  perform admin.exigir_administrador();
  p_pregunta:=trim(p_pregunta); p_opciones:=coalesce(p_opciones,'{}');
  if p_pregunta is null or char_length(p_pregunta) not between 1 and 280
    or p_tipo is null or p_tipo not in ('una','varias','texto') or p_publico is null or p_publico not in ('todos','fen','uc','uai','uandes')
    or p_inicio is null or p_termino is null or p_termino<p_inicio or p_termino<(now() at time zone 'America/Santiago')::date then raise exception 'Revisa la pregunta, el público y las fechas.'; end if;
  if (p_tipo='texto' and cardinality(p_opciones)<>0) or (p_tipo<>'texto' and cardinality(p_opciones) not between 2 and 6)
    or exists(select 1 from unnest(p_opciones) x where x is null or char_length(trim(x)) not between 1 and 160)
    or cardinality(p_opciones)<>(select count(distinct lower(trim(x))) from unnest(p_opciones) x) then raise exception 'Usa entre 2 y 6 opciones distintas; texto corto no lleva opciones.'; end if;
  -- También reserva fechas futuras. Todos se solapa con cualquier universidad.
  lock table public.encuestas in share row exclusive mode;
  if exists(select 1 from public.encuestas where estado='activa' and inicio<=p_termino and termino>=p_inicio
    and (publico=p_publico or publico='todos' or p_publico='todos')) then raise exception 'Ya hay una encuesta para ese público en esas fechas.'; end if;
  insert into public.encuestas(creado_por,pregunta,tipo,opciones,publico,inicio,termino)
    values(auth.uid(),p_pregunta,p_tipo,p_opciones,p_publico,p_inicio,p_termino) returning id into nueva;
  return nueva;
end; $$;

create or replace function public.admin_estado_encuesta(p_encuesta uuid,p_estado text)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,admin as $$
declare e public.encuestas;
begin
  perform admin.exigir_administrador();
  if p_estado is null or p_estado not in ('activa','pausada','terminada') then raise exception 'Estado inválido.'; end if;
  lock table public.encuestas in share row exclusive mode;
  select * into e from public.encuestas where id=p_encuesta for update;
  if not found or e.estado='terminada' then raise exception 'La encuesta ya terminó.'; end if;
  if p_estado='activa' and (e.termino<(now() at time zone 'America/Santiago')::date or exists(
    select 1 from public.encuestas where id<>e.id and estado='activa' and inicio<=e.termino and termino>=e.inicio
    and (publico=e.publico or publico='todos' or e.publico='todos'))) then raise exception 'No se puede reanudar: revisa las fechas y el público.'; end if;
  update public.encuestas set estado=p_estado where id=e.id;
  return true;
end; $$;

create or replace function public.admin_encuestas()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,admin as $$
begin
  perform admin.exigir_administrador();
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'pregunta',pregunta,'tipo',tipo,'opciones',opciones,
    'publico',publico,'inicio',inicio,'termino',termino,'estado',estado) order by inicio desc) from public.encuestas),'[]');
end; $$;

create or replace function public.admin_resultados_encuesta(p_encuesta uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,admin as $$
declare e public.encuestas; total bigint; opciones jsonb; textos jsonb;
begin
  perform admin.exigir_administrador();
  select * into e from public.encuestas where id=p_encuesta;
  if not found then raise exception 'Encuesta no encontrada.'; end if;
  select count(*) into total from public.encuesta_respuestas where encuesta_id=e.id;
  select coalesce(jsonb_agg(jsonb_build_object('opcion',etiqueta,'total',n) order by posicion),'[]') into opciones from (
    select etiqueta,posicion,(select count(*) from public.encuesta_respuestas r where r.encuesta_id=e.id and posicion::int=any(r.opciones)) n
    from unnest(e.opciones) with ordinality x(etiqueta,posicion)
  ) conteos;
  select coalesce(jsonb_agg(jsonb_build_object('texto',texto,'total',n) order by texto),'[]') into textos from (
    select texto,count(*) n from public.encuesta_respuestas where encuesta_id=e.id and texto is not null group by texto
  ) conteos;
  return jsonb_build_object('total',total,'opciones',opciones,'textos',textos);
end; $$;

revoke all on function public.mi_encuesta_activa(),public.encuesta_al_entrar(uuid),public.responder_encuesta(uuid,integer[],text),
  public.admin_crear_encuesta(text,text,text[],text,date,date),public.admin_estado_encuesta(uuid,text),public.admin_encuestas(),public.admin_resultados_encuesta(uuid) from public,anon;
grant execute on function public.mi_encuesta_activa(),public.encuesta_al_entrar(uuid),public.responder_encuesta(uuid,integer[],text),
  public.admin_crear_encuesta(text,text,text[],text,date,date),public.admin_estado_encuesta(uuid,text),public.admin_encuestas(),public.admin_resultados_encuesta(uuid) to authenticated;
commit;
