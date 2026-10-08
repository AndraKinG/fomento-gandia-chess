import type { Instrumentation } from "next";
import { rutaDeNext } from "@/lib/errores/firma";

/**
 * Los errores del SERVIDOR (pantallas, acciones, rutas de API, proxy), a la tabla
 * `errores` (0052). Es el gancho oficial de Next para esto (`onRequestError`, ver
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md`).
 *
 * Los del NAVEGADOR van por otro camino: `/api/errores` (ver `CapturarErrores`).
 *
 * SOLO EN NODE: guardar el error puede acabar mandando un push (`avisar`), y la librería
 * de push no funciona en el runtime "edge". La app no tiene nada en edge hoy, pero si
 * algún día lo tuviera, aquí no rompería: simplemente no se guardaría. De ahí también el
 * `import()` dentro de la función y no arriba — así el edge ni lo carga.
 *
 * SE ESPERA AL GUARDADO (`await`), porque la documentación lo pide: en Vercel la función
 * se congela en cuanto responde, y una escritura sin esperar se pierde. No retrasa más
 * de 2 s (`registrar.ts`), y solo cuando algo ya ha fallado.
 *
 * DE LA PETICIÓN SOLO SE COGE LA RUTA (y el navegador, resumido). Ni cabeceras, ni
 * cookies, ni el `?...` de la dirección.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { registrarError } = await import("@/lib/errores/registrar");
    const e = error as Partial<Error> & { digest?: unknown };
    const userAgent = request.headers["user-agent"];
    await registrarError({
      origen: "servidor",
      mensaje: typeof e?.message === "string" ? e.message : String(error),
      ruta: context.routePath ? rutaDeNext(context.routePath) : request.path,
      detalle: typeof e?.stack === "string" ? e.stack : null,
      digest: typeof e?.digest === "string" ? e.digest : null,
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    });
  } catch {
    // Nunca: ver `registrar.ts`.
  }
};
