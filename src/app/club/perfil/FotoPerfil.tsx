"use client";

import { useRef, useState, useTransition } from "react";
import { quitarFoto, subirFoto } from "./actions";

/**
 * La foto de la ficha: elegirla, verla y quitarla.
 *
 * EL NAVEGADOR ENCOGE Y RECORTA ANTES DE SUBIR, y no es un adorno: una foto de
 * móvil sin tocar son 5 MB y aquí se pinta a 160 px. Se recorta al CUADRADO
 * CENTRAL (la cara suele estar en medio) y se encoge a 512×512 en JPEG — unas
 * decenas de KB. Sin esto, el bucket cobraría el precio de los píxeles que
 * nadie va a ver, y la subida desde el club (WiFi de bar) tardaría un rato.
 *
 * El servidor vuelve a comprobar tipo y tamaño de todos modos: este recorte se
 * lo salta cualquiera llamando a la action a mano.
 */
const LADO = 512;

async function recortada(fichero: File): Promise<Blob> {
  const imagen = await createImageBitmap(fichero);
  try {
    const lado = Math.min(imagen.width, imagen.height);
    const lienzo = document.createElement("canvas");
    lienzo.width = LADO;
    lienzo.height = LADO;
    const ctx = lienzo.getContext("2d");
    if (!ctx) throw new Error("sin canvas");
    ctx.drawImage(
      imagen,
      (imagen.width - lado) / 2,
      (imagen.height - lado) / 2,
      lado,
      lado,
      0,
      0,
      LADO,
      LADO
    );
    return await new Promise<Blob>((resolver, rechazar) => {
      lienzo.toBlob(
        (b) => (b ? resolver(b) : rechazar(new Error("no se pudo recortar"))),
        "image/jpeg",
        0.85
      );
    });
  } finally {
    imagen.close();
  }
}

export function FotoPerfil({ fotoUrl, nombre }: { fotoUrl: string | null; nombre: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const input = useRef<HTMLInputElement | null>(null);

  function elegir(fichero: File | undefined) {
    if (!fichero) return;
    setError(null);
    empezar(async () => {
      try {
        const foto = await recortada(fichero);
        const datos = new FormData();
        datos.set("foto", new File([foto], "foto.jpg", { type: "image/jpeg" }));
        const r = await subirFoto(datos);
        if (r.error) setError(r.error);
      } catch {
        // `createImageBitmap` lanza con un fichero que no es una imagen de verdad.
        setError("No se ha podido leer esa imagen. Prueba con otra.");
      }
    });
  }

  return (
    <div className="flex items-center gap-4">
      {/* La foto o, si no hay, la inicial: un hueco gris sin nada parece un fallo. */}
      {fotoUrl ? (
        // La URL firmada caduca en una hora: el optimizador de <Image /> la
        // cachearía ya muerta, así que va un <img> normal a propósito.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={fotoUrl}
          alt={`Foto de ${nombre}`}
          className="h-20 w-20 shrink-0 rounded-full object-cover ring-2 ring-borde-acento"
        />
      ) : (
        <span
          aria-hidden
          className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-tarjeta-suave text-2xl font-bold text-acento-texto ring-2 ring-borde"
        >
          {nombre.trim().charAt(0).toUpperCase()}
        </span>
      )}

      <div className="min-w-0 space-y-1.5">
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            elegir(e.target.files?.[0]);
            // Sin esto, elegir la misma foto dos veces seguidas no dispara nada.
            e.target.value = "";
          }}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pendiente}
            onClick={() => input.current?.click()}
            className="rounded-xl border border-borde bg-tarjeta px-3 py-1.5 text-sm text-tinta transition hover:bg-tarjeta-suave disabled:opacity-50"
          >
            {pendiente ? "Subiendo…" : fotoUrl ? "Cambiar foto" : "Poner foto"}
          </button>
          {fotoUrl && (
            <button
              type="button"
              disabled={pendiente}
              onClick={() => {
                setError(null);
                empezar(async () => {
                  const r = await quitarFoto();
                  if (r.error) setError(r.error);
                });
              }}
              className="rounded-xl px-3 py-1.5 text-sm text-tinta-suave underline disabled:opacity-50"
            >
              Quitar
            </button>
          )}
        </div>
        <p className="text-xs text-tinta-suave">
          Se recorta al cuadrado del centro. La ven solo los socios.
        </p>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
