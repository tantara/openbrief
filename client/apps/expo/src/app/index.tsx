import type { Href } from "expo-router";
import { useMemo } from "react";
import { Pressable, Text, useColorScheme, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, Stack } from "expo-router";

import { getNativeThemeTokens } from "@acme/ui/color-theme";

import { authClient } from "~/utils/auth";

const authProviders = [
  { id: "discord", label: "Discord" },
  { id: "github", label: "GitHub" },
  { id: "google", label: "Google" },
  { id: "apple", label: "Apple" },
] as const;

export default function Index() {
  const colorScheme = useColorScheme();
  const tokens = useMemo(
    () =>
      getNativeThemeTokens(colorScheme === "dark" ? "dark" : "light", "green"),
    [colorScheme],
  );
  const { data: session } = authClient.useSession();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.background }}>
      <Stack.Screen options={{ title: "OpenBrief" }} />
      <View style={{ flex: 1, gap: 24, padding: 20 }}>
        <View style={{ gap: 8 }}>
          <Text
            style={{
              color: tokens.foreground,
              fontSize: 30,
              fontWeight: "700",
              letterSpacing: 0,
            }}
          >
            Briefs
          </Text>
          <Text style={{ color: tokens.mutedForeground, fontSize: 16 }}>
            Imported OpenBrief bundles from desktop will appear here.
          </Text>
        </View>

        <View
          style={{
            gap: 12,
            borderColor: tokens.border,
            borderWidth: 1,
            borderRadius: 8,
            padding: 16,
            backgroundColor: tokens.card,
          }}
        >
          <Text
            style={{
              color: tokens.cardForeground,
              fontSize: 18,
              fontWeight: "600",
            }}
          >
            No imported briefs
          </Text>
          <Text style={{ color: tokens.mutedForeground, lineHeight: 20 }}>
            Scan a share QR from OpenBrief desktop to import summaries,
            transcripts, chat history, audio, and PDFs without transferring raw
            YouTube videos.
          </Text>
          <Link href={"/share/scan" as Href} asChild>
            <Pressable
              style={{
                alignItems: "center",
                borderRadius: 6,
                backgroundColor: tokens.primary,
                paddingVertical: 12,
              }}
            >
              <Text
                style={{ color: tokens.primaryForeground, fontWeight: "700" }}
              >
                Scan share QR
              </Text>
            </Pressable>
          </Link>
        </View>

        <View style={{ gap: 12 }}>
          <Text
            style={{
              color: tokens.foreground,
              fontSize: 18,
              fontWeight: "600",
            }}
          >
            Account
          </Text>
          {session?.user ? (
            <Pressable
              onPress={() => authClient.signOut()}
              style={{
                borderColor: tokens.border,
                borderWidth: 1,
                borderRadius: 6,
                padding: 12,
              }}
            >
              <Text style={{ color: tokens.foreground }}>
                Sign out {session.user.email}
              </Text>
            </Pressable>
          ) : (
            <View style={{ gap: 8 }}>
              {authProviders.map((provider) => (
                <Pressable
                  key={provider.id}
                  onPress={() =>
                    authClient.signIn.social({
                      provider: provider.id,
                      callbackURL: "/",
                    })
                  }
                  style={{
                    borderColor: tokens.border,
                    borderWidth: 1,
                    borderRadius: 6,
                    padding: 12,
                    backgroundColor: tokens.card,
                  }}
                >
                  <Text style={{ color: tokens.foreground, fontWeight: "600" }}>
                    Continue with {provider.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <Link href={"/feedback" as Href} asChild>
          <Pressable>
            <Text style={{ color: tokens.accentForeground, fontWeight: "600" }}>
              Send feedback
            </Text>
          </Pressable>
        </Link>
      </View>
    </SafeAreaView>
  );
}
