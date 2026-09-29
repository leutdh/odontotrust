'use client';

import { useQuery } from '@tanstack/react-query';
import type {
  BloqueoDto,
  PacienteListItem,
  Page,
  ProfesionalDto,
  SillonDto,
  TipoTratamientoDto,
  TurnoDto,
} from '@odontotrust/shared';
import { api } from '@/lib/api-client';

const STATIC = 5 * 60_000; // catalog data changes rarely

export const useProfesionales = () =>
  useQuery({ queryKey: ['profesionales'], queryFn: () => api<ProfesionalDto[]>('/profesionales'), staleTime: STATIC });

export const useSillones = () =>
  useQuery({ queryKey: ['sillones'], queryFn: () => api<SillonDto[]>('/sillones'), staleTime: STATIC });

export const useTipos = () =>
  useQuery({ queryKey: ['tipos'], queryFn: () => api<TipoTratamientoDto[]>('/tipos-tratamiento'), staleTime: STATIC });

export const turnosKey = (desde: string, hasta: string) => ['turnos', desde, hasta] as const;
export const bloqueosKey = (desde: string, hasta: string) => ['bloqueos', desde, hasta] as const;

export const useTurnos = (desde: string, hasta: string) =>
  useQuery({
    queryKey: turnosKey(desde, hasta),
    queryFn: () => api<TurnoDto[]>(`/turnos?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`),
  });

export const useBloqueos = (desde: string, hasta: string) =>
  useQuery({
    queryKey: bloqueosKey(desde, hasta),
    queryFn: () => api<BloqueoDto[]>(`/bloqueos?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`),
  });

export const usePacienteSearch = (q: string) =>
  useQuery({
    queryKey: ['pacientes-search', q],
    queryFn: () => api<Page<PacienteListItem>>(`/pacientes?limit=8&q=${encodeURIComponent(q)}`),
    staleTime: 30_000,
  });
