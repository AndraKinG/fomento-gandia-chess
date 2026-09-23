import { redirect } from "next/navigation";

/**
 * La pantalla se mudó a `/club/vinculaciones` (2026-09-23), al abrirla a la junta:
 * todo lo que cuelga de `/club/admin` lo cierra el layout a quien no es admin.
 *
 * ESTA RUTA SE QUEDA COMO REDIRECT y no se borra, porque hay AVISOS YA ENVIADOS que
 * apuntan aquí: cada solicitud de vinculación manda un push con esta dirección, y las
 * que estén sin abrir en la bandeja de alguien seguirían llevando a un 404. Es el mismo
 * trato que se le dio a `/club/torneos`.
 */
export default function VinculacionesEnAdmin() {
  redirect("/club/vinculaciones");
}
