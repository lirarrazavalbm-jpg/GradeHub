-- Declaración de edad al crear cuenta.
--
-- APLÍCALO UNA VEZ en el SQL Editor de Supabase ANTES de mergear el PR que
-- escribe esta columna. Cloudflare Pages no ejecuta SQL.
--
-- POR QUÉ 16. Los dos pisos que aplican son más bajos: COPPA pone la línea en
-- 13 para Estados Unidos y la Ley 21.719 chilena en 14. 16 los cubre a los dos
-- con holgura y calza con a quién está hecha la app: estudiantes de educación
-- superior. Es decisión de Martín, no un mínimo legal.
--
-- QUÉ GUARDA Y QUÉ NO. Solo la marca de tiempo de la declaración. NO se pide
-- ni se guarda fecha de nacimiento: para saber que alguien puede usar la app
-- basta con que lo declare, y pedir el dato exacto sería recolectar más de lo
-- necesario para el fin — justo lo contrario de lo que exige la ley.
--
-- CÓMO SE DECLARA. No hay casilla: el paso 1 del onboarding avisa junto al
-- botón que continuar es declararlo, y la fila se escribe al terminar. El
-- texto del aviso y esta columna tienen que decir la misma edad.
alter table public.profiles
  add column if not exists edad_declarada_en timestamptz;

comment on column public.profiles.edad_declarada_en is
  'Cuándo la persona declaró tener 16 años o más, al continuar desde el paso 1 del onboarding. Sin fecha de nacimiento: solo la declaración.';
