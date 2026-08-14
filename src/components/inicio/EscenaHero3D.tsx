"use client";

import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import {
  bandoDe,
  COLOR_PIEZA,
  PIEZAS_HERO,
  spritesUnicos,
  type PiezaEscena,
} from "@/lib/inicio/escena3d";

const JUEGO = "celtic";
/** El SVG mide 933 unidades de alto; esto lo lleva a ~1,6 casillas de alto. */
const ESCALA = 1.6 / 933;

/**
 * Una pieza: la silueta del SVG, extruida y con volumen de verdad.
 *
 * DE DÓNDE SALE EL MATERIAL, que era el problema de fondo: no hay modelos 3D ni hay que
 * comprarlos. Se coge el MISMO SVG que usa la app para el tablero de los socios y se
 * extruye — una silueta plana pasa a ser una figura con grosor, cantos biselados y caras
 * que reciben luz. Queda como una pieza de madera cortada a láser, que es un estilo
 * honesto y coherente con el resto de la app, y no depende de la licencia de nadie.
 */
function Pieza({
  forma,
  pieza,
}: {
  forma: THREE.ExtrudeGeometry;
  pieza: PiezaEscena;
}) {
  const color = COLOR_PIEZA[bandoDe(pieza.sprite)];
  return (
    <mesh
      geometry={forma}
      position={[pieza.x, 0, pieza.z]}
      rotation={[0, pieza.giro, 0]}
      castShadow
      receiveShadow
    >
      {/* `roughness` alto y `metalness` cero: madera y marfil, no plástico ni metal. El
          bisel del extruido es lo que atrapa la luz en los cantos y da el volumen.

          `DoubleSide` ES UN SEGURO, no un capricho: al voltear la geometría en Y para
          pasar del sistema del SVG (Y hacia abajo) al de 3D, el orden de los vértices
          queda invertido y las caras pueden acabar mirando hacia dentro — una pieza
          invisible o con agujeros. Pintando las dos caras eso no puede pasar. */}
      <meshStandardMaterial
        color={color}
        roughness={0.62}
        metalness={0.04}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/**
 * Carga los SVG y los convierte en geometrías con volumen.
 *
 * UNA GEOMETRÍA POR SILUETA, no por pieza: los dos peones negros comparten la misma. Cada
 * extrusión cuesta parsear el SVG y triangular el contorno, así que repetirla por
 * instancia sería pagar el trabajo dos veces para el mismo resultado.
 */
function Piezas() {
  const rutas = spritesUnicos().map((s) => `/piezas/${JUEGO}/${s}.svg`);
  const cargados = useLoader(SVGLoader, rutas);

  const formas = useMemo(() => {
    const mapa = new Map<string, THREE.ExtrudeGeometry>();
    spritesUnicos().forEach((sprite, i) => {
      const datos = cargados[i];
      // Todas las subformas del SVG en una sola geometría: una pieza puede venir en
      // varios trazos (el corte de la corona, el ojo del caballo…).
      const shapes = datos.paths.flatMap((p) => SVGLoader.createShapes(p));
      const geo = new THREE.ExtrudeGeometry(shapes, {
        depth: 90,
        bevelEnabled: true,
        bevelThickness: 14,
        bevelSize: 10,
        bevelSegments: 3,
      });
      // El SVG tiene la Y hacia abajo y el origen arriba a la izquierda; en 3D la Y va
      // hacia arriba. Se voltea y se centra sobre su base, que es lo que la deja de pie
      // sobre el tablero en vez de hundida o flotando.
      geo.scale(ESCALA, -ESCALA, ESCALA);
      geo.computeBoundingBox();
      const caja = geo.boundingBox!;
      geo.translate(
        -(caja.min.x + caja.max.x) / 2,
        -caja.min.y,
        -(caja.min.z + caja.max.z) / 2
      );
      // De canto no se leería: se giran para mirar a la cámara, como una figura recortada
      // puesta de pie.
      geo.rotateY(0);
      geo.computeVertexNormals();
      mapa.set(sprite, geo);
    });
    return mapa;
  }, [cargados]);

  return (
    <>
      {PIEZAS_HERO.map((p) => {
        const forma = formas.get(p.sprite);
        return forma ? <Pieza key={p.id} forma={forma} pieza={p} /> : null;
      })}
    </>
  );
}

/** El tablero: un plano con la textura del damero dibujada en un canvas. */
function Tablero() {
  const textura = useMemo(() => {
    const lienzo = document.createElement("canvas");
    lienzo.width = 512;
    lienzo.height = 512;
    const ctx = lienzo.getContext("2d")!;
    const lado = 512 / 8;
    for (let f = 0; f < 8; f++) {
      for (let c = 0; c < 8; c++) {
        ctx.fillStyle = (f + c) % 2 === 0 ? "#e9f2fb" : "#5c8bb5";
        ctx.fillRect(c * lado, f * lado, lado, lado);
      }
    }
    const t = new THREE.CanvasTexture(lienzo);
    t.colorSpace = THREE.SRGBColorSpace;
    // Sin esto, las casillas del fondo se convierten en una papilla de píxeles al
    // verse en escorzo: la anisotropía es lo que las mantiene rectas hasta el horizonte.
    t.anisotropy = 8;
    return t;
  }, []);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1.2, 0, 0]} receiveShadow>
      <planeGeometry args={[8, 8]} />
      <meshStandardMaterial map={textura} roughness={0.85} metalness={0} />
    </mesh>
  );
}

/**
 * La cámara, que respira.
 *
 * Un vaivén de dos décimas de unidad en catorce segundos. No se mira, se siente: es lo
 * que separa una escena de una foto, y es lo que faltaba en la versión de CSS.
 */
function Camara() {
  const { current: origen } = useRef(new THREE.Vector3(1.1, 2.9, 6.2));
  useFrame((estado) => {
    const t = estado.clock.elapsedTime;
    estado.camera.position.x = origen.x + Math.sin(t * 0.18) * 0.35;
    estado.camera.position.y = origen.y + Math.sin(t * 0.13) * 0.12;
    estado.camera.lookAt(1.2, 0.45, 0);
  });
  return null;
}

/**
 * La escena 3D del hero: piezas con volumen, luz de verdad y sombras proyectadas.
 *
 * POR QUÉ 3D DE VERDAD Y NO MÁS CSS. Las versiones anteriores pintaban siluetas planas
 * con perspectiva calculada: por bien iluminadas que estén, una silueta plana nunca
 * parece madera, y el propietario lo dijo con todas las letras mirando el resultado. Lo
 * que faltaba no era técnica de animación, era MATERIAL. Aquí hay luz direccional con
 * sombras, un material con rugosidad y piezas con grosor y bisel: la luz hace el trabajo
 * que antes intentaban hacer tres degradados.
 *
 * POCAS PIEZAS Y GRANDES (ver `escena3d.ts`): ocho bien colocadas y cerca se leen; las
 * treinta y dos serían manchas de cuatro píxeles.
 *
 * SE PAGA EN PESO: Three.js son unos cientos de kilobytes. Va solo en la portada pública
 * y detrás de `Suspense`, así que el texto y los botones se pintan sin esperarlo.
 */
export function EscenaHero3D() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <Canvas
        shadows
        // Tope de resolución en 1,5: en un móvil con pantalla a 3x, renderizar a 3x
        // triplica el trabajo para una diferencia que no se ve en una escena borrosa.
        dpr={[1, 1.5]}
        camera={{ position: [1.1, 2.9, 6.2], fov: 34 }}
        gl={{ antialias: true, alpha: true }}
      >
        {/* Luz de relleno fría, para que las sombras no sean agujeros negros. */}
        <hemisphereLight args={["#cfe2f5", "#0b1f33", 1.1]} />
        {/* LA LUZ QUE MANDA: una sola, alta y de lado, como la lámpara de un club. Es la
            que dibuja las sombras largas y la que da el volumen. */}
        <directionalLight
          position={[-4, 7, 4]}
          intensity={2.4}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-8}
          shadow-camera-right={8}
          shadow-camera-top={8}
          shadow-camera-bottom={-8}
        />
        {/* Contraluz suave: separa las piezas oscuras del fondo oscuro. */}
        <directionalLight position={[5, 3, -6]} intensity={0.7} color="#7fb2e0" />

        <Suspense fallback={null}>
          <Tablero />
          <Piezas />
        </Suspense>
        <Camara />
        {/* Niebla del color del hero: funde el fondo del tablero con la cabecera, que es
            la versión 3D de la viñeta que tenía la escena de CSS. */}
        <fog attach="fog" args={["#0b1f33", 7, 15]} />
      </Canvas>
    </div>
  );
}
