import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseEloFideDesdePerfil } from "./fide";

const html = readFileSync(
  join(__dirname, "fixtures", "fide-profile.html"),
  "utf-8"
);
// Valor real visible en el fixture (perfil FIDE 1503014, Carlsen, Magnus):
// bloque "profile-standart" -> <p>2823</p> ... STANDARD (Jul-2026).
const ELO_ESPERADO = 2823;

describe("parseEloFideDesdePerfil", () => {
  it("extrae el ELO standard del perfil", () => {
    expect(parseEloFideDesdePerfil(html)).toBe(ELO_ESPERADO);
  });
  it("devuelve null si no hay rating", () => {
    expect(parseEloFideDesdePerfil("<html><body>Not rated</body></html>")).toBeNull();
  });
});
