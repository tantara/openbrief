import { useMemo } from "react";
import { Text, useColorScheme, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";

import { getNativeThemeTokens } from "@acme/ui/color-theme";

export default function ShareScanScreen() {
  const colorScheme = useColorScheme();
  const tokens = useMemo(
    () =>
      getNativeThemeTokens(colorScheme === "dark" ? "dark" : "light", "green"),
    [colorScheme],
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.background }}>
      <Stack.Screen options={{ title: "Scan Share" }} />
      <View style={{ flex: 1, justifyContent: "center", gap: 12, padding: 20 }}>
        <Text
          style={{ color: tokens.foreground, fontSize: 22, fontWeight: "700" }}
        >
          QR scanning is next
        </Text>
        <Text style={{ color: tokens.mutedForeground, lineHeight: 20 }}>
          The app shell now uses the OpenBrief bundle contracts and gateway
          share API. Camera-based pairing can be added without changing the
          manifest format.
        </Text>
      </View>
    </SafeAreaView>
  );
}
