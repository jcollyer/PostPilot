import { router } from './trpc';
import { userRouter } from './routers/user';
import { connectionsRouter } from './routers/connections';
import { mediaRouter } from './routers/media';

export const appRouter = router({
  user: userRouter,
  connections: connectionsRouter,
  media: mediaRouter,
});

export type AppRouter = typeof appRouter;

export { createTRPCContext } from './context';
export type { Context, SessionLike, CreateContextOptions } from './context';
export { createCallerFactory } from './trpc';
