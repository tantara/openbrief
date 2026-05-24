import { authRouter } from "./router/auth";
import { feedbackRouter } from "./router/feedback";
import { postRouter } from "./router/post";
import { shareRouter } from "./router/share";
import { youtubeRouter } from "./router/youtube";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  feedback: feedbackRouter,
  post: postRouter,
  share: shareRouter,
  youtube: youtubeRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
