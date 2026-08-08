# Piezas del tablero

Juego **celtic**, de [Maurizio Monge](https://github.com/maurimo/chess-art), bajo
licencia [MIT](https://github.com/maurimo/chess-art/blob/main/LICENSE). Los ficheros
se han copiado tal cual, sin modificar, desde el repositorio de Lichess
(`public/piece/celtic`).

## Por qué este y no otro

Los dos juegos más conocidos —cburnett (el de Wikipedia) y merida— son **GPLv2+**, y
meter arte con copyleft fuerte en una app que no es GPL es un lío que no hace falta
buscarse. De los permisivos que publica Lichess, `celtic` es el que tiene la silueta
Staunton de toda la vida, que es la que espera cualquiera que juegue en un club.

Otras opciones permisivas, por si alguna vez se quiere cambiar (mismo repositorio de
Lichess, misma estructura de nombres):

- `fantasy` y `spatial` — Maurizio Monge, MIT. Más recargadas.
- `chessnut` — Alexis Luengas, Apache 2.0. Plana y moderna, estilo chess.com.
- `rhosgfx` — CC0. Plana, pero con los colores crema/naranja metidos en el propio
  SVG, que se pelean con el blanquiazul del club.

## Nombres de fichero

`<color><pieza>.svg`, con el color en minúscula (`w`/`b`) y la pieza en mayúscula
(`K Q R B N P`). Es el mismo formato que devuelve `chess.js`, así que
`src/components/ajedrez/Tablero.tsx` monta la ruta directamente. Si se cambia de
juego, respetar estos nombres y no hace falta tocar código.
