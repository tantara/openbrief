import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { oAuthProxy } from "better-auth/plugins";

import { db } from "@acme/db/client";

export function initAuth<
  TExtraPlugins extends BetterAuthPlugin[] = [],
>(options: {
  baseUrl: string;
  productionUrl: string;
  secret: string | undefined;

  discordClientId: string | undefined;
  discordClientSecret: string | undefined;
  githubClientId?: string | undefined;
  githubClientSecret?: string | undefined;
  googleClientId?: string | undefined;
  googleClientSecret?: string | undefined;
  appleClientId?: string | undefined;
  appleClientSecret?: string | undefined;
  extraPlugins?: TExtraPlugins;
}) {
  const socialProviders = createSocialProviders(options);

  const config = {
    database: drizzleAdapter(db, {
      provider: "pg",
    }),
    baseURL: options.baseUrl,
    secret: options.secret,
    plugins: [
      oAuthProxy({
        productionURL: options.productionUrl,
      }),
      expo(),
      ...(options.extraPlugins ?? []),
    ],
    ...(socialProviders ? { socialProviders } : {}),
    trustedOrigins: ["expo://"],
    onAPIError: {
      onError(error, ctx) {
        console.error("BETTER AUTH API ERROR", error, ctx);
      },
    },
  } satisfies BetterAuthOptions;

  return betterAuth(config);
}

export type Auth = ReturnType<typeof initAuth>;
export type Session = Auth["$Infer"]["Session"];

function createSocialProviders(options: {
  productionUrl: string;
  discordClientId: string | undefined;
  discordClientSecret: string | undefined;
  githubClientId?: string | undefined;
  githubClientSecret?: string | undefined;
  googleClientId?: string | undefined;
  googleClientSecret?: string | undefined;
  appleClientId?: string | undefined;
  appleClientSecret?: string | undefined;
}) {
  const providers: Record<
    string,
    { clientId: string; clientSecret: string; redirectURI: string }
  > = {};

  addProvider(providers, "discord", options.productionUrl, {
    clientId: options.discordClientId,
    clientSecret: options.discordClientSecret,
  });
  addProvider(providers, "github", options.productionUrl, {
    clientId: options.githubClientId,
    clientSecret: options.githubClientSecret,
  });
  addProvider(providers, "google", options.productionUrl, {
    clientId: options.googleClientId,
    clientSecret: options.googleClientSecret,
  });
  addProvider(providers, "apple", options.productionUrl, {
    clientId: options.appleClientId,
    clientSecret: options.appleClientSecret,
  });

  return Object.keys(providers).length > 0 ? providers : undefined;
}

function addProvider(
  providers: Record<
    string,
    { clientId: string; clientSecret: string; redirectURI: string }
  >,
  provider: "discord" | "github" | "google" | "apple",
  productionUrl: string,
  config: { clientId: string | undefined; clientSecret: string | undefined },
) {
  if (!config.clientId || !config.clientSecret) return;
  providers[provider] = {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectURI: `${productionUrl}/api/auth/callback/${provider}`,
  };
}
