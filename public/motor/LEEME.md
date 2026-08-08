# Motor de ajedrez

**Stockfish.js 18**, compilación `lite-single`, de
[nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js) (la que usa Chess.com
en su analizador). Basado en [Stockfish](https://github.com/official-stockfish/Stockfish).

Los dos ficheros están **tal cual, sin modificar**, y la licencia completa está al
lado en `GPLv3.txt`. La app no lo enlaza ni lo modifica: lo arranca en un Web Worker
y habla con él por mensajes UCI, que es la separación de siempre entre un programa y
un motor de ajedrez.

## Por qué esta compilación y no otra

De las cinco que publica el proyecto:

- **`single`** (un solo hilo) porque las versiones con hilos necesitan
  `SharedArrayBuffer`, y eso obliga a servir **toda** la web con las cabeceras de
  aislamiento de origen (COOP/COEP). Eso rompería cualquier recurso de fuera, y todo
  para ganar unos milisegundos analizando.
- **`lite`** porque la red neuronal completa pesa **110 MB**. Esta pesa 7 y sigue
  jugando muchísimo mejor que cualquiera del club.

La otra opción era la compilación a JavaScript (`asm`), que funciona en cualquier
navegador pero pesa 10 MB y va mucho más lenta. No hace falta: WebAssembly lo
soportan todos los navegadores que puede tener un socio.

## Cómo se carga

**Nunca al abrir la pantalla.** Son 7 MB y se descargan solo cuando alguien pulsa
"Analizar" en el revisor de partidas (`src/components/ajedrez/Analisis.tsx`). El
`sw.js` de la app **no precachea nada** —solo atiende notificaciones push—, así que
no hay riesgo de que se lo trague al instalar la PWA.

## Actualizarlo

```
npm pack stockfish        # o descargar el .tgz del registro
```

y copiar `bin/stockfish-18-lite-single.js` y `.wasm` aquí, respetando los nombres:
la ruta está escrita en `src/lib/ajedrez/motor.ts`.
