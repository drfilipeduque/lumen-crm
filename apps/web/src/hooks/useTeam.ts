import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { UserRole } from '../lib/auth';

export type TeamMember = {
  id: string;
  name: string;
  role: UserRole;
  avatar: string | null;
};

export function useTeam() {
  return useQuery({
    queryKey: ['team'],
    queryFn: async () => (await api.get<TeamMember[]>('/team')).data,
    staleTime: 60_000,
  });
}
