import { useEffect, useMemo } from "react";
import { useColorScheme } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { QueryClientProvider } from "@tanstack/react-query";

import { getNativeThemeTokens } from "@acme/ui/color-theme";

import { queryClient } from "~/utils/api";

import "../styles.css";

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const tokens = useMemo(
    () =>
      getNativeThemeTokens(colorScheme === "dark" ? "dark" : "light", "green"),
    [colorScheme],
  );

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(tokens.background);
  }, [tokens.background]);

  return (
    <QueryClientProvider client={queryClient}>
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: tokens.card,
          },
          headerTintColor: tokens.foreground,
          headerTitleStyle: {
            color: tokens.foreground,
          },
          contentStyle: {
            backgroundColor: tokens.background,
          },
        }}
      />
      <StatusBar style={tokens.colorScheme === "dark" ? "light" : "dark"} />
    </QueryClientProvider>
  );
}
