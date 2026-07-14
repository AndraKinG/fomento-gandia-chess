import Link from "next/link";

export default function AdminPage() {
  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-bold">Administración</h1>
      <nav className="mt-4 flex flex-col gap-2">
        <Link className="rounded border p-3" href="/admin/orden-fuerza">
          Orden de fuerza
        </Link>
        <Link className="rounded border p-3" href="/admin/vinculaciones">
          Vinculaciones pendientes
        </Link>
        <Link className="rounded border p-3" href="/admin/elo">
          Actualización de ELO
        </Link>
        <Link className="rounded border p-3" href="/admin/push">
          Notificaciones push
        </Link>
      </nav>
    </main>
  );
}
