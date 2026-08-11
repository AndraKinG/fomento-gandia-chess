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

---

# ¿Es rentable? (análisis del 2026-08-12, a petición del propietario)

**No lo he preguntado por encima: los números están medidos.** Y la conclusión es
que como negocio de suscripción NO sale, pero hay dos formas en las que esto sí
vale dinero.

## El mercado, medido

**114 clubes** en el desplegable de la FACV (contado ese día contra su web).
Realistamente activos y con Interclubs, menos: pongamos 60-80. De esos, los que
tendrían a alguien capaz de mantener la ilusión de usar una app nueva: menos aún.

**Cuánto puede pagar un club de ajedrez**: son asociaciones sin ánimo de lucro
con presupuestos de 2.000-10.000 €/año, casi todo de cuotas de socio (30-60 €) y
alguna subvención municipal. Las licencias federativas se llevan la mayor parte.
**El software no está en su presupuesto**: hoy tiran de WhatsApp, Excel y un
Wordpress gratis, y les funciona "suficientemente bien".

Tarifa creíble: **10-25 €/mes** por club (120-300 €/año). Por encima de eso, la
junta dice no sin pensarlo.

## Los costes, en serio

| Concepto | Coste anual |
| --- | --- |
| Supabase Pro (25 $/mes) | ~300 € |
| Vercel Pro (20 $/mes) | ~240 € |
| Gemini de pago (uso real bajo) | 100-250 € |
| Dominio | ~15 € |
| **Infraestructura** | **~700-800 €** |
| **Cuota de autónomos**, 1er año (tarifa plana ~80 €/mes) | **~960 €** |
| **Cuota de autónomos**, después (tramo mínimo) | **~2.400-2.800 €** |
| Gestor (opcional pero recomendable) | 300-600 € |

**Ahí está el problema, y es aritmética simple**: pasado el primer año, la cuota
de autónomos sola (~2.500 €) exige **más de 12 clubes pagando 200 €/año** solo
para no perder dinero. Sumando infraestructura y gestor: **~20 clubes para
empezar a ganar algo**. Eso es una cuarta parte de todos los clubes activos de
la Comunitat — una cuota de mercado que ni el software bueno consigue.

Y falta el coste que no se factura: **el soporte**. Con 20 clubes, cada juntero
llama a Joan. Dos-cuatro horas semanales de atender gente ⇒ el "beneficio" se
convierte en un sueldo por debajo del mínimo.

## Donde SÍ hay dinero

1. **Vender a la FACV, no a los clubes.** Un cliente institucional, con
   presupuesto, que resuelve el problema de sus 114 clubes de golpe. Un contrato
   de 1.000-3.000 €/año (o un desarrollo cerrado a medida) sin infierno de
   soporte por club. **Es la única forma con forma de negocio de verdad**, y de
   paso la app ya habla su idioma: importa de su web y de chess-results.
2. **Como carta de presentación profesional.** Una PWA con tiempo real, IA,
   motor de ajedrez, RLS auditada y 750 tests, en producción y usada por gente
   real, vale más en una entrevista o para conseguir clientes de freelance que
   2.400 €/año de suscripciones. Ese es el retorno realista y ya está cobrado.
3. **Cobrar la instalación, no el uso.** En modo franquicia el club paga SUS
   cuentas (Supabase/Vercel gratis a su nombre) y Joan factura la puesta en
   marcha: 200-400 € una vez, sin compromiso recurrente ni soporte perpetuo.

## ¿Autónomo?

**Para 2-3 clubes amigos: no.** Es matar moscas a cañonazos — 2.500 €/año de
cuota para ingresar 600 €. Si son clubes conocidos, franquicia con cada uno en
sus propias cuentas gratuitas y sin cobrar: cero papeles, cero riesgo.

**Sí hace falta darse de alta** en cuanto haya facturación habitual (y para
facturar hay que estar de alta en Hacienda, modelo 036/037; la creencia de que
"por debajo del SMI no hace falta" NO es una regla legal fiable). Con la tarifa
plana de nuevo autónomo el primer año duele poco.

**Esto lo resuelve un gestor por 50-80 €** y con la respuesta exacta para el caso
concreto y el año en curso, que es lo que hay que hacer antes de facturar el
primer euro. Yo no soy asesor fiscal y los tramos cambian cada año.

## Dos cosas legales que revisar ANTES de cobrar a alguien

1. **Stockfish es GPLv3** y se sirve al navegador (eso es distribución). Hoy va
   como programa aparte, sin modificar, con su licencia al lado y hablándole por
   mensajes UCI — que es la postura defendible. Comercializar cambia el nivel de
   exigencia: hay que ofrecer su fuente y la licencia. **Pregunta para un abogado
   si se cobra.** (Las piezas SVG son MIT/Apache: sin problema comercial.)
2. **Datos de terceros.** Cobrando a otros clubes, Joan pasa a ser encargado de
   tratamiento de los datos de SUS socios —fotos y menores incluidos— con
   contrato de encargo, consentimientos y responsabilidad. Gratis y entre amigos
   es un favor; cobrando es una obligación con firma.

## Recomendación honesta

**No montes un SaaS de clubes de ajedrez.** El mercado es pequeño, pobre y con
alternativas gratuitas "suficientes", y la cuota de autónomos se come el margen
antes de empezar.

**Sí**: franquicia gratis a 2-3 clubes conocidos (coste cero, reputación, y
aprendes qué piden), y con eso en la mano **llamar a la FACV**. Si la federación
lo quiere, ahí hay un proyecto con dinero y un solo interlocutor. Y si no lo
quiere, has perdido una llamada y sigues teniendo la mejor pieza de portfolio que
un desarrollador junior puede llevar encima.

---

# Si la FACV dice sí: cómo sería de verdad (2026-08-12)

## La trampa de base, antes de negociar

**Lo que la FACV compraría NO es lo que hay hecho.** Ellos no quieren "la app del
Fomento": querrían algo para sus 114 clubes, y eso es el Camino 2 de este
documento — multi-tenant, `club_id`, las 63 policies reescritas. O sea: el trato
no es *vender lo que tengo*, es **cobrar por construir lo que no existe**.

Esto es bueno (te pagan el desarrollo) pero cambia la conversación entera: se
negocia un PROYECTO, no una licencia. Y hay que decirlo desde el primer día, o el
malentendido sale a la luz a mitad, cuando ya has trabajado gratis.

**Dato del terreno (medido el 2026-08-12)**: la FACV ya tiene desarrollo propio —
su zona `staff` es una app PHP con Bootstrap/jQuery, con sus herramientas de ELO,
ranking y orden de fuerza funcionando. Eso significa que **hay alguien ya
haciéndoles software**. Es competidor y es portero a la vez: cualquier propuesta
pasa por él, y conviene tenerlo de aliado (integrarse con lo suyo) y no de
enemigo (venir a sustituirlo).

## Las dos formas del trato

### A) Encargo de desarrollo (la buena)

Te pagan por construir la versión federativa. Precio como proyecto:

- Trabajo real: multi-tenant + panel de federación + alta de 114 clubes +
  migración de sus datos. **300-600 horas** para un junior por las tardes, o sea
  6-12 meses de calendario.
- Precio defendible: **8.000-15.000 €**. Para una federación autonómica (que
  mueve licencias de miles de federados) es una partida grande pero plausible; y
  por debajo de **15.000 €** es *contrato menor*, o sea adjudicación directa con
  factura, sin concurso. Justo por eso conviene quedarse por debajo.
- Cobro por hitos: **30 % al firmar / 40 % a mitad / 30 % a entrega**. Nunca todo
  al final: si el proyecto se muere por política interna, te quedas a medias pero
  pagado a medias.

### B) Servicio anual para todos los clubes (la peligrosa)

Cuota anual y tú mantienes infraestructura y soporte de 114 clubes.

- Precio mínimo sensato: **6.000 €/año**, y con **bolsa de horas de soporte
  topada** en el contrato.
- Por debajo de eso es una trampa: 114 clubes llamando es un trabajo a tiempo
  parcial sin sueldo. El error clásico es firmar 2.000 €/año "para empezar" con
  soporte ilimitado.

### La forma inteligente de empezar: PILOTO PAGADO

**2.000-3.000 € por un piloto de 3 clubes en 3 meses.** Reduce el riesgo para
ellos (no comprometen presupuesto grande) y para ti (no regalas 400 horas a un
proyecto que puede morir en una asamblea). Si el piloto va, el contrato grande se
negocia con datos y no con promesas.

## El dinero, con los números puestos

Escenario A, proyecto de 12.000 € en 8 meses:

| Concepto | Importe |
| --- | --- |
| Factura | 12.000 € |
| IVA 21 % (se cobra y se ingresa: no es tuyo) | +2.520 € a Hacienda |
| Retención IRPF en factura (7 % los 3 primeros años como nuevo profesional) | −840 € a cuenta |
| Cuota de autónomos, 8 meses con tarifa plana (~80 €/mes) | −640 € |
| Gestor (alta + trimestrales + renta) | −400 € |
| Infraestructura durante el desarrollo | −200 € |
| IRPF final estimado a ese nivel de ingresos | −1.200/1.800 € |
| **Neto aproximado** | **~8.500-9.500 €** |

Para ~400 horas eso son **21-24 €/hora netos**. Para un junior, en un proyecto
propio y por las tardes, es un buen número. Pero conviene llamarlo por su nombre:
es un **sueldo por trabajar mucho**, no un beneficio pasivo.

Escenario B encima (4.000 €/año de mantenimiento): quitando infraestructura
multi-tenant (500-1.500 €/año) quedan 2.000-3.000 € por atender a 114 clubes todo
el año. Eso solo sale a cuenta con las horas topadas por contrato.

## Lo legal, cláusula por cláusula

**Autónomo: sí, aquí es obligatorio.** Alta en Hacienda (036/037) y en RETA antes
de la primera factura. Tarifa plana de nuevo autónomo el primer año. IVA
trimestral (303) y anual (390); IRPF con retención en factura. **Nada de SL**:
constituirla cuesta ~3.000 € y más contabilidad, no tiene sentido para un
proyecto de 12.000 €.

El contrato, ordenado por lo que más dinero vale:

1. **PROPIEDAD INTELECTUAL.** Si la FACV pide *cesión en exclusiva de todos los
   derechos*, no podrás reutilizar tu propio código — ni para el Fomento, ni de
   portfolio, ni para otro cliente. Lo que hay que firmar es **licencia de uso**
   (perpetua, para ellos y sus clubes, irrevocable si hace falta) **manteniendo tú
   la titularidad**. Los juniors regalan esto gratis por no saber que se negocia.
   Si insisten en la cesión, eso **sube** el precio, no lo baja.
2. **Alcance cerrado con anexo funcional**: lista de qué entra. Sin ella, el "y ya
   que estás…" es infinito y gratis.
3. **Mantenimiento aparte del desarrollo**, con bolsa de horas y precio/hora de
   las extras.
4. **RGPD: contrato de encargo de tratamiento.** Pasas a tratar datos de miles de
   federados, **menores incluidos**: finalidades, medidas, subencargados
   (Supabase y Vercel están fuera de la UE, hacen falta cláusulas de
   transferencia), retención y borrado al terminar. No es opcional y es lo más
   serio de la lista.
5. **Stockfish es GPLv3**: si el motor va en la entrega, hay que darles aviso de
   licencia y acceso a su fuente. No bloquea nada — va como programa aparte y sin
   modificar — pero se documenta en el contrato.
6. **Responsabilidad limitada** al importe del contrato, sin penalizaciones
   abiertas. Valorar seguro de RC profesional (~200-400 €/año) si pasa de 10.000 €.
7. **Salida ordenada**: si mañana lo dejas, ellos se quedan con sus datos
   exportables y un periodo de transición pagado. Protege a los dos.

**Coste de hacerlo bien**: un abogado de IT revisando el contrato, **300-600 €**.
Sobre 12.000 € es un 4 % que evita perder la propiedad de dos años de trabajo.

## Los riesgos reales, dichos claro

- **Tiempos de federación**: asamblea, presupuesto, ciclo electoral. De "nos
  interesa" a firma pueden pasar **6-18 meses**. No dejes de hacer nada esperando.
- **Que se queden la idea**: enseñas la app, dicen "qué bien" y se lo encargan a
  su desarrollador de siempre. Mitigación: demo de lo que ya está en producción,
  **no entregar código ni documentos técnicos antes de firmar**, y si piden
  análisis previo, que sea pagado.
- **Cambio de junta** = proyecto muerto a mitad. De ahí los pagos por hitos.
- **El proyecto crece**: pedirán cosas suyas (licencias, arbitrajes, facturación a
  clubes) que no tienen nada que ver con esta app. Cada cosa nueva, presupuesto
  nuevo.

## Veredicto

**Sí generaría beneficio en la forma A y con el contrato bien hecho**: ~8.500-
9.500 € netos por un proyecto de 8 meses, más una referencia institucional que
vale mucho para lo siguiente. **No** en la forma B mal firmada: cuota baja con
soporte ilimitado para 114 clubes es la manera exacta de convertir un proyecto
bonito en un trabajo no pagado.

Y el orden correcto es este, nunca al revés: **franquicia gratis a 2-3 clubes →
piloto pagado con la FACV → contrato grande**.

_(Análisis de negocio, no asesoría fiscal ni jurídica: lo fiscal lo cierra un
gestor y el contrato un abogado de IT. Cuotas y tramos cambian cada año.)_
