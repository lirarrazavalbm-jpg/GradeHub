-- Aserciones que también corre npm run sql. No basta con que el DDL aplique.
do $$ begin
  if not public.campana_visible('00000000-0000-0000-0000-000000000010') then
    raise exception 'Se ocultó un anuncio publicado sin campaña';
  end if;
  if (select estado from public.tutor_anuncios where id='00000000-0000-0000-0000-000000000011') <> 'pausado' then
    raise exception 'Se reactivó un anuncio pausado';
  end if;
  if (select estado from public.tutor_anuncios where id='00000000-0000-0000-0000-000000000012') <> 'en_revision' then
    raise exception 'Se perdió una revisión pendiente';
  end if;
  if (select count(*) from public.tutor_suspensiones) <> 0 then
    raise exception 'Se inventaron suspensiones sin evidencia de aprobación';
  end if;
  if (select monto_clp from admin.cobros where anuncio_id='00000000-0000-0000-0000-000000000010') <> 1350 then
    raise exception 'Se alteró un cobro existente';
  end if;
  if (select vistas from public.costo_campana('00000000-0000-0000-0000-000000000010')) <> 1
    or (select contactos from public.costo_campana('00000000-0000-0000-0000-000000000010')) <> 1 then
    raise exception 'Se perdió el alcance histórico';
  end if;
  if (select count(*) from respaldo_515.funciones) <> 13 then
    raise exception 'El respaldo no incluye todas las funciones modificadas';
  end if;
end $$;
