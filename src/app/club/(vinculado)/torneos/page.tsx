import { redirect } from "next/navigation";

/**
 * Raíz de la sección Torneos: manda a los de fuera.
 *
 * EXISTE PARA NO ROMPER ENLACES YA ENVIADOS. Antes de partir la sección en dos, la
 * lista de torneos de la FACV vivía justo aquí, y hay notificaciones push ya
 * entregadas cuyo enlace apunta a `/club/torneos` (ver `torneos/facv/actions.ts`).
 * Sin este redirect, tocar esas notificaciones daría un 404 en el móvil de un socio.
 */
export default function TorneosPage() {
  redirect("/club/torneos/facv");
}
