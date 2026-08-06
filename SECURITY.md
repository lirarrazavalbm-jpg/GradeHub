# Reportar un problema de seguridad

Si encontraste algo, escríbenos a **gradehub.app@gmail.com** con el asunto
`[seguridad]`. Respondemos dentro de 72 horas.

**No abras un issue público** para vulnerabilidades: GradeHub guarda las notas
de estudiantes reales, y un issue le da a cualquiera la receta antes de que
podamos arreglarla.

Cuéntanos qué encontraste, cómo reproducirlo y qué se podría hacer con eso. Si
quieres que te demos crédito cuando lo publiquemos, dinos cómo prefieres que te
nombremos.

## Qué nos importa

- Acceso a datos de otro usuario (notas, correo, perfil).
- Cualquier forma de saltarse las políticas de acceso de la base de datos.
- Ejecución de código en el navegador de otro usuario a través de la app.
- Tomar control de una cuenta ajena.

## Qué no es una vulnerabilidad

- **La clave `sb_publishable_*` en el código.** Es pública por diseño. Todo el
  acceso está restringido a nivel de base de datos: cada cuenta solo alcanza sus
  propias filas, y quien no inició sesión no alcanza ninguna.
- **Que el código sea legible.** GradeHub corre entero en el navegador. Que se
  pueda leer no es un descuido, es cómo funciona.
- Faltas de cabeceras que no tengan un impacto concreto que puedas demostrar.

## Alcance

Solo `gradehub.cl` y este repositorio. No pruebes contra Supabase o Cloudflare
directamente — son proveedores nuestros y tienen sus propios canales.

Por favor no hagas pruebas de carga ni de denegación de servicio, y no toques
datos de cuentas que no sean tuyas. Si necesitas una cuenta para probar, créate
una.
