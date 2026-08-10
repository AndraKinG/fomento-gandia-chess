# Piezas del tablero

Cada juego es una carpeta con los 12 SVG, copiados tal cual, sin modificar, desde el
repositorio de Lichess (`public/piece/<juego>`). El catálogo que ve el socio está en
`src/lib/ajedrez/piezas.ts`; hay un test que comprueba que cada juego del catálogo
tiene sus 12 ficheros.

## Juegos incluidos y sus licencias

| Carpeta    | En el selector | Autor                                                  | Licencia   |
| ---------- | -------------- | ------------------------------------------------------ | ---------- |
| `celtic`   | Clásicas       | [Maurizio Monge](https://github.com/maurimo/chess-art) | MIT        |
| `chessnut` | Modernas       | [Alexis Luengas](https://github.com/LexLuengas)        | Apache 2.0 |
| `fantasy`  | Fantasía       | Maurizio Monge                                         | MIT        |
| `spatial`  | Espaciales     | Maurizio Monge                                         | MIT        |

Descargados el 2026-08-10 de `github.com/lichess-org/lila/public/piece/`.

## Por qué estos y no otros

**Solo arte permisivo.** Los dos juegos más conocidos —cburnett (el de Wikipedia) y
merida— son **GPLv2+**, y meter arte con copyleft fuerte en una app que no es GPL es
un lío que no hace falta buscarse. `celtic` es el default porque tiene la silueta
Staunton de toda la vida, que es la que espera cualquiera que juegue en un club.

Otra opción permisiva descartada: `rhosgfx` (CC0) lleva los colores crema/naranja
metidos en el propio SVG, que se pelean con el blanquiazul del club.

## Nombres de fichero

`<juego>/<color><pieza>.svg`, con el color en minúscula (`w`/`b`) y la pieza en
mayúscula (`K Q R B N P`). Es el formato que devuelve `chess.js`; la ruta la monta
`rutaPieza()` en `src/lib/ajedrez/piezas.ts`, único sitio que conoce el formato.

## Cómo se añade un juego

1. Carpeta nueva en `public/piezas/` con los 12 SVG y esos nombres.
2. Su licencia, en la tabla de arriba (solo MIT / Apache / CC0 / similares).
3. Una entrada en `JUEGOS_PIEZAS` (`src/lib/ajedrez/piezas.ts`). El test del
   catálogo avisa si faltan ficheros.
