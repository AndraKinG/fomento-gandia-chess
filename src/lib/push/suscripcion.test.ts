import { describe, expect, it } from "vitest";
import { leerSuscripcion } from "./suscripcion";

const BUENA = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  expirationTime: null,
  keys: { p256dh: "BNcRdreALRFX", auth: "tBHItJI5svbpez7KI4CCXg" },
};

describe("leerSuscripcion", () => {
  it("lee la que manda el navegador", () => {
    expect(leerSuscripcion(BUENA)).toEqual({
      ok: true,
      suscripcion: {
        endpoint: BUENA.endpoint,
        p256dh: "BNcRdreALRFX",
        auth: "tBHItJI5svbpez7KI4CCXg",
      },
    });
  });

  it.each([
    ["vacío", {}],
    ["null", null],
    ["un texto", "hola"],
    ["sin keys", { endpoint: BUENA.endpoint }],
    ["keys sin auth", { endpoint: BUENA.endpoint, keys: { p256dh: "x" } }],
    ["clave que no es texto", { endpoint: BUENA.endpoint, keys: { p256dh: 1, auth: "x" } }],
    ["clave vacía", { endpoint: BUENA.endpoint, keys: { p256dh: "", auth: "x" } }],
    ["endpoint enorme", { ...BUENA, endpoint: "https://fcm.googleapis.com/" + "a".repeat(2000) }],
  ])("forma mala: %s", (_, cuerpo) => {
    expect(leerSuscripcion(cuerpo)).toEqual({ ok: false, motivo: "forma" });
  });

  it.each([
    ["otro sitio", "https://example.com/push"],
    ["sin https", "http://fcm.googleapis.com/x"],
    ["red interna", "https://169.254.169.254/latest"],
  ])("servicio no reconocido: %s", (_, endpoint) => {
    expect(leerSuscripcion({ ...BUENA, endpoint })).toEqual({
      ok: false,
      motivo: "servicio",
      endpoint,
    });
  });
});
