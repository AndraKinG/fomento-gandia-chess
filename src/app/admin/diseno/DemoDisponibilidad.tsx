"use client";
import { useState } from "react";
import { BotonesDisponibilidad } from "@/components/ui/BotonesDisponibilidad";

export function DemoDisponibilidad() {
  const [v, setV] = useState<"disponible" | "no_disponible" | "duda" | null>(null);
  return <BotonesDisponibilidad valor={v} onCambio={setV} />;
}
