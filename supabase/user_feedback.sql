-- Canal general de sugerencias y comentarios.
--
-- APLÍCALO UNA VEZ en el SQL Editor de Supabase ANTES de mergear el PR que
-- inserta en `user_feedback`. Cloudflare publica archivos estáticos, pero no
-- ejecuta este SQL.

create table if not exists public.user_feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  categoria  text not null check (categoria in ('sugerencia', 'problema', 'otro')),
  mensaje    text not null check (char_length(btrim(mensaje)) between 3 and 2000),
  created_at timestamptz not null default now()
);

alter table public.user_feedback enable row level security;

-- El cliente solo puede insertar. No puede listar comentarios propios ni
-- ajenos, editarlos o borrarlos. Lucas y Martín los revisan desde Supabase.
revoke all on public.user_feedback from public, anon, authenticated;
grant insert (user_id, categoria, mensaje) on public.user_feedback to authenticated;

drop policy if exists user_feedback_insert_own on public.user_feedback;
create policy user_feedback_insert_own
on public.user_feedback
for insert
to authenticated
with check ((select auth.uid()) = user_id);
