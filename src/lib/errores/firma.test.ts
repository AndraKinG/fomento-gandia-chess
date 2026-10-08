import { describe, expect, it } from "vitest";
import {
  MAX_DETALLE,
  MAX_MENSAJE,
  esRuido,
  mensajeParaFirma,
  navegadorResumido,
  normalizarRuta,
  prepararError,
  rutaDeNext,
  tacharDatos,
} from "./firma";

const UUID = "3f2a9c1e-8b4d-4e6f-9a1b-2c3d4e5f6a7b";

describe("normalizarRuta", () => {
  it("cambia ids numéricos y UUID por [id]", () => {
    expect(normalizarRuta("/club/partidas/8812")).toBe("/club/partidas/[id]");
    expect(normalizarRuta(`/club/socios/${UUID}`)).toBe("/club/socios/[id]");
  });

  it("dos UUID seguidos en la misma ruta se cambian los dos", () => {
    expect(normalizarRuta(`/a/${UUID}/b/${UUID}`)).toBe("/a/[id]/b/[id]");
  });

  it("quita la consulta y el ancla, que pueden llevar datos", () => {
    expect(normalizarRuta("/club/partidas?q=juan#arriba")).toBe("/club/partidas");
  });

  it("de una dirección entera se queda con el camino", () => {
    expect(normalizarRuta("https://ejemplo.app/club/jugar?x=1")).toBe("/club/jugar");
  });

  it("deja tal cual el patrón que ya da Next", () => {
    expect(normalizarRuta("/club/partidas/[id]")).toBe("/club/partidas/[id]");
  });

  it("vacía, es la raíz", () => {
    expect(normalizarRuta("?a=1")).toBe("/");
  });
});

describe("rutaDeNext", () => {
  it("quita /app, los grupos y el page final", () => {
    expect(rutaDeNext("/app/club/(vinculado)/partidas/[id]/page")).toBe("/club/partidas/[id]");
  });

  it("la raíz y las rutas de API", () => {
    expect(rutaDeNext("/app/page")).toBe("/");
    expect(rutaDeNext("/app/api/errores/route")).toBe("/api/errores");
  });

  it("si ya viene limpia, no la toca", () => {
    expect(rutaDeNext("/club/jugar")).toBe("/club/jugar");
  });
});

describe("tacharDatos", () => {
  it("tacha los correos", () => {
    expect(tacharDatos("Falla para socio@ejemplo.com hoy")).toBe("Falla para [correo] hoy");
  });
});

describe("mensajeParaFirma", () => {
  it("dos mensajes que solo cambian en el número dan la misma firma", () => {
    expect(mensajeParaFirma("Partida 8812 no encontrada")).toBe(
      mensajeParaFirma("Partida 9034 no encontrada")
    );
  });

  it("los números dentro de un nombre no se tocan", () => {
    expect(mensajeParaFirma("reading 'p256dh'")).toBe("reading 'p256dh'");
  });

  it("y en el UUID, también", () => {
    expect(mensajeParaFirma(`Ficha ${UUID} rota`)).toBe(
      mensajeParaFirma("Ficha 00000000-0000-4000-8000-000000000000 rota")
    );
  });
});

describe("esRuido", () => {
  it.each([
    "ResizeObserver loop completed with undelivered notifications.",
    "Script error.",
    "NEXT_REDIRECT",
    "Failed to fetch",
    "TypeError: Failed to fetch",
    "Load failed",
  ])("descarta %s", (mensaje) => {
    expect(esRuido(mensaje)).toBe(true);
  });

  it("descarta lo que viene de una extensión del navegador", () => {
    expect(esRuido("x is undefined", "at f (chrome-extension://abc/content.js:1:1)")).toBe(true);
  });

  it("un fallo de verdad no es ruido", () => {
    expect(esRuido("Cannot read properties of undefined (reading 'nombre')")).toBe(false);
  });

  it("un fetch que falla DENTRO de un mensaje más largo no se descarta", () => {
    expect(esRuido("No se pudo leer la FACV: Failed to fetch")).toBe(false);
  });
});

describe("navegadorResumido", () => {
  it("Chrome en Android", () => {
    expect(
      navegadorResumido(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36"
      )
    ).toBe("Chrome · Android");
  });

  it("Safari en iPhone", () => {
    expect(
      navegadorResumido(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
      )
    ).toBe("Safari · iOS");
  });

  it("Edge dice Chrome, pero es Edge", () => {
    expect(
      navegadorResumido(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0"
      )
    ).toBe("Edge · Windows");
  });

  it("sin cabecera, nada", () => {
    expect(navegadorResumido(null)).toBeNull();
  });
});

describe("prepararError", () => {
  it("agrupa por origen, ruta y mensaje normalizados", () => {
    const a = prepararError({
      origen: "navegador",
      mensaje: "Partida 12 rota",
      ruta: "/club/partidas/12?x=1",
    });
    const b = prepararError({
      origen: "navegador",
      mensaje: "Partida 99 rota",
      ruta: "/club/partidas/99",
    });
    expect(a?.firma).toBe(b?.firma);
    expect(a?.firma).toBe("navegador|/club/partidas/[id]|Partida <n> rota");
    // Lo que se guarda para leer es el mensaje real, no el de la firma.
    expect(a?.mensaje).toBe("Partida 12 rota");
  });

  it("el mismo fallo en el servidor y en el navegador son dos filas", () => {
    const base = { mensaje: "boom", ruta: "/club" };
    expect(prepararError({ ...base, origen: "servidor" })?.firma).not.toBe(
      prepararError({ ...base, origen: "navegador" })?.firma
    );
  });

  it("sin mensaje, o con ruido, no se guarda", () => {
    expect(prepararError({ origen: "navegador", mensaje: "  ", ruta: "/" })).toBeNull();
    expect(prepararError({ origen: "navegador", mensaje: "Script error.", ruta: "/" })).toBeNull();
  });

  it("corta lo largo y tacha correos también en la pila", () => {
    const e = prepararError({
      origen: "navegador",
      mensaje: "x".repeat(MAX_MENSAJE * 2),
      ruta: "/",
      detalle: "Error\n at a@b.com\n" + "y".repeat(MAX_DETALLE * 2),
    });
    expect(e?.mensaje.length).toBe(MAX_MENSAJE);
    expect(e?.detalle?.length).toBeLessThanOrEqual(MAX_DETALLE);
    expect(e?.detalle).toContain("[correo]");
    expect(e?.detalle).not.toContain("a@b.com");
  });

  it("quita el ?... de las direcciones de la pila", () => {
    const e = prepararError({
      origen: "navegador",
      mensaje: "boom",
      ruta: "/",
      detalle: "at f (https://app/_next/static/chunks/a.js?dpl=dpl_123:1:200)",
    });
    expect(e?.detalle).toBe("at f (https://app/_next/static/chunks/a.js:1:200)");
  });

  it("guarda el navegador resumido, no la cabecera entera", () => {
    const e = prepararError({
      origen: "navegador",
      mensaje: "boom",
      ruta: "/",
      userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0",
    });
    expect(e?.navegador).toBe("Firefox · Linux");
  });
});
