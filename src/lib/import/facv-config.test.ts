import { describe, expect, it } from "vitest";
import { CLUB_ID_FACV, TEMPORADA_ID_FACV } from "./facv-config";
import { URL_OF_CLUB } from "./facv-orden-fuerza";
import { URL_CALENDARIO } from "./facv-calendario";

describe("FACV configuration URLs", () => {
  it("URL_OF_CLUB construye la URL correcta con CLUB_ID_FACV=56", () => {
    expect(URL_OF_CLUB).toBe(
      "https://www.facv.org/appwebfacv/public/staff/of_club/of_publico.php?id=56"
    );
  });

  it("URL_CALENDARIO contiene TEMPORADA_ID_FACV=1428", () => {
    expect(URL_CALENDARIO).toContain("id=1428");
  });

  it("CLUB_ID_FACV es 56 (Fomento Gandia)", () => {
    expect(CLUB_ID_FACV).toBe(56);
  });

  it("TEMPORADA_ID_FACV es 1428 (temporada actual)", () => {
    expect(TEMPORADA_ID_FACV).toBe(1428);
  });
});
