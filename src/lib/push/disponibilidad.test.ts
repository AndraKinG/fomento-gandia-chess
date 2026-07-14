import { describe, expect, it } from "vitest";
import { calcularDestinatariosRecordatorio } from "./disponibilidad";

// Nota de diseño: esta función pura recibe ya el conjunto de "usuarios"
// candidatos (con player_id no nulo) — el filtro "sin ficha vinculada" ocurre
// aguas arriba, en la consulta que arma ese array (join profiles.player_id).
// Igualmente, la existencia de suscripción push NO se decide aquí: se
// comprueba en la capa de envío (enviarPushAUsuario / enviarPushAMuchos), que
// simplemente no manda nada si el usuario no tiene ninguna fila en
// push_subscriptions. Por eso esos dos casos no aparecen como test de esta
// función: pertenecen a otras capas.

describe("calcularDestinatariosRecordatorio", () => {
  it("excluye a un usuario que ya respondió TODAS las jornadas próximas", () => {
    const jornadas = [{ id: "m1", fecha_hora: "2026-08-15T00:00:00Z" }];
    const disponibilidades = [{ match_id: "m1", player_id: "p1" }];
    const usuarios = [{ user_id: "u1", player_id: "p1" }];

    expect(calcularDestinatariosRecordatorio(jornadas, disponibilidades, usuarios)).toEqual([]);
  });

  it("incluye a un usuario que respondió solo ALGUNA de las jornadas próximas", () => {
    const jornadas = [
      { id: "m1", fecha_hora: "2026-08-15T00:00:00Z" },
      { id: "m2", fecha_hora: "2026-08-16T00:00:00Z" },
    ];
    const disponibilidades = [{ match_id: "m1", player_id: "p1" }];
    const usuarios = [{ user_id: "u1", player_id: "p1" }];

    expect(calcularDestinatariosRecordatorio(jornadas, disponibilidades, usuarios)).toEqual(["u1"]);
  });

  it("incluye a un usuario que no respondió NINGUNA jornada", () => {
    const jornadas = [{ id: "m1", fecha_hora: "2026-08-15T00:00:00Z" }];
    const disponibilidades: { match_id: string; player_id: string }[] = [];
    const usuarios = [{ user_id: "u1", player_id: "p1" }];

    expect(calcularDestinatariosRecordatorio(jornadas, disponibilidades, usuarios)).toEqual(["u1"]);
  });

  it("con varias jornadas y varios usuarios, filtra solo a quien le falta alguna", () => {
    const jornadas = [
      { id: "m1", fecha_hora: "2026-08-15T00:00:00Z" },
      { id: "m2", fecha_hora: "2026-08-16T00:00:00Z" },
    ];
    const disponibilidades = [
      { match_id: "m1", player_id: "p1" },
      { match_id: "m2", player_id: "p1" }, // p1: respondió todo
      { match_id: "m1", player_id: "p2" }, // p2: le falta m2
      // p3: no respondió nada
    ];
    const usuarios = [
      { user_id: "u1", player_id: "p1" },
      { user_id: "u2", player_id: "p2" },
      { user_id: "u3", player_id: "p3" },
    ];

    expect(calcularDestinatariosRecordatorio(jornadas, disponibilidades, usuarios)).toEqual([
      "u2",
      "u3",
    ]);
  });

  it("sin jornadas próximas, no hay nada que recordar", () => {
    const usuarios = [{ user_id: "u1", player_id: "p1" }];
    expect(calcularDestinatariosRecordatorio([], [], usuarios)).toEqual([]);
  });
});
