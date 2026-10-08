import { describe, expect, it } from "vitest";
import { leerAvisoCsp, nuevoNonce, politicaScripts } from "./csp";

const PROPIO = "https://fomento-gandia-chess-swart.vercel.app";

describe("politicaScripts", () => {
  it("lleva el nonce, strict-dynamic, wasm y el aviso", () => {
    const p = politicaScripts("abc123");
    expect(p).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic' 'wasm-unsafe-eval'");
    expect(p).toContain("worker-src 'self'");
    expect(p).toContain("report-uri /api/csp");
    expect(p).not.toContain(" 'unsafe-eval'");
  });

  it("solo en desarrollo deja eval, que React usa para las pilas de error", () => {
    expect(politicaScripts("x", true)).toContain(" 'unsafe-eval'");
  });

  it("nunca deja scripts en línea sin nonce", () => {
    expect(politicaScripts("x")).not.toContain("unsafe-inline");
  });
});

describe("nuevoNonce", () => {
  it("cambia en cada llamada y es base64", () => {
    const a = nuevoNonce();
    expect(a).not.toBe(nuevoNonce());
    expect(a).toMatch(/^[A-Za-z0-9+/=]{40,}$/);
  });
});

describe("leerAvisoCsp", () => {
  it("formato clásico (report-uri), script en línea", () => {
    expect(
      leerAvisoCsp(
        {
          "csp-report": {
            "document-uri": `${PROPIO}/club/partidas/12?q=x`,
            "effective-directive": "script-src-elem",
            "blocked-uri": "inline",
            "source-file": `${PROPIO}/club/partidas/12?q=x`,
            "line-number": 3,
            "script-sample": "try{const t=localStorage.tema",
          },
        },
        PROPIO
      )
    ).toEqual([
      {
        mensaje: "CSP: bloquearía script-src-elem · inline",
        ruta: "/club/partidas/12",
        detalle: `${PROPIO}/club/partidas/12:3\n«try{const t=localStorage.tema»`,
      },
    ]);
  });

  it("formato nuevo (Reporting API), script de otro dominio: solo el host", () => {
    const [a] = leerAvisoCsp(
      [
        {
          type: "csp-violation",
          body: {
            documentURL: `${PROPIO}/`,
            effectiveDirective: "script-src-elem",
            blockedURL: "https://malo.example/x.js?token=secreto",
          },
        },
      ],
      PROPIO
    );
    expect(a.mensaje).toBe("CSP: bloquearía script-src-elem · malo.example");
    expect(a.mensaje).not.toContain("secreto");
  });

  it("si no trae effective-directive usa la primera palabra de violated-directive", () => {
    const [a] = leerAvisoCsp(
      { "csp-report": { "document-uri": `${PROPIO}/`, "violated-directive": "script-src 'self'", "blocked-uri": "eval" } },
      PROPIO
    );
    expect(a.mensaje).toBe("CSP: bloquearía script-src · eval");
  });

  it("descarta los avisos de páginas de otra web", () => {
    expect(
      leerAvisoCsp({ "csp-report": { "document-uri": "https://otra.example/", "blocked-uri": "inline" } }, PROPIO)
    ).toEqual([]);
  });

  it("descarta lo que no es un aviso de CSP", () => {
    expect(leerAvisoCsp({}, PROPIO)).toEqual([]);
    expect(leerAvisoCsp(null, PROPIO)).toEqual([]);
    expect(leerAvisoCsp([{ type: "deprecation", body: {} }], PROPIO)).toEqual([]);
  });

  it("deja la marca de extensión en el mensaje para que el filtro de ruido la quite", () => {
    const [a] = leerAvisoCsp(
      { "csp-report": { "document-uri": `${PROPIO}/`, "blocked-uri": "chrome-extension://abcdef/inyecta.js" } },
      PROPIO
    );
    expect(a.mensaje).toContain("chrome-extension://");
  });

  it("como mucho 10 por petición", () => {
    const uno = { type: "csp-violation", body: { documentURL: `${PROPIO}/`, blockedURL: "inline" } };
    expect(leerAvisoCsp(Array(50).fill(uno), PROPIO)).toHaveLength(10);
  });
});
