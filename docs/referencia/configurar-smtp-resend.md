# Configurar SMTP propio (Resend) para los emails de Supabase Auth

Por defecto, Supabase envía los emails de autenticación (confirmación de
registro, recuperación de contraseña, etc.) con un SMTP compartido de
prueba: límite muy bajo de envíos y **la plantilla NO se puede personalizar**
mientras se use ese SMTP. Para poder editar el email de confirmación en
español con la identidad del club, hace falta un proveedor SMTP propio.
Resend tiene un plan gratuito (100 emails/día, 3000/mes) más que suficiente
para un club.

Esto es un GATE DE USUARIO: requiere crear una cuenta y pegar una API key en
el Dashboard de Supabase, algo que Claude no puede (ni debe) hacer en tu
nombre. Sigue estos pasos tú mismo.

## 1. Crear cuenta en Resend

1. Ve a [resend.com](https://resend.com) → **Sign Up** (gratis, sin tarjeta).
2. Verifica tu email.
3. Elige una de estas dos opciones para el remitente:
   - **Rápida (recomendada para empezar)**: usa el dominio de pruebas de
     Resend, `onboarding@resend.dev`. No requiere verificar nada, pero los
     emails identifican a Resend como remitente técnico.
   - **Con dominio propio del club** (si el club tiene un dominio, p. ej.
     `fomentogandia.com`): en Resend, **Domains → Add Domain**, añade el
     dominio y crea en tu proveedor DNS los registros TXT/CNAME que Resend
     indique (SPF, DKIM). Verificación automática en unos minutos/horas.
     Remitente final: algo como `noreply@fomentogandia.com`.

## 2. Crear la API key

1. En Resend: **API Keys → Create API Key**.
2. Nombre orientativo: `supabase-smtp`. Permisos: **Sending access** basta.
3. Copia la key (empieza por `re_...`) — sólo se muestra una vez.

## 3. Configurar el SMTP en Supabase

1. Entra al [Dashboard de Supabase](https://supabase.com/dashboard) → proyecto
   del club → **Authentication → SMTP Settings** (si no lo ves ahí, búscalo en
   Project Settings → Authentication — Supabase reubica el menú a veces).
2. Activa **Enable Custom SMTP** y rellena:

   | Campo | Valor |
   |---|---|
   | Sender email | `noreply@<tu-dominio>` o `onboarding@resend.dev` (paso 1) |
   | Sender name | `Fomento de Gandia` |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | la API key del paso 2 (`re_...`) |

3. **Save**. Supabase envía un email de prueba al guardar; confirma que llega.

## 4. Personalizar la plantilla de confirmación en español

Con SMTP propio configurado, las plantillas de **Auth → Email Templates**
pasan a ser editables (con el SMTP compartido de prueba, Supabase las
bloquea). Ve a **Authentication → Email Templates → Confirm signup** y:

1. **Subject heading**: `Confirma tu cuenta — Fomento de Gandia`.
2. **Message body**: pega el HTML de la plantilla más abajo, tal cual.

No hace falta tocar nada más: Supabase sustituye automáticamente
`{{ .SiteURL }}` y `{{ .TokenHash }}` por los valores reales de cada envío,
y el enlace generado apunta a la ruta `/auth/confirm` de la app (ver
`src/app/auth/confirm/route.ts`), que ya espera exactamente `token_hash` y
`type` como parámetros de consulta.

### Plantilla "Confirm signup" (pegar tal cual en Message body)

```html
<div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; background-color: #ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #0b3d91; padding: 24px; border-radius: 8px 8px 0 0;">
    <tr>
      <td style="text-align: center;">
        <span style="color: #ffffff; font-size: 20px; font-weight: bold; letter-spacing: 0.5px;">
          ♟ Fomento de Gandia
        </span>
      </td>
    </tr>
  </table>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px; padding: 32px 24px;">
    <tr>
      <td>
        <h1 style="color: #0b3d91; font-size: 18px; margin: 0 0 16px 0;">
          Confirma tu cuenta
        </h1>
        <p style="color: #1a1a1a; font-size: 15px; line-height: 1.5; margin: 0 0 24px 0;">
          Hola, gracias por registrarte en la app del Club de Ajedrez
          Fomento de Gandia. Para activar tu cuenta, confirma tu email
          pulsando el siguiente botón:
        </p>

        <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto 24px auto;">
          <tr>
            <td style="border-radius: 6px; background-color: #0b3d91;">
              <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email"
                 style="display: inline-block; padding: 12px 28px; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: bold; border-radius: 6px;">
                Confirmar mi cuenta
              </a>
            </td>
          </tr>
        </table>

        <p style="color: #4a5568; font-size: 13px; line-height: 1.5; margin: 0 0 8px 0;">
          Si el botón no funciona, copia y pega este enlace en tu navegador:
        </p>
        <p style="word-break: break-all; font-size: 12px;">
          <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email" style="color: #0b3d91;">
            {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
          </a>
        </p>

        <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
          Si no has solicitado esta cuenta, puedes ignorar este email.
        </p>
      </td>
    </tr>
  </table>
</div>
```

### Texto alternativo (fallback sin HTML, opcional)

Si el cliente de correo del destinatario no renderiza HTML, este es el texto
plano equivalente (algunos gestores de plantillas de Supabase permiten un
campo de texto alternativo; si no lo hay, no hace falta añadir nada más, la
mayoría de clientes de correo sí renderizan el HTML anterior):

```
Fomento de Gandia — Confirma tu cuenta

Gracias por registrarte en la app del Club de Ajedrez Fomento de Gandia.
Para activar tu cuenta, abre este enlace:

{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email

Si no has solicitado esta cuenta, puedes ignorar este email.
```

## 5. Verificación

1. Da de alta un usuario de prueba desde `/registro`.
2. Comprueba que el email llega con el asunto y diseño anteriores.
3. Pulsa "Confirmar mi cuenta" y verifica que redirige a la app ya con la
   sesión iniciada (la ruta `/auth/confirm` llama a `verifyOtp` y redirige a
   `/`).
