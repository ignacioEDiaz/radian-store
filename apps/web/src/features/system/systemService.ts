import { healthReportSchema, type HealthReport } from '@radian/contracts';
import { httpClient } from '../../shared/api/httpClient';

export const systemService = {
  /** /health/ready responde 503 con un reporte válido cuando algo está caído. */
  getHealth: (): Promise<HealthReport> =>
    httpClient.get('/health/ready', { schema: healthReportSchema, acceptStatus: [503], timeoutMs: 5000 }),
};
