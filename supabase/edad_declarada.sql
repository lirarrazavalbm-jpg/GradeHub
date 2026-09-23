-- Declaración de edad al crear cuenta.
--
-- APLÍCALO UNA VEZ en el SQL Editor de Supabase ANTES de mergear el PR que
-- escribe esta columna. Cloudflare Pages no ejecuta SQL.
--
-- POR QUÉ 14 Y NO 13. La referencia que se suele citar es COPPA, que en
-- Estados Unidos pone la línea en 13. GradeHub es chileno y la Ley 21.719 la
-- pone en 14: bajo esa edad el tratamiento de datos necesita autorización de
-- quien tenga el cuidado personal. 14 cumple las dos.
--
-- QUÉ GUARDA Y QUÉ NO. Solo la marca de tiempo de la declaración. NO se pide
-- ni se guarda fecha de nacimiento: para saber que alguien puede usar la app
-- basta con que lo declare, y pedir el dato exacto sería recolectar más de lo
-- necesario para el fin — justo lo contrario de lo que exige la ley.
alter table public.profiles
  add column if not exists edad_declarada_en timestamptz;

comment on column public.profiles.edad_declarada_en is
  'Cuándo la persona declaró tener 14 años o más. Sin fecha de nacimiento: solo la declaración.';
