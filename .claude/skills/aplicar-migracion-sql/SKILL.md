---
name: aplicar-migracion-sql
description: Cómo escribir y aplicar una migración SQL en Supabase para este proyecto. Invocar siempre que haya que crear una tabla nueva, alterar una existente, cambiar policies RLS, tocar pg_cron o cualquier cambio de esquema. El propietario aplica el SQL a mano desde el SQL Editor.
---

# Aplicar una migración SQL

Regla del propietario (2026-08-07): **NADA de portapapeles/`Set-Clipboard`**. El SQL se
pega ENTERO en el chat y él lo copia de ahí al SQL Editor.

## Pasos

### 1. Escribir el archivo

En `supabase/migrations/`, numerada en orden (`00XX_titulo-corto.sql`). Ver la última
migración aplicada para saber el número siguiente (mirar `ESTADO.md` o
`ls supabase/migrations/`).

### 2. Pegar el SQL completo en el chat

En un bloque ```sql para que el propietario lo copie DESDE EL CHAT al SQL Editor de
Supabase. No decirle "copia del archivo" — ponerlo en el chat.

### 3. Esperar a que él aplique

Él pega el SQL en Supabase → SQL Editor → Run. Avisa cuando termine (o si hay error).

### 4. Verificar vía REST

Con `curl` o `fetch` a la API PostgREST, comprobar que las tablas/columnas nuevas
existen y responden. No fiar solo del "Success. No rows returned" de Supabase.

### 5. Anotar en ESTADO.md

Añadir la migración a la lista de aplicadas (o dejarla marcada como "pendiente de
verificar" si él aplicó pero aún no la comprobamos).

## Reglas duras al escribir

**Guardas de un hueco a rellenar por FORMA, nunca por igualdad con el texto del hueco.**
La 0037 y la primera 0049 hacían `if v_secreto = 'PEGA_AQUI_TU_CRON_SECRET' then raise`.
El propietario sustituyó ese texto con buscar-y-reemplazar y la guarda acabó comparando
contra su secreto de verdad — saltaba diciendo que faltaba lo que sí estaba puesto.
Usar `like 'PEGA%'` o longitud mínima. Y el mensaje de error debe decir cuántos
caracteres se leyeron, para distinguir "no lo he puesto" de "lo he puesto mal".

**Cualificar SIEMPRE el nombre de la tabla en comparaciones dentro de policies.** La
0024 escribió `p.player_id = player_id` en un `exists` sobre `profiles`, y ese `player_id`
sin cualificar Postgres lo resolvió contra la subconsulta — se leía
`p.player_id = p.player_id`, siempre cierta. Cualquier socio vinculado podía escribir
en el chat en nombre de otro.

**Partir policies `for all` cuando `select` deba ser distinto.** En Postgres `all`
INCLUYE `select`. La 0014 tenía `for all` en `games`; para las privadas de la 0039 hubo
que partirla en `insert`/`update`/`delete` separadas + una `select` propia, o un admin
seguiría leyendo las privadas de todos (las policies se SUMAN).

**RLS activada y policies en la misma migración que crea la tabla.** Regla del común
`.claude/rules/comun/datos.md`. Una tabla nueva sin policies queda accesible solo a
service_role (no es una fuga, pero es incoherente).

**Cambios destructivos**: antes de un `drop`/`alter column`, escribir en el chat cómo
revertirlo. El propietario tiene que dar OK explícito.

**Nunca editar una migración ya aplicada.** Si algo está mal, migración nueva que lo
corrige. (Regla del CLAUDE.md común.)

Contexto en [docs/decisiones.md#guarda-de-migración-por-forma](../../../docs/decisiones.md#guarda-de-migración-por-forma)
y [docs/decisiones.md#partidas-privadas-y-favoritas](../../../docs/decisiones.md#partidas-privadas-y-favoritas).
