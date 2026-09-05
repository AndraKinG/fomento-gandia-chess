---
paths:
  - "**/*.{tsx,jsx}"
  - "**/*.css"
---

# Frontend

- TypeScript estricto. Nada de `any`: si no sabes el tipo, decláralo y dímelo.
- Server Components por defecto en Next.js App Router. `"use client"` solo cuando haga
  falta estado, efectos o APIs del navegador, y lo más abajo posible en el árbol.
- Estados vacío, de carga y de error en toda vista que traiga datos. No los dejes para "luego".
- Nada de `localStorage` como fuente de verdad de datos que también viven en el servidor.
- Accesibilidad mínima no negociable: labels en inputs, foco visible, contraste, botones
  que sean `<button>`.
- Móvil primero. Si el diseño solo funciona a partir de 1024px, está mal.
- Textos de cara al usuario en español, incluidos los mensajes de error.
