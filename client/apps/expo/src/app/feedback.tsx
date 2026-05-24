import { useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { useMutation } from "@tanstack/react-query";

import { getNativeThemeTokens } from "@acme/ui/color-theme";

import { trpc } from "~/utils/api";
import { authClient } from "~/utils/auth";

type FeedbackKind = "bug" | "feature";

export default function FeedbackScreen() {
  const colorScheme = useColorScheme();
  const tokens = useMemo(
    () =>
      getNativeThemeTokens(colorScheme === "dark" ? "dark" : "light", "green"),
    [colorScheme],
  );
  const { data: session } = authClient.useSession();
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [email, setEmail] = useState(session?.user.email ?? "");
  const submit = useMutation(trpc.feedback.submit.mutationOptions());

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.background }}>
      <Stack.Screen options={{ title: "Feedback" }} />
      <View style={{ flex: 1, gap: 16, padding: 20 }}>
        {submit.isSuccess ? (
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
                color: tokens.foreground,
                fontSize: 20,
                fontWeight: "700",
              }}
            >
              Feedback sent
            </Text>
            <Text style={{ color: tokens.mutedForeground }}>
              We read every submission.
            </Text>
          </View>
        ) : (
          <>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <KindButton
                label="Bug"
                active={kind === "bug"}
                tokens={tokens}
                onPress={() => setKind("bug")}
              />
              <KindButton
                label="Feature"
                active={kind === "feature"}
                tokens={tokens}
                onPress={() => setKind("feature")}
              />
            </View>
            <Field
              label="Title"
              value={title}
              onChangeText={setTitle}
              placeholder={
                kind === "bug" ? "What is broken" : "What should OpenBrief do"
              }
              tokens={tokens}
            />
            <Field
              label="Details"
              value={body}
              onChangeText={setBody}
              placeholder="Share the context we need to understand the request."
              tokens={tokens}
              multiline
            />
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="Optional"
              tokens={tokens}
              keyboardType="email-address"
            />
            <Pressable
              disabled={submit.isPending}
              onPress={() =>
                submit.mutate({
                  kind,
                  title: title.trim(),
                  body: body.trim(),
                  email: email.trim() || undefined,
                  source: "expo",
                  platform: Platform.OS,
                  diagnostics: {
                    os: Platform.OS,
                    osVersion: String(Platform.Version),
                  },
                })
              }
              style={{
                alignItems: "center",
                borderRadius: 6,
                backgroundColor: tokens.primary,
                opacity: submit.isPending ? 0.6 : 1,
                paddingVertical: 12,
              }}
            >
              <Text
                style={{ color: tokens.primaryForeground, fontWeight: "700" }}
              >
                {submit.isPending ? "Sending" : "Send feedback"}
              </Text>
            </Pressable>
            {submit.isError ? (
              <Text style={{ color: tokens.destructive }}>
                {submit.error.message || "Submit failed"}
              </Text>
            ) : null}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function KindButton(props: {
  label: string;
  active: boolean;
  tokens: ReturnType<typeof getNativeThemeTokens>;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={props.onPress}
      style={{
        flex: 1,
        alignItems: "center",
        borderRadius: 6,
        borderColor: props.active ? props.tokens.primary : props.tokens.border,
        borderWidth: 1,
        backgroundColor: props.active ? props.tokens.accent : props.tokens.card,
        paddingVertical: 10,
      }}
    >
      <Text style={{ color: props.tokens.foreground, fontWeight: "600" }}>
        {props.label}
      </Text>
    </Pressable>
  );
}

function Field(props: {
  label: string;
  value: string;
  placeholder: string;
  tokens: ReturnType<typeof getNativeThemeTokens>;
  multiline?: boolean;
  keyboardType?: "default" | "email-address";
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: props.tokens.foreground, fontWeight: "600" }}>
        {props.label}
      </Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={props.tokens.mutedForeground}
        multiline={props.multiline}
        keyboardType={props.keyboardType}
        style={{
          minHeight: props.multiline ? 140 : 44,
          borderColor: props.tokens.border,
          borderWidth: 1,
          borderRadius: 6,
          backgroundColor: props.tokens.card,
          color: props.tokens.foreground,
          padding: 12,
          textAlignVertical: props.multiline ? "top" : "center",
        }}
      />
    </View>
  );
}
