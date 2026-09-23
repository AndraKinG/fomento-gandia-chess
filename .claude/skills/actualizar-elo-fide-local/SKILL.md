---
name: actualizar-elo-fide-local
description: Cómo actualizar el ELO FIDE de los socios. Solo funciona desde una IP doméstica (fide.com bloquea IPs de datacenter, así que Vercel y GitHub Actions no pueden). Invocar si el propietario dice que los ELOs FIDE están atrasados o si la tarea programada no corre.
---

# Actualizar el ELO FIDE en local

`fide.com` bloquea IPs de centro de datos (Vercel Y GitHub Actions, verificado). El
ranking se trae con `scripts/actualizar-elo-fide.mjs` desde una **conexión doméstica**.
El propietario tiene una tarea programada diaria; esta skill cubre tanto la
automatización como la ejecución manual y el diagnóstico.

## Cómo debería correr solo

Tarea del Programador de tareas de Windows del propietario, que ejecuta cada día a las
14:00 el `scripts/elo-fide-programado.cmd`.

**El `.cmd` no es un adorno.** El Programador NO hereda `PATH` ni el directorio de
trabajo de la sesión de usuario. Una tarea que llame a `node scripts/actualizar-elo-fide.mjs`
a secas corre en `System32`, no encuentra el proyecto ni el `.env.local`, y falla en
silencio. El `.cmd`:

1. Hace `cd` a la carpeta del proyecto (con las comillas, hay espacios).
2. Llama a `node scripts/actualizar-elo-fide.mjs`.
3. Escribe la salida en `logs/elo-fide.log` (gitignorado). **Sin log, una tarea
   programada que falla no se distingue de una que no existe.**

## Comprobar que corre

En la máquina del propietario:

- `logs/elo-fide.log` debe tener una entrada diaria reciente.
- Programador de tareas → historial de la tarea → última ejecución `succeeded`.

Si el log no crece:
- ¿Está encendido el PC a las 14:00? (Tarea programada no despierta el equipo.)
- ¿La tarea sigue apuntando al `.cmd` correcto?
- ¿La ruta del proyecto cambió?

## Correr a mano

Cuando haga falta forzar una actualización (por ejemplo, tras un torneo importante):

```
cd "C:\Users\Joan M.R\Desktop\Joan\Proyectos\Web Chess Fomento\fomento-gandia-chess"
node scripts/actualizar-elo-fide.mjs
```

Requisitos:
- Ejecutarlo desde una conexión **doméstica** (no VPN corporativa, no oficina que
  enrute por datacenter).
- `.env.local` con las claves de Supabase (el script las lee de ahí para no pasar la
  service_role por la terminal).

## Salida esperada

El script recorre todos los socios con `fide_id`, lee su perfil FIDE y actualiza
`players.elo_fide`, `elo_fide_rapidas`, `elo_fide_blitz`, `variacion_fide*` y
`elo_fide_leido_en`. Imprime un resumen con cuántos socios se actualizaron.

**Solo devuelve error si NO SE ACTUALIZÓ NADIE.** Hay 10 socios con ficha FIDE pero sin
rating todavía (federados que no han jugado nada válido) — contarlos como errores
pintaba la tarea programada en rojo cada día. Esos 10 son los del ELO estimado.

## La tarea programada falla en silencio: dos causas, las dos vistas

**MIRAR SIEMPRE `logs/elo-fide.log` PRIMERO.** Es lo que distingue las dos: si NO hay
cabecera nueva con la fecha de hoy, el `.cmd` ni siquiera llegó a ejecutarse, y el
problema está en la tarea, no en el script.

**1. La tarea apunta a una ruta que ya no existe (2026-09-23).** Costó 18 días de ELO sin
actualizar. El proyecto se movió a `Desktop\Joan\Proyectos\...` el 5 de septiembre y la
tarea seguía apuntando a `Desktop\Joan\Web Chess Fomento\...`: arrancaba, no encontraba
el `.cmd` y moría con resultado 1 **sin escribir una sola línea en el log**. Nadie se
entera, porque la app sigue enseñando los ELOs viejos como si fueran de hoy. **Al mover o
renombrar la carpeta del proyecto, hay que reapuntar la tarea:**

```powershell
$t = Get-ScheduledTask -TaskName "Fomento - ELO FIDE"; $t.Actions[0].Execute = '"<RUTA NUEVA>\scripts\elo-fide-programado.cmd"'; Set-ScheduledTask -TaskName "Fomento - ELO FIDE" -Action $t.Actions
```

**2. El portátil a batería.** Windows crea las tareas con `DisallowStartIfOnBatteries` a
`True`, así que en un portátil se rechazan casi siempre (resultado `0x800710E0`, "petición
rechazada", y tampoco escriben en el log). Y con `StartWhenAvailable` a `False`, la pasada
de un día con el PC apagado se pierde sin recuperarse:

```powershell
$t = Get-ScheduledTask -TaskName "Fomento - ELO FIDE"; $t.Settings.DisallowStartIfOnBatteries = $false; $t.Settings.StopIfGoingOnBatteries = $false; $t.Settings.StartWhenAvailable = $true; Set-ScheduledTask -TaskName "Fomento - ELO FIDE" -Settings $t.Settings
```

**Comprobar que funciona de verdad**, sin esperar a mañana: `Start-ScheduledTask -TaskName
"Fomento - ELO FIDE"`, esperar un minuto, y mirar que `LastTaskResult` sea `0` **y** que
`logs/elo-fide.log` tenga cabecera nueva. Lo primero solo dice que arrancó.

**`variacion_fide` a null en TODAS las fichas no es un fallo.** La FIDE solo publica
variación pendiente de quien ha jugado valorado en el mes en curso; fuera de temporada es
normal que no la tenga nadie.

## Si un perfil deja de responder

**Si el script no ve NINGÚN rating en un perfil, NO escribe nada** — evita que un
rediseño de la FIDE o un HTTP 200 con HTML vacío borre los ELOs de los 46 socios de una
pasada. Si empiezan a salir avisos de "0 lecturas" repetidos, el parser
(`src/lib/import/fide-perfil.ts`) probablemente esté roto por un cambio de HTML de la
FIDE. Verificar comparando el HTML actual de un perfil real contra las plantillas de
test.

Contexto en [docs/decisiones.md#el-elo-fide-automatizado-en-el-pc-del-propietario](../../../docs/decisiones.md#el-elo-fide-automatizado-en-el-pc-del-propietario)
y [docs/decisiones.md#los-tres-elos-de-la-fide-y-la-variación-pendiente](../../../docs/decisiones.md#los-tres-elos-de-la-fide-y-la-variación-pendiente).
