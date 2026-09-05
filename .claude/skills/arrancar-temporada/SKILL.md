---
name: arrancar-temporada
description: Pasos para dar de alta una temporada nueva de Interclubs FACV en la app. Invocar al comienzo de temporada (agosto-septiembre) o cuando el propietario diga que la FACV ha publicado el nuevo calendario y orden de fuerza.
---

# Arrancar una temporada nueva

Cuatro pasos manuales, en orden. **Ninguno es automático.** El primero es cambio de
código y despliegue; los tres siguientes se hacen desde `/club/admin` una vez el
despliegue está en producción.

## 1. Cambiar el id de temporada FACV en el código

La FACV asigna un id nuevo a su calendario cada temporada. Está en
`src/lib/import/facv-config.ts`, constante `TEMPORADA_ID_FACV`. Cambiarlo, commit,
push (el propietario) y esperar despliegue de Vercel.

**Cómo se sabe el id nuevo**: aparece en la URL del calendario oficial en facv.org.
Preguntar al propietario si tiene dudas.

## 2. Crear la temporada pegando el orden de fuerza

En `/club/admin/orden-fuerza`, importación manual: pegar el orden de fuerza que la FACV
publica al empezar temporada (PDF/texto). La acción:

- Desactiva la temporada anterior (`seasons.activa = false`).
- Crea la nueva y la activa.
- Rollback automático si falla la importación.

Verificar tras aplicar: `select nombre, activa from seasons` en Supabase. Debe haber
exactamente UNA activa.

## 3. Dar de alta los equipos

Desde `/club/admin/equipos`, crear las divisiones del club en la temporada nueva. Los
capitanes de la temporada anterior NO se copian (viven en `team_captains` por temporada);
asignarlos a mano por equipo.

## 4. Importar calendario, resultados y actas

Desde `/club/admin/torneos` (o esperar al primer cron del viernes/domingo, pero es
preferible hacerlo a mano el primer día para verificar):

1. Sincronizar calendario FACV → aparecen las jornadas.
2. Sincronizar resultados y clasificación.
3. Sincronizar actas por tablero (chess-results).

## Lo que NO depende de la temporada

Y por tanto no se pierde ni hay que rehacer:

- Fichas de socios (`players`) y sus perfiles, motes, aperturas, fotos.
- Repositorio de partidas (`games`) y torneos internos.
- ELO del club (se recalcula de las partidas).
- Roles, códigos de acceso, suscripciones push.

## Verificación

Al terminar, comprobar en la app:

- `/club/orden-fuerza` enseña la lista nueva.
- `/club/socios` enseña 46 (o los que sean) socios activos.
- `/club/equipos` enseña las divisiones nuevas con capitanes.
- `/club/equipos/<id>` enseña las jornadas de la temporada.
- Cada socio puede vincular su cuenta si no está vinculado (la lista de `/vincular`
  sale del `force_order` de la temporada activa).

Contexto completo del porqué en
[docs/decisiones.md#fuerza-del-jugador](../../../docs/decisiones.md#fuerza-del-jugador)
y [docs/decisiones.md#los-tres-elos-distintos](../../../docs/decisiones.md#los-tres-elos-distintos).
