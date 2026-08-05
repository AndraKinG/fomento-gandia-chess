import type { MetadataRoute } from "next";

/**
 * La app es privada del club. El `noindex` de los metadatos ya lo pide a los
 * buscadores que renderizan la página; esto lo pide antes, en el rastreo.
 * Ninguno de los dos es seguridad: eso son las policies de RLS.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
