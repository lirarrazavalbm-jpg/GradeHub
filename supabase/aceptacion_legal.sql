-- EJECUTAR UNA VEZ EN SUPABASE ANTES DE MERGEAR EL PR.
--
-- Guarda la fecha y versión que aceptan las cuentas nuevas. No toca filas
-- existentes: sus columnas quedan nulas y la app no las bloquea ni las migra.
-- Si este SQL no se aplica primero, el registro podría crear la cuenta en Auth
-- pero no dejar constancia de la aceptación en profiles.

alter table public.profiles
  add column if not exists terminos_aceptados_en timestamptz,
  add column if not exists terminos_version text;
