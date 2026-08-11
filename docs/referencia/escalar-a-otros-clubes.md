# Escalar a otros clubes: análisis

_Escrito el 2026-08-12 a petición del propietario ("imagina que gusta y otros
clubes también lo quieren"). Es análisis, no plan: ninguna fase está empezada._

## El diagnóstico en una línea

La app está construida para UN club — y eso hoy es una virtud, no una deuda.
Hay dos caminos para servir a más, con costes muy distintos, y el error clásico
es saltar al segundo antes de necesitarlo.

## Qué está "casado" con el Fomento hoy

| Qué | Dónde | Coste de generalizar |
| --- | --- | --- |
| Id del club y temporada FACV | `facv-config.ts` (CLUB_ID_FACV=56) | Bajo: ya es config |
| Nombre, logo, colores | Textos, `logo-club.jpg`, tokens gandiblues | Bajo: extraer a config |
| "Ser socio" = tener ficha | RLS `esta_vinculado()`, profiles 1:1 player | **Alto**: es el corazón de las 63 policies |
| La web pública en `/` | `page.tsx`, `/unirse` | Medio: por club sería subdominio |
| Importadores | FACV + chess-results | **Solo valen para clubes de la FACV** |
| Cron director | Un club, un calendario | Medio: multiplexar por club |
| Claves (Gemini, VAPID, Supabase) | Un proyecto de cada | Bajo por club; caro compartido |

## Camino 1 — FRANQUICIA (recomendado hasta ~5 clubes)

**Un repo, N despliegues.** Cada club recibe su proyecto de Vercel y su proyecto
de Supabase, con sus variables de entorno (id FACV, nombre, logo, claves). El
código es el mismo para todos; push a `main` despliega a todos.

- **Coste por club: ~0 €.** Cada club estrena SUS capas gratuitas (Supabase:
  500 MB y 200 conexiones en vivo; Vercel hobby; Gemini free). Justo lo que un
  club de 40-60 socios consume.
- **Aislamiento gratis**: los datos de un club no pueden filtrarse a otro porque
  ni comparten base. La RLS actual vale TAL CUAL. Un fallo de un club no tumba
  a los demás.
- **Lo que hay que construir** (asumible):
  1. Extraer a configuración lo que queda en duro. **Medido el 2026-08-12: solo
     26 apariciones de "Fomento" en código, en 12 ficheros** — nombre del club,
     textos de la web pública, el logo (ya es un fichero) y los colores. Es una
     tarde, no un rediseño: la app nunca metió el club dentro de la lógica.
  2. Automatizar las migraciones: con N bases, el SQL-por-chat no escala — CLI
     de Supabase (`supabase db push`) por proyecto, con el gate manual solo para
     la primera vez.
  3. Guía de alta de un club nuevo (media tarde por club): crear proyectos,
     variables, código de acceso, importar su orden de fuerza.
- **El precio real es el soporte**: cada club llamará a Joan. Con 2-3 clubes
  amigos, va bien; con 10, es un trabajo.

## Camino 2 — SAAS MULTI-TENANT (solo con demanda real, 10+ clubes)

**Un despliegue, una base, `club_id` en todas partes.** Es OTRO proyecto, del
tamaño de todo lo construido hasta ahora:

- `club_id` en cada tabla y **reescritura de las 63 policies** — el trabajo
  delicado de verdad: un descuido y un club ve datos de otro (la lección de la
  0024, a escala catastrófica). Exigiría una suite de tests adversariales
  cruzando clubes antes de dar de alta al segundo.
- **Identidad**: hoy cuenta ↔ ficha del club (1:1). Con varios clubes: ¿puede
  una persona estar en dos? (pasa de verdad: fichas federadas cambian de club).
  Rediseño de profiles/roles.
- **Subdominios** (`fomentogandia.laapp.es`) con branding por club, web pública
  por club y una landing comercial.
- **De gratis a pagar**: las capas gratuitas compartidas revientan enseguida
  (200 conexiones en vivo ≈ 4-5 clubes conectados a la vez; Gemini free ya se
  queda corto con uno). Supabase Pro + Vercel Pro + Gemini de pago ⇒ hace falta
  COBRAR a los clubes ⇒ facturación, alta/baja, soporte con expectativas.
- **Legal**: fotos y datos de socios (menores incluidos, que en ajedrez hay
  muchos) de N clubes bajo un solo responsable ⇒ RGPD en serio, encargado de
  tratamiento, consentimientos, retención y backups con compromiso.

## La frontera que no depende de nosotros

Los importadores (orden de fuerza, resultados, actas, ELO real) leen de la FACV
y de chess-results. **Sirven tal cual para cualquier club de la FACV** — cada
club tiene su id en of_publico y su grupo en el filtro del ranking. Fuera de la
Comunitat: otra federación = otras webs = importadores nuevos (capa de
adaptadores). El mercado natural del producto es "clubes de la FACV", que ya
son bastantes.

## Recomendación

1. **Hoy**: nada de multi-tenant. Solo higiene barata al tocar código: lo que
   huela a "Fomento" en duro, moverlo hacia configuración.
2. **Cuando llegue el primer club interesado**: camino 1 (franquicia). Media
   tarde de alta por club, coste cero, riesgo cero para nuestros datos. Con eso
   se aprende qué piden de verdad otros clubes ANTES de apostar.
3. **Solo si hay 10+ clubes pagando o dispuestos**: plantear el SaaS como
   proyecto propio, con presupuesto de tiempo, dinero y lo legal delante.

La trampa a evitar: meter `club_id` "por si acaso" ahora. Duplicaría el coste de
cada pantalla nueva durante meses para una demanda que aún no existe, y si el
SaaS llega, se hará mejor sabiendo lo aprendido de las franquicias.
