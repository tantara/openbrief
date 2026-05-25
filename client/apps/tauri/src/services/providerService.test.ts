import { describe, expect, it, vi } from "vitest";
import type { ProviderKind } from "@/domain/media-library";
import { providerDiagnosticContainsSecret } from "@/domain/provider";
import {
  createLiveProviderService,
  createMockProviderService,
  createProviderService,
  createProviderFailureResult,
} from "@/services/providerService";
import type {
  ProviderHttpClient,
  ProviderHttpRequest,
} from "@/services/providerAdapters";

describe("provider service", () => {
  it("returns mocked summary text with a trusted credential request plan", async () => {
    const service = createMockProviderService();

    const result = await service.complete({
      provider: "openai",
      operation: "summary",
      systemPrompt: "Summarize in markdown.",
      userPrompt: "Transcript",
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.text).toContain("# Summary");
    expect(result.requestPlan.credentialPolicy).toBe("tauri-secret-store");
  });

  it("keeps provider service mockable by default", async () => {
    const service = createProviderService();

    const result = await service.complete({
      provider: "gemini",
      operation: "chat",
      systemPrompt: "Answer.",
      userPrompt: "How does fallback work?",
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.text).toContain("How does fallback work?");
  });

  it("returns valid mocked editor agent plans for native video generation", async () => {
    const service = createMockProviderService();

    const result = await service.complete({
      provider: "openai",
      operation: "video_agent_plan",
      systemPrompt: "Return JSON.",
      userPrompt: "Requested plan kind: composition\nUser instruction: wipe captions",
    });

    expect(result.ok).toBe(true);
    expect(() => JSON.parse(result.ok ? result.text : "")).not.toThrow();
    expect(result.ok && result.text).toContain("caption-clip-wipe");
  });

  it("falls back to mocked completions when live credentials are absent", async () => {
    const httpClient = vi.fn<ProviderHttpClient>();
    const service = createLiveProviderService({
      httpClient,
      resolveCredential: vi.fn().mockResolvedValue(undefined),
    });

    const result = await service.complete({
      provider: "openai",
      operation: "summary",
      systemPrompt: "Summarize.",
      userPrompt: "Transcript",
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.text).toContain("# Summary");
    expect(httpClient).not.toHaveBeenCalled();
  });

  it.each<ProviderKind>(["openai", "anthropic", "gemini", "openrouter"])(
    "sends %s live requests with provider-specific endpoint, headers, and body",
    async (provider) => {
      const secret = `${provider}-live-secret`;
      const httpClient = vi.fn<ProviderHttpClient>().mockResolvedValue({
        status: 200,
        body: createProviderResponse(provider, "Live provider text"),
      });
      const service = createLiveProviderService({
        httpClient,
        resolveCredential: vi.fn().mockResolvedValue(secret),
      });

      const result = await service.complete({
        provider,
        operation: "chat",
        systemPrompt: "System instructions",
        userPrompt: "User question",
      });

      expect(result.ok).toBe(true);
      expect(result.ok && result.text).toBe("Live provider text");
      expect(httpClient).toHaveBeenCalledTimes(1);

      const request = httpClient.mock.calls[0]?.[0];

      if (!request) {
        throw new Error("expected provider request");
      }

      expectProviderRequestShape(provider, request, secret);
      expect(JSON.stringify(result.requestPlan)).not.toContain(secret);
      expect(JSON.stringify(result)).not.toContain(secret);
    },
  );

  it("uses the trusted Tauri provider client without resolving credentials in the renderer", async () => {
    const trustedHttpClient = vi.fn().mockResolvedValue({
      status: 200,
      body: createProviderResponse("openai", "Trusted provider text"),
    });
    const resolveCredential = vi.fn();
    const service = createLiveProviderService({
      trustedHttpClient,
      resolveCredential,
    });

    const result = await service.complete({
      provider: "openai",
      operation: "summary",
      systemPrompt: "System instructions",
      userPrompt: "Transcript",
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.text).toBe("Trusted provider text");
    expect(trustedHttpClient).toHaveBeenCalledTimes(1);
    expect(trustedHttpClient.mock.calls[0][0]).toMatchObject({
      provider: "openai",
      credentialPolicy: "tauri-secret-store",
      headers: { Authorization: "[TAURI_SECRET:api-key]" },
    });
    expect(resolveCredential).not.toHaveBeenCalled();
  });

  it("continues provider output when the response stops at max tokens", async () => {
    const httpClient = vi
      .fn<ProviderHttpClient>()
      .mockResolvedValueOnce({
        status: 200,
        body: {
          choices: [
            {
              finish_reason: "length",
              message: { content: "Part one. " },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        body: {
          choices: [
            {
              finish_reason: "stop",
              message: { content: "Part two." },
            },
          ],
        },
      });
    const service = createLiveProviderService({
      httpClient,
      resolveCredential: vi.fn().mockResolvedValue("openai-live-secret"),
    });

    const result = await service.complete({
      provider: "openai",
      operation: "summary",
      systemPrompt: "Summarize.",
      userPrompt: "Transcript",
      generationParams: { maxTokens: 8 },
    });

    expect(result).toMatchObject({
      ok: true,
      text: "Part one. Part two.",
      finishReason: "stop",
    });
    expect(httpClient).toHaveBeenCalledTimes(2);
    expect(httpClient.mock.calls[1]?.[0].body).toMatchObject({
      messages: [
        { role: "system", content: "Summarize." },
        { role: "user", content: "Transcript" },
        { role: "assistant", content: "Part one. " },
        {
          role: "user",
          content: expect.stringContaining("Continue exactly where"),
        },
      ],
    });
  });

  it("passes streaming snapshots through live provider clients", async () => {
    const httpClient = vi.fn<ProviderHttpClient>(async (_request, options) => {
      options?.onTextSnapshot?.("Partial");
      return {
        status: 200,
        body: {
          openbriefText: "Final",
          openbriefFinishReason: "stop",
        },
      };
    });
    const service = createLiveProviderService({
      httpClient,
      resolveCredential: vi.fn().mockResolvedValue("openai-live-secret"),
    });
    const onTextSnapshot = vi.fn();

    const result = await service.complete({
      provider: "openai",
      operation: "chat",
      systemPrompt: "Answer.",
      userPrompt: "Question",
      streamingMode: true,
      onTextSnapshot,
    });

    expect(result).toMatchObject({ ok: true, text: "Final" });
    expect(onTextSnapshot).toHaveBeenCalledWith("Partial");
    expect(onTextSnapshot).toHaveBeenCalledWith("Final");
  });

  it("redacts live provider diagnostics before returning failures", async () => {
    const secret = "openai-live-secret";
    const service = createLiveProviderService({
      httpClient: vi.fn<ProviderHttpClient>().mockResolvedValue({
        status: 401,
        body: {
          message: `invalid Authorization Bearer ${secret}`,
          authorization: `Bearer ${secret}`,
          nested: { api_key: secret },
        },
      }),
      resolveCredential: vi.fn().mockResolvedValue(secret),
    });

    const result = await service.complete({
      provider: "openai",
      operation: "summary",
      systemPrompt: "Summarize.",
      userPrompt: "Transcript",
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("expected provider failure");
    }

    expect(providerDiagnosticContainsSecret(result.diagnostic)).toBe(false);
    expect(JSON.stringify(result.diagnostic)).not.toContain(secret);
    expect(JSON.stringify(result.requestPlan)).not.toContain(secret);
  });

  it("redacts provider errors before returning diagnostics", () => {
    const result = createProviderFailureResult({
      request: {
        provider: "anthropic",
        operation: "chat",
        systemPrompt: "Answer.",
        userPrompt: "Question",
      },
      error: {
        message: "bad key",
        authorization: "Bearer secret",
      },
    });

    if (result.ok) {
      throw new Error("expected provider failure");
    }

    expect(providerDiagnosticContainsSecret(result.diagnostic)).toBe(false);
    expect(JSON.stringify(result.diagnostic)).not.toContain("Bearer secret");
  });
});

function createProviderResponse(provider: ProviderKind, text: string): unknown {
  switch (provider) {
    case "openai":
    case "openrouter":
      return { choices: [{ message: { content: text } }] };
    case "anthropic":
      return { content: [{ type: "text", text }] };
    case "gemini":
      return { candidates: [{ content: { parts: [{ text }] } }] };
  }
}

function expectProviderRequestShape(
  provider: ProviderKind,
  request: ProviderHttpRequest,
  secret: string,
) {
  expect(request.method).toBe("POST");
  expect(request.headers["Content-Type"]).toBe("application/json");

  switch (provider) {
    case "openai":
      expect(request.endpoint).toBe("https://api.openai.com/v1/chat/completions");
      expect(request.headers.Authorization).toBe(`Bearer ${secret}`);
      expect(request.body).toMatchObject({
        model: "gpt-5.4-mini",
        temperature: 0.2,
        top_p: 0.9,
        max_tokens: 2048,
        messages: [
          { role: "system", content: "System instructions" },
          { role: "user", content: "User question" },
        ],
      });
      break;
    case "anthropic":
      expect(request.endpoint).toBe("https://api.anthropic.com/v1/messages");
      expect(request.headers["x-api-key"]).toBe(secret);
      expect(request.headers["anthropic-version"]).toBe("2023-06-01");
      expect(request.body).toMatchObject({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        temperature: 0.2,
        top_p: 0.9,
        system: "System instructions",
        messages: [{ role: "user", content: "User question" }],
      });
      break;
    case "gemini":
      expect(request.endpoint).toBe(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent",
      );
      expect(request.headers["x-goog-api-key"]).toBe(secret);
      expect(request.body).toEqual({
        generationConfig: {
          temperature: 0.2,
          topP: 0.9,
          maxOutputTokens: 2048,
        },
        contents: [
          {
            role: "user",
            parts: [{ text: "System instructions\n\nUser question" }],
          },
        ],
      });
      break;
    case "openrouter":
      expect(request.endpoint).toBe("https://openrouter.ai/api/v1/chat/completions");
      expect(request.headers.Authorization).toBe(`Bearer ${secret}`);
      expect(request.headers["HTTP-Referer"]).toBe("https://openbrief.app");
      expect(request.headers["X-Title"]).toBe("OpenBrief");
      expect(request.body).toMatchObject({
        model: "deepseek/deepseek-v4-flash",
        temperature: 0.2,
        top_p: 0.9,
        max_tokens: 2048,
        messages: [
          { role: "system", content: "System instructions" },
          { role: "user", content: "User question" },
        ],
      });
      break;
  }
}
