/**
 * ¿Puede un socio recuperar la contraseña él solo?
 *
 * HOY NO, Y ES UNA DECISIÓN, no un olvido (propietario, 2026-09-23: "de momento sin
 * recuperar contraseña, advertiremos"). Las pantallas están hechas y probadas —
 * `/recuperar` y `/nueva-contrasena`— pero el correo no puede llegar bien todavía:
 *
 * **Supabase no deja editar la plantilla del email sin un SMTP propio.** Con el
 * compartido de prueba, el correo SÍ se manda, pero con la plantilla de fábrica, que
 * pasa por el `/auth/v1/verify` de Supabase y devuelve al socio a la portada con la
 * sesión en el trozo de URL tras `#`. La app lee la sesión de las cookies, así que
 * llega como un visitante cualquiera y no puede cambiar nada. Comprobado en producción.
 *
 * ENCENDERLO ES CAMBIAR ESTA CONSTANTE, y por eso vive aquí sola: el día que haya SMTP
 * propio (guía en `docs/referencia/configurar-smtp-resend.md`) se pone a `true`, se pega
 * la plantilla que hay en esa guía, y vuelve a salir el enlace en el login. Nada más.
 *
 * POR QUÉ NO SE DEJÓ EL BOTÓN "POR SI ACASO": una pantalla que dice "el enlace ya está
 * de camino" y manda un enlace roto es peor que no tenerla. El socio espera, no le
 * llega nada que sirva, y acaba escribiendo igual — pero además pensando que la app
 * está rota. Mientras tanto se le dice la verdad y a quién acudir.
 *
 * MIENTRAS ESTÉ APAGADO, a un socio bloqueado se le desatasca desde fuera: la junta le
 * genera un enlace de un solo uso con la clave de servicio, sin pasar por el correo
 * (`auth.admin.generateLink`, tipo `recovery`). Está contado en la guía de SMTP.
 */
export const RECUPERACION_POR_EMAIL = false;
