import { createAdminClient } from "@/lib/supabase/admin";
import { avisar } from "@/lib/avisos/enviar";
import { prepararError, type ErrorEntrante } from "@/lib/errores/firma";

/**
 * Guarda un error (o suma uno a los que ya había) y, si es NUEVO, avisa a los admins.
 * Solo servidor: escribe con la clave de servicio. Nunca lanza.
 *
 * REGLA DURA: GUARDAR UN ERROR NO PUEDE ROMPER NADA MÁS. Esto se llama justo cuando algo
 * ya ha fallado; si además fallara esto, o tardara, el socio vería una pantalla de error
 * más lenta o un segundo error encima del primero. Por eso:
 * - todo va en `try/catch` silencioso;
 * - hay un tiempo máximo (`ESPERA_MAXIMA`): si Supabase no contesta, se abandona.
 *
 * EL AVISO, SOLO LA PRIMERA VEZ (`registrar_error` dice si es 'nuevo' o si 'reaparece'
 * tras marcarlo resuelto), y con un tope por hora: si se cae Supabase entero, cada
 * pantalla fallaría con su propio mensaje y serían decenas de fallos "nuevos" a la vez.
 * Con `MAX_AVISOS_HORA` llegan unos pocos — que ya dicen lo que hay que saber — y el
 * resto se ve en la lista.
 */

const ESPERA_MAXIMA = 2000;
const MAX_AVISOS_HORA = 5;

type Resultado = "nuevo" | "reaparece" | "repetido" | "descartado" | "ruido" | "fallo";

export async function registrarError(e: ErrorEntrante): Promise<Resultado> {
  const preparado = prepararError(e);
  if (!preparado) return "ruido";
  try {
    return await conTiempoMaximo(async () => {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc("registrar_error", {
        p_firma: preparado.firma,
        p_origen: preparado.origen,
        p_mensaje: preparado.mensaje,
        p_ruta: preparado.ruta,
        p_detalle: preparado.detalle,
        p_digest: preparado.digest,
        p_navegador: preparado.navegador,
      });
      if (error) {
        // A los registros de Vercel, que es lo único que queda si esto falla. Sin el
        // error original entero: puede llevar datos que aquí no se han tachado.
        console.error("[errores] no se pudo guardar", error.message);
        return "fallo";
      }
      const resultado = data as Resultado;
      if (resultado === "nuevo" || resultado === "reaparece") {
        await avisarAdmins(preparado.mensaje, preparado.ruta, resultado === "reaparece");
      }
      return resultado;
    });
  } catch {
    return "fallo";
  }
}

async function conTiempoMaximo<T>(tarea: () => Promise<T>): Promise<T> {
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rechazar) => {
    reloj = setTimeout(() => rechazar(new Error("tiempo agotado")), ESPERA_MAXIMA);
  });
  try {
    return await Promise.race([tarea(), limite]);
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * Solo admins, no la junta: un fallo de la app lo arregla quien toca el código, y a la
 * junta le llegaría un aviso que no puede hacer nada con él.
 */
async function avisarAdmins(mensaje: string, ruta: string, reaparece: boolean) {
  const admin = createAdminClient();
  const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const [{ count }, { data: porRol }, { data: porColumna }] = await Promise.all([
    admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("tipo", "error_nuevo")
      .gte("creado_en", haceUnaHora),
    admin.from("member_roles").select("profile_id").eq("rol", "admin"),
    // La columna antigua sigue otorgando admin, igual que en `is_admin()`.
    admin.from("profiles").select("id").eq("is_admin", true),
  ]);
  const ids = [
    ...new Set([
      ...(porRol ?? []).map((r) => r.profile_id as string),
      ...(porColumna ?? []).map((p) => p.id as string),
    ]),
  ];
  if (ids.length === 0) return;
  // `count` cuenta filas, y hay una por admin: el tope es de avisos, no de filas.
  if ((count ?? 0) >= MAX_AVISOS_HORA * ids.length) return;

  await avisar(ids, {
    tipo: "error_nuevo",
    titulo: reaparece ? "Ha vuelto un error que estaba resuelto" : "Error nuevo en la app",
    cuerpo: `${ruta}: ${mensaje.slice(0, 120)}`,
    url: "/club/admin/errores",
  });
}
