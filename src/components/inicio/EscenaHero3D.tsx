"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import gsap from "gsap";
import {
  ALTURA_CAIDA,
  CAMPO_VISION,
  PLANO_FINAL,
  PLANO_INICIAL,
  PLANO_MEDIO,
  retrasoDeCaida,
  EASE_CAIDA,
  planoQueEncuadra,
} from "@/lib/inicio/coreografia";
import { PERFILES, type TipoPieza } from "@/lib/inicio/piezas3d";

const JUEGO = "celtic";
const COLOR = { w: "#e9dfc9", b: "#26313f" } as const;

/** La posición inicial, fila a fila. */
const ORDEN = ["R", "N", "B", "Q", "K", "B", "N", "R"] as const;
type Colocada = { id: string; tipo: TipoPieza | "N"; bando: "w" | "b"; x: number; z: number; retraso: number };

const PIEZAS: Colocada[] = [8, 7, 2, 1].flatMap((fila) => {
  const bando: "w" | "b" = fila >= 7 ? "b" : "w";
  const tipos = fila === 7 || fila === 2 ? Array(8).fill("P") : [...ORDEN];
  return tipos.map((tipo, columna) => ({
    id: `${bando}${tipo}-${fila}-${columna}`,
    tipo: tipo as TipoPieza | "N",
    bando,
    // El tablero va centrado en el origen: la fila 1 (blancas) queda hacia la cámara.
    x: columna - 3.5,
    z: 4.5 - fila,
    retraso: retrasoDeCaida(columna, fila),
  }));
});

/** Torneado: el perfil girado sobre su eje, que es como se hace una pieza de verdad. */
function geometriaTorneada(tipo: TipoPieza): THREE.LatheGeometry {
  const puntos = PERFILES[tipo].map((p) => new THREE.Vector2(p.radio, p.altura));
  const geo = new THREE.LatheGeometry(puntos, 48);
  geo.computeVertexNormals();
  return geo;
}

/**
 * El caballo, que NO se puede tornear: no es un sólido de revolución. Sale de la silueta
 * del SVG extruida y puesta de perfil, que además es como se mira un caballo de ajedrez.
 */
function useGeometriaCaballo(): THREE.ExtrudeGeometry | null {
  const cargado = useLoader(SVGLoader, `/piezas/${JUEGO}/wN.svg`);
  return useMemo(() => {
    const shapes = cargado.paths.flatMap((p) => SVGLoader.createShapes(p));
    if (shapes.length === 0) return null;
    const geo = new THREE.ExtrudeGeometry(shapes, {
      // GRUESO DE VERDAD. Estaba en 120 sobre 933 de alto: una lámina de un octavo del
      // tamaño de la pieza, y en pantalla se veía eso — un caballo de papel entre piezas
      // torneadas. 520 lo deja del ancho de una pieza de verdad.
      depth: 520,
      bevelEnabled: true,
      bevelThickness: 26,
      bevelSize: 18,
      bevelSegments: 3,
    });
    // El SVG mide 933 de alto y tiene la Y hacia abajo; se lleva a la altura de un alfil
    // y se apoya en su base.
    const escala = 0.78 / 933;
    geo.scale(escala, -escala, escala);
    geo.computeBoundingBox();
    const c = geo.boundingBox!;
    geo.translate(-(c.min.x + c.max.x) / 2, -c.min.y, -(c.min.z + c.max.z) / 2);
    geo.computeVertexNormals();
    return geo;
  }, [cargado]);
}

/** El damero, dibujado en un canvas y pegado a un plano. */
function useTexturaTablero(): THREE.CanvasTexture {
  return useMemo(() => {
    const lienzo = document.createElement("canvas");
    lienzo.width = lienzo.height = 1024;
    const ctx = lienzo.getContext("2d")!;
    const lado = 1024 / 8;
    for (let f = 0; f < 8; f++) {
      for (let c = 0; c < 8; c++) {
        ctx.fillStyle = (f + c) % 2 === 0 ? "#dce7f2" : "#42688c";
        ctx.fillRect(c * lado, f * lado, lado, lado);
      }
    }
    // LA VETA. Un damero de color plano se lee como un dibujo; unas rayas finas y
    // desiguales bastan para que se lea como una superficie con material. Es el mismo
    // truco que el grano de una foto: la irregularidad es lo que dice "esto es real".
    ctx.globalAlpha = 0.055;
    ctx.strokeStyle = "#000";
    // CON SEMILLA FIJA y no con `Math.random()`, por dos motivos: el compilador de React
    // no admite funciones impuras durante el pintado, y además así la veta es la MISMA en
    // cada carga — un tablero que cambia de grano al recargar se nota, aunque nadie sepa
    // decir por qué.
    let semilla = 20260814;
    const azar = () => {
      semilla = (semilla * 1103515245 + 12345) % 2147483648;
      return semilla / 2147483648;
    };
    for (let i = 0; i < 420; i++) {
      const y = azar() * 1024;
      ctx.lineWidth = 0.5 + azar() * 1.6;
      ctx.beginPath();
      ctx.moveTo(0, y);
      // Ligeramente ondulada: una veta recta parece una raya impresa.
      ctx.bezierCurveTo(340, y + (azar() - 0.5) * 7, 680, y + (azar() - 0.5) * 7, 1024, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const t = new THREE.CanvasTexture(lienzo);
    t.colorSpace = THREE.SRGBColorSpace;
    // Sin anisotropía, las casillas del fondo se convierten en papilla al verse en
    // escorzo, que es justo el plano medio de la animación.
    t.anisotropy = 8;
    return t;
  }, []);
}

/**
 * Los tres actos, en una línea de tiempo.
 *
 * ES UNA COREOGRAFÍA, no un bucle: empieza, pasa y termina en el cenital, que es donde se
 * queda. Los números —dónde está la cámara en cada acto y cuándo cae cada pieza— viven en
 * `lib/inicio/coreografia.ts` y tienen tests: que el tablero quepa en cuadro y que la
 * cámara no acabe entre las piezas son las dos cosas que salieron mal en los intentos
 * anteriores, y ahora se comprueban sin abrir el navegador.
 */
function Coreografia({
  piezas,
  quieto,
}: {
  piezas: React.RefObject<(THREE.Group | null)[]>;
  quieto: boolean;
}) {

  // EL ENCUADRE SE CALCULA CON LA PROPORCIÓN REAL DE LA VENTANA, no se fija a ojo. Es
  // lo que arregla el corte de abajo de una vez: la distancia sale de proyectar las
  // cuatro esquinas del tablero (ver `planoQueEncuadra`), y en un móvil vertical la
  // cámara se aleja más porque ahí aprieta el ancho y no el alto. Con una distancia
  // fija, o el tablero sale diminuto en el monitor o se sale por los lados en el
  // teléfono.
  const { size } = useThree();
  const aspecto = size.width / Math.max(1, size.height);
  const planoMedio = useMemo(() => planoQueEncuadra(PLANO_MEDIO, aspecto, 0.86, undefined, true), [aspecto]);
  const planoFinal = useMemo(() => planoQueEncuadra(PLANO_FINAL, aspecto, 0.94, undefined, true), [aspecto]);
  const linea = useRef<gsap.core.Timeline | null>(null);

  const camara = useRef({
    x: PLANO_INICIAL.posicion[0],
    y: PLANO_INICIAL.posicion[1],
    z: PLANO_INICIAL.posicion[2],
    mx: PLANO_INICIAL.objetivo[0],
    my: PLANO_INICIAL.objetivo[1],
    mz: PLANO_INICIAL.objetivo[2],
  });

  // MUTACIÓN IMPERATIVA A PROPÓSITO, y por eso se apaga la regla aquí. Este componente
  // no pinta nada: mueve objetos de Three.js —la cámara y la posición de cada pieza—
  // desde una línea de tiempo de GSAP. El compilador de React prohíbe mutar valores
  // vivos después de pintar, y tiene razón en un componente normal; aquí la mutación ES
  // el trabajo, y la alternativa sería copiar la escena a estado de React y
  // sincronizarla sesenta veces por segundo: más código y peor.
  // eslint-disable-next-line react-hooks/immutability
  useEffect(() => {
    // SIN ALIAS del ref: el compilador de React no deja mutar una variable local
    // capturada después de pintar, y `const c = camara.current` es exactamente eso.
    // Se toca `camara.current` en su sitio, que además deja claro que es estado vivo.
    if (quieto) {
      // Sin animación se entrega el plano final directamente: el tablero puesto, visto
      // desde arriba. La información sin el espectáculo.
      camara.current.x = planoFinal.posicion[0];
      camara.current.y = planoFinal.posicion[1];
      camara.current.z = planoFinal.posicion[2];
      camara.current.mx = planoFinal.objetivo[0];
      camara.current.my = planoFinal.objetivo[1];
      camara.current.mz = planoFinal.objetivo[2];
      // Las piezas, directamente en su sitio: sin animación no hay caída que animar.
      // eslint-disable-next-line react-hooks/immutability
      for (const g of piezas.current ?? []) if (g) g.position.y = 0;
      return;
    }

    const tl = gsap.timeline();

    // ACTO 1: la cámara va hacia atrás y aparece el tablero.
    tl.to(camara.current, {
      x: planoMedio.posicion[0], y: planoMedio.posicion[1], z: planoMedio.posicion[2],
      my: planoMedio.objetivo[1],
      duration: 2.2,
      ease: "power2.inOut",
    });

    // ACTO 2: las piezas caen. Empieza ANTES de que la cámara termine de retroceder
    // (el `-=1.1`): los planos de cine se solapan, y esperar a que un movimiento acabe
    // para empezar el siguiente es lo que hace que una animación parezca una lista de
    // pasos en vez de una escena.
    (piezas.current ?? []).forEach((grupo, i) => {
      if (!grupo) return;
      tl.fromTo(
        grupo.position,
        { y: ALTURA_CAIDA },
        {
          y: 0,
          duration: 1.5,
          // NADA DE EASES QUE SE PASAN DEL DESTINO, y esto es lo que fallaba: `back.out`
          // rebasa el valor final y vuelve. Como el valor final es la SUPERFICIE del
          // tablero, "pasarse" significa meterse dentro — el propietario lo describió
          // exactamente así, "se comen un poco el tablero y luego se ponen bien".
          // `bounce.out` tenía el mismo problema y encima botaba.
          //
          // `power3.out` solo frena: la pieza baja deprisa, desacelera y se para EN el
          // tablero, sin atravesarlo nunca. Es además lo que hace una pieza de verdad
          // cuando la posas.
          ease: EASE_CAIDA,
        },
        1.1 + PIEZAS[i].retraso
      );
    });

    // ACTO 3: a cenital, cuando ya han caído todas.
    tl.to(
      camara.current,
      {
        x: planoFinal.posicion[0], y: planoFinal.posicion[1], z: planoFinal.posicion[2],
        my: planoFinal.objetivo[1],
        duration: 2.6,
        ease: "power2.inOut",
      },
      "+=0.5"
    );

    linea.current = tl;
    return () => {
      tl.kill();
      linea.current = null;
    };
    // `planoMedio`/`planoFinal` NO van en las dependencias a propósito: cambian con cada
    // redimensionado —y en un móvil eso pasa solo con esconder la barra del navegador—,
    // y rehacer la línea de tiempo reiniciaría la animación entera cada vez. El
    // reencuadre en caliente lo hace el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piezas, quieto]);

  // REENCUADRE AL REDIMENSIONAR, pero solo cuando la coreografía YA ha terminado: durante
  // la animación manda la línea de tiempo, y dos cosas moviendo la cámara a la vez es un
  // tirón asegurado.
  useEffect(() => {
    if (quieto) return;
    const tl = linea.current;
    if (!tl || tl.progress() < 1) return;
    gsap.to(camara.current, {
      x: planoFinal.posicion[0], y: planoFinal.posicion[1], z: planoFinal.posicion[2],
      my: planoFinal.objetivo[1],
      duration: 0.5,
      ease: "power2.out",
    });
  }, [planoFinal, quieto]);

  useFrame((estado) => {
    const { x, y, z, mx, my, mz } = camara.current;
    estado.camera.position.set(x, y, z);
    estado.camera.lookAt(mx, my, mz);
  });

  return null;
}

function Escena({ quieto }: { quieto: boolean }) {
  const textura = useTexturaTablero();
  const caballo = useGeometriaCaballo();
  const grupos = useRef<(THREE.Group | null)[]>([]);

  const torneadas = useMemo(() => {
    const m = new Map<TipoPieza, THREE.LatheGeometry>();
    for (const t of ["P", "R", "B", "Q", "K"] as TipoPieza[]) m.set(t, geometriaTorneada(t));
    return m;
  }, []);

  return (
    <>
      <hemisphereLight args={["#d8e8f7", "#0a1826", 0.9]} />
      {/* La luz que manda: alta y de lado, como la lámpara de una mesa de club. Es la
          que dibuja las sombras largas y la que da el volumen. */}
      <directionalLight
        position={[-6, 10, 5]}
        intensity={2.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
      />
      {/* Contraluz: separa las piezas oscuras del fondo oscuro. */}
      <directionalLight position={[6, 4, -7]} intensity={0.8} color="#8fc0ea" />

      {/* EL TABLERO CON GROSOR Y MARCO. Un plano sin canto se lee como una imagen
          pegada al suelo; una caja con su marco de madera alrededor se lee como un
          objeto que está encima de una mesa. Es de lo que más cambia la sensación de
          realidad, y cuesta dos mallas. */}
      <mesh position={[0, -0.13, 0]} receiveShadow castShadow>
        <boxGeometry args={[9.1, 0.26, 9.1]} />
        <meshStandardMaterial color="#3d2f22" roughness={0.7} metalness={0.02} />
      </mesh>
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial map={textura} roughness={0.62} metalness={0.02} />
      </mesh>

      {PIEZAS.map((p, i) => {
        const geo = p.tipo === "N" ? caballo : torneadas.get(p.tipo);
        if (!geo) return null;
        return (
          <group
            key={p.id}
            ref={(el) => {
              grupos.current[i] = el;
            }}
            position={[p.x, quieto ? 0 : ALTURA_CAIDA, p.z]}
          >
            <mesh
              geometry={geo}
              castShadow
              receiveShadow
              // Las negras miran a las blancas: un caballo de perfil tiene que mirar al
              // rival, no al mismo lado que el de enfrente.
              rotation={[0, p.bando === "b" ? Math.PI : 0, 0]}
            >
              {/* `meshPhysicalMaterial` con `clearcoat`: una capa de barniz por encima
                  del color, que es exactamente lo que tiene una pieza de ajedrez de
                  verdad. El brillo especular que aporta es lo que separa "madera
                  barnizada" de "plástico mate", y desde arriba —donde acaba el plano—
                  es lo único que da relieve a los anillos del torneado. */}
              <meshPhysicalMaterial
                color={COLOR[p.bando]}
                roughness={p.bando === "w" ? 0.38 : 0.44}
                metalness={0.02}
                clearcoat={0.6}
                clearcoatRoughness={0.32}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        );
      })}

      <Coreografia piezas={grupos} quieto={quieto} />
      <fog attach="fog" args={["#081726", 12, 26]} />
    </>
  );
}

/**
 * El hero: la cámara retrocede, las piezas caen y todo acaba en vista cenital.
 *
 * EL PLANO LO PIDIÓ EL PROPIETARIO con esas palabras, y esa es la diferencia con los
 * cuatro intentos anteriores: un plano descrito se puede construir con números y probar
 * sin verlo, mientras que "que quede como Apple" no. Los números están en
 * `lib/inicio/coreografia.ts`, con tests.
 *
 * LAS PIEZAS VAN TORNEADAS (`lib/inicio/piezas3d.ts`): un perfil girado sobre su eje, que
 * es como se fabrica una pieza de ajedrez. El intento anterior extruía la silueta plana
 * del SVG y en pantalla se veía lo que era, cartón recortado. El caballo es la excepción
 * —no es un sólido de revolución— y ese sí sale de la silueta, puesta de perfil.
 *
 * FONDO OSCURO Y PROPIO, no el degradado del club: con el degradado claro por detrás las
 * piezas no se recortaban y la escena se veía lavada.
 */
export function EscenaHero3D({ quieto = false }: { quieto?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 bg-[#081726]">
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: PLANO_INICIAL.posicion, fov: CAMPO_VISION }}
        gl={{ antialias: true }}
      >
        <Suspense fallback={null}>
          <Escena quieto={quieto} />
        </Suspense>
      </Canvas>
    </div>
  );
}
