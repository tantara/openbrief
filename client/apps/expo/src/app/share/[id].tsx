import { useMemo } from "react";
import { Text, useColorScheme, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { getNativeThemeTokens } from "@acme/ui/color-theme";

import { trpc } from "~/utils/api";

export default function IncomingShareScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const tokens = useMemo(
    () =>
      getNativeThemeTokens(colorScheme === "dark" ? "dark" : "light", "green"),
    [colorScheme],
  );
  const share = useQuery(
    trpc.share.resolve.queryOptions(
      { slug: id },
      { enabled: Boolean(id) },
    ),
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.background }}>
      <Stack.Screen options={{ title: "Incoming Share" }} />
      <View style={{ gap: 16, padding: 20 }}>
        <Text
          style={{ color: tokens.foreground, fontSize: 24, fontWeight: "700" }}
        >
          {share.data?.preview.asset.title ?? "OpenBrief share"}
        </Text>
        <Text style={{ color: tokens.mutedForeground }}>
          {share.isLoading
            ? "Resolving share"
            : share.isError
              ? "This share is unavailable or expired."
              : `${share.data?.preview.artifactCount ?? 0} artifacts available`}
        </Text>
      </View>
    </SafeAreaView>
  );
}
