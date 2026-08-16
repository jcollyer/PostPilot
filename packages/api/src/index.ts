import { router } from './trpc';
import { userRouter } from './routers/user';
import { connectionsRouter } from './routers/connections';
import { mediaRouter } from './routers/media';
import { folderRouter } from './routers/folder';
import { queueRouter } from './routers/queue';
import { notificationsRouter } from './routers/notifications';
import { dashboardRouter } from './routers/dashboard';
import { creatorProfileRouter } from './routers/creator-profile';
import { usageRouter } from './routers/usage';
import { billingRouter } from './routers/billing';

export const appRouter = router({
  user: userRouter,
  connections: connectionsRouter,
  media: mediaRouter,
  folder: folderRouter,
  queue: queueRouter,
  notifications: notificationsRouter,
  dashboard: dashboardRouter,
  creatorProfile: creatorProfileRouter,
  usage: usageRouter,
  billing: billingRouter,
});

export type AppRouter = typeof appRouter;

export { createTRPCContext } from './context';
export type { Context, SessionLike, CreateContextOptions } from './context';
export { createCallerFactory } from './trpc';
