-- Pack de clases y descuento por venir de GradeHub. Pedido de Lucas del
-- 2026-09-30, a partir del pack de 4 clases de Salva Ramos.
--
-- Aplícalo en el SQL Editor de Supabase DESPUÉS de clases_particulares.sql y
-- admin_clases.sql. Es aditivo y reaplicable: agrega dos columnas que parten
-- vacías y una función de administración. No cambia ningún anuncio existente,
-- ni la medición, ni lo que se cobra. La app funciona con y sin este SQL: si
-- no está, deja de pedir estas columnas y no ofrece el pack.
--
-- Las columnas y sus permisos también están en clases_particulares.sql, para
-- que reaplicar ese archivo entero no se los quite (tests/pack-reaplicar-sql).
-- admin.descuento_anuncio vive solo acá: el esquema admin se crea después.
--
-- EL PRECIO SIGUE SIENDO POR CLASE. `precio_clp` no cambia de significado:
-- `pack_clases` solo dice cuántas trae el pack, y la app muestra el total.
--
-- EL DESCUENTO LO FIJA GRADEHUB, NO EL PROFESOR (opción B de Lucas): es parte
-- del acuerdo comercial. El cliente puede LEERLO, para mostrarlo, pero no
-- tiene permiso de escribirlo; se fija con admin.descuento_anuncio().

begin;

alter table public.tutor_anuncios add column if not exists pack_clases integer
  check (pack_clases is null or pack_clases between 2 and 20);
alter table public.tutor_anuncios add column if not exists descuento_gradehub_pct integer
  check (descuento_gradehub_pct is null or descuento_gradehub_pct between 1 and 50);

-- Se leen igual que el resto de lo público del anuncio.
grant select (pack_clases, descuento_gradehub_pct) on public.tutor_anuncios to anon, authenticated;
-- El profesor escribe el pack. El descuento, a propósito, no.
grant insert (pack_clases) on public.tutor_anuncios to authenticated;
grant update (pack_clases) on public.tutor_anuncios to authenticated;

-- Fijar o quitar el descuento de un anuncio, desde el SQL Editor:
--   select admin.descuento_anuncio('<anuncio_id>', 10);    -- 10% por venir de GradeHub
--   select admin.descuento_anuncio('<anuncio_id>', null);  -- sin descuento
-- Se puede hacer con el anuncio publicado: no cambia estado, fechas ni medición
-- (los triggers de publicación solo miran estado y publicado_at).
create or replace function admin.descuento_anuncio(p_anuncio_id uuid, p_pct integer)
returns text
language plpgsql
set search_path = public, admin
as $$
begin
  if p_pct is not null and p_pct not between 1 and 50 then
    raise exception 'el descuento va de 1 a 50 (o null para quitarlo)';
  end if;
  update public.tutor_anuncios set descuento_gradehub_pct = p_pct where id = p_anuncio_id;
  if not found then
    raise exception 'no existe el anuncio %', p_anuncio_id;
  end if;
  return case when p_pct is null then 'sin descuento' else p_pct || '% por venir de GradeHub' end;
end;
$$;
revoke all on function admin.descuento_anuncio(uuid, integer) from public, anon, authenticated;

commit;
