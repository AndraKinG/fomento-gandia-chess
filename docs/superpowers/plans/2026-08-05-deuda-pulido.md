# Deuda de pulido — revisión del 2026-08-05

El ledger original (`.superpowers/sdd/progress.md`) estaba gitignorado y se quedó
en el otro ordenador, así que esta lista es una **revisión nueva desde cero**, no
la recuperación de la anterior. Si algún día aparece el ledger viejo, conviene
cruzarlas.

**Limitación del método:** hecha leyendo código y midiendo los tokens de color,
no navegando la app: sin la contraseña del propietario no hay sesión, y todas
las pantallas salvo `/login` y `/registro` la exigen. Los hallazgos de layout
real en móvil (desbordes, alturas, scroll) **no** están cubiertos y necesitan
que el propietario navegue con el móvil.

## Arreglado en esta pasada

- **Fallo silencioso al activar notificaciones.** `ActivarNotificaciones` tenía
  un `.catch(() => {})` que se comía cualquier error: el socio pulsaba, no
  pasaba nada y no había forma de saber por qué. Ahora hay estado de "activando",
  mensajes distintos para permiso denegado / navegador incompatible / error de
  red, y un botón de reintentar. Se menciona explícitamente el caso de iOS, que
  no permite push hasta que la PWA está instalada en la pantalla de inicio —
  con 46 socios entrando, ese iba a ser el motivo de consulta número uno.
- **`<nav>` sin nombre accesible** en la barra inferior y en el índice de admin.
  Un lector de pantalla anunciaba "navegación" sin decir cuál.

## Pendiente, por orden de lo que más se nota

1. **Contraste de `--tinta-suave` en el tema claro: 4.46 sobre el fondo, cuando
   AA pide 4.50.** Medido, no estimado. Afecta a todo el texto secundario
   (subtítulos, detalles de estados vacíos, textos de ayuda) sobre `--fondo` y
   `--tarjeta-suave`; sobre `--tarjeta` blanca sí cumple (4.76). El tema oscuro
   cumple de sobra en todos los pares (5.17 a 15.17).
   **No lo he tocado porque cambia la identidad visual**, y el `CLAUDE.md` dice
   que eso no se cambia sin preguntar. Basta oscurecer el token del tema claro:
   `#5d6d82` da 4.96 (el cambio más pequeño que cumple) y `#556577` da 5.61 si
   se quiere margen. Una línea en `globals.css`.
2. **Iconos de la PWA: solo hay un SVG.** iOS no admite SVG como icono de
   pantalla de inicio, así que un socio de iPhone que instale la app verá un
   icono genérico o una captura de la página. Hacen falta PNG de 192 y 512, y
   un `apple-touch-icon` de 180. Requiere generar imágenes, no es un cambio de
   código.
3. **`background_color` del manifest es el del tema claro** (`#f0f9ff`), así que
   al abrir la app instalada en modo oscuro hay un destello blanco antes de
   pintar. Cosmético.
4. **Objetivos táctiles de la barra inferior** ~34 px de alto. Cumple el mínimo
   de WCAG (24 px) pero queda por debajo de los 44 px que recomienda Apple.
   Subir el `p-2` del `<nav>` lo resolvería; conviene comprobarlo en móvil real
   antes, porque roba alto a la pantalla.

## Comprobado y correcto (no toca nada)

- Los controles de disponibilidad, que son lo que más va a usar el club, están
  bien: `role="group"` con `aria-label`, `aria-pressed` por opción, emoji con
  `aria-hidden`, estado deshabilitado mientras guarda y **rollback optimista**
  si la escritura falla.
- Formularios de login y registro: cada `input` con su `<label>` asociado,
  `type` y `minLength` correctos, y `autoCapitalize`/`spellCheck` ajustados en
  el campo del código.
- Banners con `role="alert"`; botones de icono con `aria-label` (quitar capitán,
  quitar jugador de un tablero); `aria-current="page"` en la pestaña activa.
- Contrastes del tema oscuro y del texto principal en ambos temas: todos por
  encima de AA, varios por encima de AAA.
- El conmutador de tema usa `useSyncExternalStore` en vez de `useState` +
  efecto, así que no se queda congelado tras recargar con un tema guardado.
