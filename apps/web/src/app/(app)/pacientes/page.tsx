import { PacientesList } from './pacientes-list';

export default function PacientesPage() {
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Pacientes</h1>
      <PacientesList />
    </main>
  );
}
