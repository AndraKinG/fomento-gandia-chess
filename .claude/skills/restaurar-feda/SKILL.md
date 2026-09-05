---
name: restaurar-feda
description: Cómo restaurar el importador de ELO FEDA si la FEDA vuelve a publicar listas. La FEDA no publica desde diciembre de 2023, así que el importador se retiró (código sigue en git). Invocar solo cuando el propietario diga que la FEDA ha publicado lista nueva.
---

# Restaurar el importador de la FEDA

**Situación de partida (2026-08-11)**: la FEDA no publica listas de ELO desde
diciembre de 2023. El propietario decidió retirar el importador entero (endpoint,
botones, `feda.ts`, `feda-apply.ts` y la dependencia `xlsx`). `players.elo_feda` se
queda como columna de datos históricos.

Esta skill se invoca **solo si la FEDA vuelve a publicar**.

## Pasos

### 1. Confirmar que la fuente existe

Antes de tocar nada, mirar https://feda.org (o la URL que el propietario haya visto) y
verificar:

- Hay una lista de ELO publicada con fecha reciente.
- Está en un formato descargable (histórico: `.xlsx`; podría ser otro).
- Es la lista COMPLETA de federados españoles, no un subset.

Si la lista existe pero en formato distinto al `.xlsx` histórico, el parser hay que
reescribirlo — no basta con restaurar el código.

### 2. Localizar el commit de la retirada

```
git log --oneline --all -- src/lib/import/feda.ts src/lib/import/feda-apply.ts
```

Debería aparecer el commit que borró esos ficheros (mirando fechas de agosto 2026).
Anotar el hash del commit ANTERIOR a ese (el último que los tenía).

### 3. Restaurar ficheros

```
git checkout <hash-anterior> -- src/lib/import/feda.ts src/lib/import/feda-apply.ts
```

Puede haber más ficheros afectados (endpoint, botón en Admin, tests). Revisar el diff
del commit de retirada para saber qué más borró:

```
git show <hash-retirada> --stat
```

Y restaurar todo lo relevante.

### 4. Reinstalar `xlsx`

```
npm install xlsx
```

**Preguntar al propietario antes** (regla del común: no instalar dependencias sin
avisar, con motivo). El motivo es: "la FEDA publica en Excel y el parser lo lee con
`xlsx`".

### 5. Verificar la URL de la fuente

En `src/lib/import/feda-apply.ts` hay una constante tipo `URL_PAGINA_ELO_FEDA`. Si la
FEDA publica en otro sitio, cambiarla.

### 6. Verificar el cruce por FIDE

El importador se arregló el 2026-08-07 para cruzar por FIDE (antes cruzaba por
`feda_id`, que ninguna ficha tenía, así que devolvía siempre "0 actualizados" sin
error). El cruce actual usa la columna `Id. Fide` de la lista FEDA.

Comprobar en la lista descargada que esa columna existe. Si el formato cambia
(columna renombrada), ajustar el parser.

### 7. Probar en local

Pulsar el botón desde Admin → Actualización de ELO en local (o llamar al endpoint) y
mirar cuántos socios se actualizan. En el club son 46 socios; en 2023 cruzaban 23 (los
federados en FEDA). Con la lista nueva debería cruzar un número similar o mayor.

### 8. Desplegar

Si todo bien, commit + push (el propietario) y el botón queda disponible en Admin.

## Lo que NO hay que hacer

- **No inventarse una URL** si feda.org no publica en su sitio habitual. Preguntar al
  propietario dónde vio la lista.
- **No reescribir el parser** sin verificar primero que el formato cambió. Si es el
  mismo `.xlsx`, el parser antiguo debería seguir funcionando.
- **No borrar `players.elo_feda`** — es la columna donde escribe el importador.

Contexto en [docs/decisiones.md#feda-retirada-entera](../../../docs/decisiones.md#feda-retirada-entera).
