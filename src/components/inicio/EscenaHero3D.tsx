"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import gsap from "gsap";
import {
  ALTURA_CAIDA,
  CAMPO_VISION,
  PLANO_CENITAL,
  PLANO_INICIAL,
  PLANO_MEDIO,
  retrasoDeCaida,
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
      depth: 120,
      bevelEnabled: true,
      bevelThickness: 18,
      bevelSize: 12,
      bevelSegments: 2,
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
      camara.current.x = PLANO_CENITAL.posicion[0];
      camara.current.y = PLANO_CENITAL.posicion[1];
      camara.current.z = PLANO_CENITAL.posicion[2];
      camara.current.mx = PLANO_CENITAL.objetivo[0];
      camara.current.my = PLANO_CENITAL.objetivo[1];
      camara.current.mz = PLANO_CENITAL.objetivo[2];
      // Las piezas, directamente en su sitio: sin animación no hay caída que animar.
      // eslint-disable-next-line react-hooks/immutability
      for (const g of piezas.current ?? []) if (g) g.position.y = 0;
      return;
    }

    const tl = gsap.timeline();

    // ACTO 1: la cámara va hacia atrás y aparece el tablero.
    tl.to(camara.current, {
      x: PLANO_MEDIO.posicion[0], y: PLANO_MEDIO.posicion[1], z: PLANO_MEDIO.posicion[2],
      my: PLANO_MEDIO.objetivo[1],
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
          duration: 0.75,
          // Rebote seco al aterrizar: una pieza de madera sobre un tablero no frena
          // suave, da un golpe.
          ease: "bounce.out",
        },
        1.1 + PIEZAS[i].retraso
      );
    });

    // ACTO 3: a cenital, cuando ya han caído todas.
    tl.to(
      camara.current,
      {
        x: PLANO_CENITAL.posicion[0], y: PLANO_CENITAL.posicion[1], z: PLANO_CENITAL.posicion[2],
        my: PLANO_CENITAL.objetivo[1],
        duration: 2.6,
        ease: "power2.inOut",
      },
      "+=0.5"
    );

    return () => {
      tl.kill();
    };
  }, [piezas, quieto]);

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

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial map={textura} roughness={0.8} metalness={0} />
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
              <meshStandardMaterial
                color={COLOR[p.bando]}
                roughness={0.55}
                metalness={0.05}
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
