import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../shared/api/queryKeys';
import { systemService } from './systemService';

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.system.health,
    queryFn: systemService.getHealth,
    refetchInterval: 5000,
    staleTime: 0,
  });
}
