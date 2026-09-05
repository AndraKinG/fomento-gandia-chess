---
paths:
  - "supabase/**"
  - "**/*.sql"
  - "**/migrations/**"
---

# Base de datos

- Toda tabla con datos de usuario lleva RLS activado y sus políticas en la misma
  migración que la crea. Una tabla sin políticas es un bug, no un pendiente.
- Nombres en `snake_case` y en inglés. Tablas en plural.
- Toda tabla: `id`, `created_at`, y `updated_at` cuando se edite.
- Claves foráneas con `on delete` explícito. Decide entre `cascade` y `restrict`, no lo
  dejes por defecto sin pensarlo.
- Migraciones: un archivo por cambio, con fecha en el nombre, y nunca se edita una ya
  aplicada. Si algo está mal, migración nueva que lo corrige.
- La `service role key` solo en servidor. Si aparece en código de cliente, para y avísame.
- Antes de un cambio destructivo (drop, alteración de columna con datos), dime cómo
  revertirlo.
