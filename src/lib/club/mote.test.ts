import { describe, expect, it } from "vitest";
import { claveMote, moteOcupado, textoOcupado, validarMote } from "./mote";

/** Un carácter de control, construido y no escrito: escribirlo dentro del fuente deja
 *  un byte invisible en el fichero, que es exactamente el problema que se prueba. */
const NULO = String.fromCharCode(0);
const SALTO = String.fromCharCode(10);

describe("validarMote", () => {
  it("un mote normal vale y sale limpio", () => {
    expect(validarMote("  Ximo  ")).toEqual({ ok: true, valor: "Ximo" });
    expect(validarMote("El  Profe")).toEqual({ ok: true, valor: "El Profe" });
  });

  it("vacío NO es un error: es quitarse el mote", () => {
    // Quien llama decide qué hacer con la cadena vacía (la junta borra el mote, el
    // socio retira su solicitud). Devolverlo como error obligaría a los dos sitios a
    // tratar "quitar" como un caso especial antes de validar.
    expect(validarMote("")).toEqual({ ok: true, valor: "" });
    expect(validarMote("   ")).toEqual({ ok: true, valor: "" });
  });

  it("una letra sola no identifica a nadie", () => {
    expect(validarMote("X").ok).toBe(false);
  });

  it("41 letras no caben en la fila", () => {
    expect(validarMote("X".repeat(40)).ok).toBe(true);
    expect(validarMote("X".repeat(41)).ok).toBe(false);
  });

  it("los saltos de línea se convierten en espacios, no rechazan el mote", () => {
    // El `\s+ → " "` es lo primero que pasa: un mote pegado de dos líneas se arregla
    // solo en vez de dar un error que el socio no sabría corregir.
    expect(validarMote(`Ximo${SALTO}Gran`)).toEqual({ ok: true, valor: "Ximo Gran" });
  });

  it("los caracteres de control que NO son espacio, fuera", () => {
    // Estos sobreviven al paso de arriba, y uno de ellos dentro de una fila de tabla o
    // del cuerpo de un push rompe la pantalla.
    expect(validarMote(`Xi${NULO}mo`).ok).toBe(false);
  });

  it("sin ninguna letra ni número, no", () => {
    expect(validarMote("...").ok).toBe(false);
    expect(validarMote("¿?").ok).toBe(false);
  });

  it("acentos, ñ y apóstrofos son nombres normales aquí", () => {
    expect(validarMote("Ximo").ok).toBe(true);
    expect(validarMote("Ñoño").ok).toBe(true);
    expect(validarMote("L'Avi").ok).toBe(true);
    expect(validarMote("R2").ok).toBe(true);
  });
});

describe("claveMote", () => {
  it("iguala mayúsculas y espacios: para reconocer a alguien son el mismo mote", () => {
    expect(claveMote(" XIMO ")).toBe("ximo");
    expect(claveMote("El  Profe")).toBe("el profe");
  });
});

describe("moteOcupado", () => {
  const otros = [
    { nombre: "Almiñana, Joaquim", apodo: "Ximo", apodoSolicitado: null },
    { nombre: "Vallalta, Luis", apodo: null, apodoSolicitado: "Luisico" },
  ];

  it("caza el que ya está puesto, sin mirar mayúsculas", () => {
    expect(moteOcupado("ximo", otros)).toEqual({
      nombre: "Almiñana, Joaquim",
      pedido: false,
    });
  });

  it("CAZA TAMBIÉN EL QUE OTRO HA PEDIDO Y ESTÁ SIN APROBAR", () => {
    // Es la mitad que se olvida: sin esto, dos socios piden "Luisico" el mismo día, a
    // los dos se les dice que perfecto, y el problema aparece al aprobar el segundo.
    expect(moteOcupado("  LUISICO ", otros)).toEqual({
      nombre: "Vallalta, Luis",
      pedido: true,
    });
  });

  it("uno libre es null", () => {
    expect(moteOcupado("Nuevo", otros)).toBeNull();
  });

  it("vacío nunca choca: es quitarse el mote", () => {
    expect(moteOcupado("", otros)).toBeNull();
  });
});

describe("textoOcupado", () => {
  it("distingue tenerlo de haberlo pedido", () => {
    expect(textoOcupado({ nombre: "Ana", pedido: false })).toBe("Ese mote ya es de Ana.");
    expect(textoOcupado({ nombre: "Ana", pedido: true })).toBe(
      "Ese mote lo ha pedido antes Ana."
    );
  });
});
