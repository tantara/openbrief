import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchProviderHttpClient } from "@/services/providerAdapters";

describe("provider adapters", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("collects OpenAI-compatible token usage from streaming chunks", async () => {
    const encoder = new TextEncoder();
    const snapshots: string[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode(
                  'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n',
                ),
              );
              controller.enqueue(
                encoder.encode(
                  'data: {"choices":[{"delta":{"content":"world"},"finish_reason":"stop"}]}\n\n',
                ),
              );
              controller.enqueue(
                encoder.encode(
                  'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12,"prompt_tokens_details":{"cached_tokens":3}}}\n\n',
                ),
              );
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            },
          }),
          { status: 200 },
        ),
      ),
    );

    const response = await fetchProviderHttpClient(
      {
        endpoint: "https://example.test/chat/completions",
        method: "POST",
        headers: {},
        body: { stream: true },
      },
      {
        provider: "openai",
        onTextSnapshot: (text) => snapshots.push(text),
      },
    );

    expect(response.body).toMatchObject({
      openbriefText: "Hello world",
      openbriefFinishReason: "stop",
      openbriefUsage: {
        inputTokens: 10,
        cachedInputTokens: 3,
        outputTokens: 2,
        totalTokens: 12,
      },
    });
    expect(snapshots).toEqual(["Hello ", "Hello world"]);
  });
});
