import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { nombreDePila } from "@/lib/auth/nombre";
import { instrucciones } from "@/lib/asistente/instrucciones";
import { ejecutar } from "@/lib/asistente/herramientas";
import { responder, SinClave } from "@/lib/asistente/gemini";
import { acabaEnPregunta, leerHistorial } from "@/lib/asistente/peticion";

/**
 * El asistente del club.
 *
 * ESTÁ EN EL SERVIDOR POR LA CLAVE. `GEMINI_API_KEY` no puede pisar el navegador:
 * con ella cualquiera gastaría la cuota del club, así que la conversación entera
 * pasa por aquí y el cliente solo manda texto.
 *
 * EXIGE SESIÓN, y las consultas a la base van con el cliente de ESA sesión, así que
 * el asistente ve exactamente lo mismo que vería el socio entrando él. Sin eso, un
 * asistente con clave de servicio sería una puerta trasera a toda la base.
 */

export async function POST(request: Request) {
  const sesion = await sesionActual();
  if (!sesion) {
    return NextResponse.json({ error: "Hace falta iniciar sesión." }, { status: 401 });
  }

  let cuerpo: { historial?: unknown };
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Petición mal formada." }, { status: 400 });
  }

  const historial = leerHistorial(cuerpo.historial);
  if (!historial) {
    return NextResponse.json({ error: "Petición mal formada." }, { status: 400 });
  }
  if (!acabaEnPregunta(historial)) {
    return NextResponse.json({ error: "No hay ninguna pregunta." }, { status: 400 });
  }

  const supabase = await createServerSupabase();

  try {
    const texto = await responder({
      instrucciones: instrucciones(
        {
          nombre: sesion.nombre ? nombreDePila(sesion.nombre) : null,
          esAdmin: sesion.esAdmin,
          esJunta: sesion.esJunta,
          tieneFicha: sesion.playerId != null,
        },
        new Date()
      ),
      historial,
      ejecutor: (nombre, args) => ejecutar(nombre, args, supabase, sesion.playerId),
    });

    if (!texto) {
      return NextResponse.json(
        { error: "No he sabido qué contestar. Prueba a preguntármelo de otra forma." },
        { status: 502 }
      );
    }
    return NextResponse.json({ texto });
  } catch (e) {
    if (e instanceof SinClave) {
      return NextResponse.json(
        { error: "El asistente todavía no está configurado. Falta la clave de la IA." },
        { status: 503 }
      );
    }
    // El detalle del error se queda en el registro del servidor: puede traer trozos
    // de la petición, y eso no se le enseña a nadie.
    console.error("[asistente]", e);
    return NextResponse.json(
      { error: "El asistente no está disponible ahora mismo." },
      { status: 502 }
    );
  }
}
