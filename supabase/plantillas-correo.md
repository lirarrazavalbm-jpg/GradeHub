# Plantillas de correo de Supabase

**PÉGALAS A MANO** en Supabase → Authentication → Emails → Templates. No se
despliegan: viven en el panel, igual que los archivos `.sql` de esta carpeta se
aplican a mano en el SQL Editor. Esta copia existe para que se puedan revisar en
un PR y para no reescribirlas desde cero cuando alguien las cambie sin avisar.

Las que trae Supabase por defecto están **en inglés**. La app está entera en
español y el primer correo que recibe alguien que perdió el acceso a sus notas
le llegaba en otro idioma: "Reset your password. We received a request…".

## Por qué son de texto y sin diseño

Nada de tablas, imágenes ni CSS de campaña. Tres razones, en orden de peso:

1. **Entregabilidad.** Un correo liviano y con más texto que marcado pasa mejor
   los filtros, y este dominio recién está construyendo reputación. Es el mismo
   problema que motivó el issue #150.
2. Son correos de una sola acción. Un botón grande de marketing no ayuda a
   alguien que quiere entrar a ver sus notas.
3. Lo que se ve en Gmail, en Outlook y en el correo del teléfono es lo mismo.

## Variables

`{{ .ConfirmationURL }}` es el enlace de acción. `{{ .Email }}` y
`{{ .NewEmail }}` sirven en el cambio de correo. No inventes otras: si la
variable no existe, Supabase manda el texto crudo con las llaves incluidas.

---

## 1. Recuperar contraseña · `Reset Password`

**En uso hoy.** Es el único camino de vuelta para alguien que perdió el acceso.

**Asunto:** `Recupera tu contraseña de GradeHub`

```html
<h2>Recupera tu contraseña</h2>

<p>Pediste cambiar tu contraseña de GradeHub. Aprieta el enlace y elige una nueva.</p>

<p><a href="{{ .ConfirmationURL }}">Cambiar mi contraseña</a></p>

<p>El enlace sirve una sola vez y por un rato. Si se te vence, pide otro desde la app.</p>

<p>Si no fuiste tú, puedes ignorar este correo: tu cuenta sigue igual y nadie entró.</p>
```

La última línea dice explícitamente que no pasó nada. La original decía solo
"puedes ignorarlo", que a alguien nervioso no le responde lo que está
preguntando.

---

## 2. Confirmar el registro · `Confirm signup`

**Todavía no se usa**, y activarla es una decisión aparte: hoy la confirmación
está apagada y el aviso del registro en `app.js` dice "Ya puedes entrar con ese
correo y tu contraseña" justamente porque no se manda nada. Si se activa esto,
ese texto hay que reescribirlo el mismo día.

**Asunto:** `Confirma tu correo en GradeHub`

```html
<h2>Confirma tu correo</h2>

<p>Creaste una cuenta en GradeHub con este correo. Apriétalo para confirmarlo y entrar.</p>

<p><a href="{{ .ConfirmationURL }}">Confirmar mi correo</a></p>

<p>Confirmarlo es lo que te deja recuperar la cuenta si alguna vez pierdes la contraseña.</p>

<p>Si no creaste ninguna cuenta, ignora este correo.</p>
```

---

## 3. Cambiar el correo · `Change Email Address`

**Todavía no se usa.** Está en la cola: hoy quien se equivocó al escribir su
correo queda encerrado con sus notas adentro.

**Asunto:** `Confirma tu correo nuevo en GradeHub`

```html
<h2>Confirma tu correo nuevo</h2>

<p>Pediste cambiar el correo de tu cuenta de GradeHub de {{ .Email }} a {{ .NewEmail }}.</p>

<p><a href="{{ .ConfirmationURL }}">Confirmar el cambio</a></p>

<p>Hasta que aprietes ese enlace sigues entrando con el correo de siempre. Tus notas no se mueven.</p>

<p>Si no pediste el cambio, ignora este correo y avísanos a hola@gradehub.cl.</p>
```

---

## Las que no se usan

`Magic Link`, `Invite user` y `Reauthentication` quedan como vienen. No hay
ningún camino en la app que las dispare, y traducir algo que nadie recibe es
mantener texto muerto.
