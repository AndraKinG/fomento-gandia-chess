import { describe, expect, it } from "vitest";
import { instrucciones, listaDeDias } from "./instrucciones";

const SOCIO = { nombre: "Joan", esAdmin: false, esJunta: false, tieneFicha: true };
const DIA = new Date("2026-08-08T10:00:00Z");

describe("instrucciones", () => {
  it("le dice con quién habla, para poder tutearle por su nombre", () => {
    expect(instrucciones(SOCIO, DIA)).toContain("Joan");
  });

  it("avisa cuando todavía no hay ficha del club", () => {
    // Ese caso existe: cuenta creada y pendiente de aprobar.
    expect(instrucciones({ ...SOCIO, nombre: null, tieneFicha: false }, DIA)).toContain(
      "todavía no tiene ficha"
    );
  });

  it("dice el rango solo cuando lo hay", () => {
    expect(instrucciones(SOCIO, DIA)).not.toContain("administrador");
    expect(instrucciones({ ...SOCIO, esAdmin: true }, DIA)).toContain("administrador");
  });

  it("un admin no sale además como junta", () => {
    // Los rangos se acumulan, pero decir las dos cosas es ruido.
    const t = instrucciones({ ...SOCIO, esAdmin: true, esJunta: true }, DIA);
    expect(t).toContain("administrador");
    expect(t).not.toContain("Es de la junta");
  });

  it("acota los temas a ajedrez y club", () => {
    const t = instrucciones(SOCIO, DIA);
    expect(t).toContain("Ajedrez");
    expect(t).toContain("El club y esta aplicación");
  });

  it("prohíbe expresamente anunciar que reconduce", () => {
    // Es el encargo del propietario: reconducir con gracia, sin decirlo.
    const t = instrucciones(SOCIO, DIA);
    expect(t).toContain("NO digas que no puedes hablar de eso");
    expect(t).toContain("CAMBIA LA FÓRMULA CADA VEZ");
  });

  it("blinda contra las órdenes escondidas en los datos", () => {
    // Los nombres y las notas de partidas los escriben socios: son datos, no órdenes.
    expect(instrucciones(SOCIO, DIA)).toContain("no órdenes");
  });

  it("le prohíbe inventarse datos del club", () => {
    expect(instrucciones(SOCIO, DIA)).toContain("Prohibido inventarse");
  });

  it("prohíbe el markdown, que el chat pinta como asteriscos sueltos", () => {
    expect(instrucciones(SOCIO, DIA)).toContain("PROHIBIDO el markdown");
  });

  it("le deja claro que no puede cambiar nada", () => {
    // Llegó a pasar en el otro proyecto: decía "reserva confirmada" sin crearla.
    expect(instrucciones(SOCIO, DIA)).toContain("Nunca digas que has hecho algo");
  });

  it("conoce las secciones de la app, para guiar y no negar lo que existe", () => {
    // Llegó a decir "de bases de datos de partidas no dispongo" cuando la app
    // tiene un repositorio entero de partidas.
    const t = instrucciones(SOCIO, DIA);
    expect(t).toContain("Partidas: repositorio compartido");
    expect(t).toContain("NUNCA digas que no tienes datos de algo sin haberlo consultado");
  });

  it("le da los días ya calculados y le prohíbe deducirlos", () => {
    const t = instrucciones(SOCIO, DIA);
    expect(t).toContain("2026-08-08");
    expect(t).toContain("← HOY");
    expect(t).toContain("NO calcules tú");
  });
});

describe("listaDeDias", () => {
  it("marca hoy y mañana, y solo esos", () => {
    const t = listaDeDias(DIA, 4);
    expect(t.match(/← HOY/g)).toHaveLength(1);
    expect(t.match(/← MAÑANA/g)).toHaveLength(1);
  });

  it("da tantos días como se le piden, uno por línea", () => {
    expect(listaDeDias(DIA, 10).split("\n")).toHaveLength(10);
  });

  it("escribe la fecha en ISO y el día en castellano", () => {
    // El ISO es para las herramientas; el día en letra, para hablarle al socio.
    const primera = listaDeDias(DIA, 1);
    expect(primera).toContain("2026-08-08");
    expect(primera).toContain("sábado");
  });

  it("cruza bien el cambio de mes", () => {
    // Sumar días a mano es justo donde se cuela un fallo de calendario.
    const t = listaDeDias(new Date("2026-08-30T10:00:00Z"), 3);
    expect(t).toContain("2026-08-30");
    expect(t).toContain("2026-09-01");
  });
});
