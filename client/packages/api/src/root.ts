import { authRouter } from "./router/auth";
import { feedbackRouter } from "./router/feedback";
import { postRouter } from "./router/post";
import { youtubeRouter } from "./router/youtube";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  feedback: feedbackRouter,
  post: postRouter,
  youtube: youtubeRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
