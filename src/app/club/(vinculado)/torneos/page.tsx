import { redirect } from "next/navigation";

/**
 * Raíz de la sección Torneos: manda a los de fuera.
 *
 * EXISTE SOLO PARA NO ROMPER ENLACES YA ENVIADOS. Antes de partir la sección en dos,
 * la lista de torneos de la FACV vivía justo aquí, y hay notificaciones push ya
 * entregadas cuyo enlace apunta a `/club/torneos` (ver `torneos/facv/actions.ts`).
 * Sin este redirect, tocar esas notificaciones daría un 404 en el móvil de un socio.
 *
 * NADIE DE LA APP DEBE ENLAZAR AQUÍ: la barra de navegación apunta directa a
 * `/club/torneos/facv` porque pasar por el redirect se ve — esqueleto de carga, salto,
 * y esqueleto otra vez.
 */
export default function TorneosPage() {
  redirect("/club/torneos/facv");
}
