import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@saas/api';

export const trpc: ReturnType<typeof createTRPCReact<AppRouter>> = createTRPCReact<AppRouter>();
