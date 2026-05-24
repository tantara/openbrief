import { describe, expect, it, vi } from "vitest";
import type {
  TranscriptSegment,
  VideoAsset,
} from "@/domain/media-library";
import { createSummaryChatService } from "@/services/summaryChatService";
import { defaultSystemPromptSettings } from "@/services/systemPromptSettingsService";
import { sanitizeChatMessageTtsPathSegment } from "@/domain/chat";
import { createProviderRequestPlan } from "@/domain/provider";
import type {
  ProviderCompletionRequest,
  ProviderService,
} from "@/services/providerService";

const video: VideoAsset = {
  id: "video-1",
  title: "Design Review",
  sourceKind: "youtube",
  originalUri: "https://youtu.be/example",
  libraryPath: "videos/video-1/video.mp4",
  importStatus: "ready",
  createdAtIso: "2026-05-21T00:00:00.000Z",
};

const transcript: TranscriptSegment[] = [
  {
    id: "s1",
    startSeconds: 0,
    text: "Intro",
    sourceKind: "youtube-captions",
  },
];

const multiSegmentTranscript: TranscriptSegment[] = [
  {
    id: "s1",
    startSeconds: 0,
    text: "Intro",
    sourceKind: "youtube-captions",
  },
  {
    id: "s2",
    startSeconds: 10,
    text: "Middle",
    sourceKind: "youtube-captions",
  },
  {
    id: "s3",
    startSeconds: 20,
    text: "End",
    sourceKind: "youtube-captions",
  },
];

describe("summary chat service", () => {
  it("generates markdown summaries through the provider contract", async () => {
    const service = createSummaryChatService();

    const summary = await service.generateSummary({
      video,
      transcript,
      provider: "openai",
      templateId: "lecture-notes",
      lengthMode: "explain-simply",
      outputLanguage: "Korean",
      nowIso: "2026-05-21T00:00:00.000Z",
    });

    expect(summary.markdown).toContain("# Summary");
    expect(summary).toMatchObject({
      videoId: "video-1",
      provider: "openai",
      templateId: "lecture-notes",
      lengthMode: "explain-simply",
      outputLanguage: "Korean",
      sourceSegmentCount: 1,
    });
  });

  it("creates user and assistant chat messages with selected context mode", async () => {
    const service = createSummaryChatService();
    const summary = await service.generateSummary({
      video,
      transcript,
      provider: "gemini",
      nowIso: "2026-05-21T00:00:00.000Z",
    });

    const messages = await service.sendChat({
      video,
      question: "What is the intro?",
      contextMode: "summary",
      provider: "gemini",
      transcript,
      summary,
      nowIso: "2026-05-21T00:00:00.000Z",
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: "user", contextMode: "summary" });
    expect(messages[0].id).not.toBe(messages[1].id);
    expect(sanitizeChatMessageTtsPathSegment(messages[0].id)).toBe(messages[0].id);
    expect(sanitizeChatMessageTtsPathSegment(messages[1].id)).toBe(messages[1].id);
    expect(messages[1]).toMatchObject({
      role: "assistant",
      contextMode: "summary",
      provider: "gemini",
      tokenUsage: expect.objectContaining({
        inputTokens: expect.any(Number),
        outputTokens: expect.any(Number),
      }),
    });
  });

  it("passes chat streaming mode and text snapshots to the provider", async () => {
    const providerCalls: ProviderCompletionRequest[] = [];
    const providerService: ProviderService = {
      complete: vi.fn(async (request) => {
        providerCalls.push(request);
        request.onTextSnapshot?.("Partial answer");
        return {
          ok: true as const,
          text: "Final answer",
          requestPlan: createProviderRequestPlan(request),
        };
      }),
    };
    const onTextSnapshot = vi.fn();
    const service = createSummaryChatService(providerService);

    const messages = await service.sendChat({
      video,
      question: "What is the intro?",
      contextMode: "summary",
      provider: "openai",
      transcript,
      streamingMode: true,
      onTextSnapshot,
    });

    expect(providerCalls[0]).toMatchObject({
      operation: "chat",
      streamingMode: true,
    });
    expect(onTextSnapshot).toHaveBeenCalledWith("Partial answer");
    expect(messages[1].content).toBe("Final answer");
  });

  it("passes saved system prompt overrides into summary and chat provider calls", async () => {
    const providerCalls: ProviderCompletionRequest[] = [];
    const providerService: ProviderService = {
      complete: vi.fn(async (request) => {
        providerCalls.push(request);
        return {
          ok: true as const,
          text: request.operation === "summary" ? "# Custom summary" : "Custom answer",
          requestPlan: createProviderRequestPlan(request),
        };
      }),
    };
    const service = createSummaryChatService(providerService, () => ({
      ...defaultSystemPromptSettings,
      videoSummary: "Custom summary system prompt",
      chat: "Custom chat system prompt",
    }));

    const summary = await service.generateSummary({
      video,
      transcript,
      provider: "openai",
      outputLanguage: "Japanese",
    });
    await service.sendChat({
      video,
      question: "What is the intro?",
      contextMode: "summary",
      provider: "openai",
      transcript,
      summary,
    });

    expect(providerCalls[0]).toMatchObject({
      operation: "summary",
      systemPrompt: expect.stringContaining("Custom summary system prompt"),
      userPrompt: expect.stringContaining("TARGET_LANGUAGE: Japanese"),
    });
    expect(providerCalls[0].systemPrompt).toContain(
      "Rewrite the source language transcript into a Markdown summary in Japanese.",
    );
    expect(providerCalls[1]).toMatchObject({
      operation: "chat",
      systemPrompt: "Custom chat system prompt",
    });
  });

  it("reviews transcript text through one compact provider request", async () => {
    const providerCalls: ProviderCompletionRequest[] = [];
    const providerService: ProviderService = {
      complete: vi.fn(async (request) => {
        providerCalls.push(request);
        return {
          ok: true as const,
          text: "s1\tCorrected intro",
          requestPlan: createProviderRequestPlan(request),
        };
      }),
    };
    const service = createSummaryChatService(providerService);

    const reviewed = await service.reviewTranscript({
      video,
      transcript,
      provider: "openai",
      model: "gpt-5.4-mini",
    });

    expect(providerCalls).toHaveLength(1);
    expect(providerCalls[0]).toMatchObject({
      operation: "transcript_review",
      model: "gpt-5.4-mini",
    });
    expect(reviewed[0].text).toBe("Corrected intro");
  });

  it("passes saved system prompt overrides into transcript transforms", async () => {
    const providerCalls: ProviderCompletionRequest[] = [];
    const providerService: ProviderService = {
      complete: vi.fn(async (request) => {
        providerCalls.push(request);
        return {
          ok: true as const,
          text:
            request.operation === "transcript_review"
              ? "s1\tCorrected intro"
              : "s1\t0:00\t번역된 인트로",
          requestPlan: createProviderRequestPlan(request),
        };
      }),
    };
    const service = createSummaryChatService(providerService, () => ({
      ...defaultSystemPromptSettings,
      transcriptReview: "Custom transcript review system prompt",
      transcriptTranslation: "Custom transcript translation system prompt",
    }));

    await service.reviewTranscript({
      video,
      transcript,
      provider: "openai",
    });
    await service.translateTranscript({
      video,
      transcript,
      provider: "openai",
      language: { code: "ko", label: "Korean" },
    });

    expect(providerCalls[0]).toMatchObject({
      operation: "transcript_review",
      systemPrompt: "Custom transcript review system prompt",
    });
    expect(providerCalls[1]).toMatchObject({
      operation: "transcript_translate",
      systemPrompt: "Custom transcript translation system prompt",
    });
  });

  it("resumes transcript review from the first missing segment after a partial response", async () => {
    const providerCalls: ProviderCompletionRequest[] = [];
    const providerService: ProviderService = {
      complete: vi.fn(async (request) => {
        providerCalls.push(request);
        return {
          ok: true as const,
          text:
            providerCalls.length === 1
              ? "s1\tCorrected intro\ns2\tCorrected middle"
              : "s3\tCorrected end",
          requestPlan: createProviderRequestPlan(request),
        };
      }),
    };
    const service = createSummaryChatService(providerService);

    const reviewed = await service.reviewTranscript({
      video,
      transcript: multiSegmentTranscript,
      provider: "openai",
    });

    expect(providerCalls).toHaveLength(2);
    expect(providerCalls[1].userPrompt).not.toContain("s1\t");
    expect(providerCalls[1].userPrompt).not.toContain("s2\t");
    expect(providerCalls[1].userPrompt).toContain("s3\t");
    expect(reviewed.map((segment) => segment.text)).toEqual([
      "Corrected intro",
      "Corrected middle",
      "Corrected end",
    ]);
  });

  it("resumes transcript translation from streamed partial text after provider failure", async () => {
    const providerCalls: ProviderCompletionRequest[] = [];
    const providerService: ProviderService = {
      complete: vi.fn(async (request) => {
        providerCalls.push(request);
        if (providerCalls.length === 1) {
          request.onTextSnapshot?.("s1\t0:00\t번역된 도입\ns2\t0:10\t번역된 중간");
          return {
            ok: false as const,
            message: "provider_request_failed",
            diagnostic: { reason: "network" },
            requestPlan: createProviderRequestPlan(request),
          };
        }

        return {
          ok: true as const,
          text: "s3\t0:20\t번역된 끝",
          requestPlan: createProviderRequestPlan(request),
        };
      }),
    };
    const service = createSummaryChatService(providerService);

    const variant = await service.translateTranscript({
      video,
      transcript: multiSegmentTranscript,
      provider: "openai",
      language: { code: "ko", label: "Korean" },
    });

    expect(providerCalls).toHaveLength(2);
    expect(providerCalls[0]).toMatchObject({ streamingMode: true });
    expect(providerCalls[1].userPrompt).toContain("s3\t");
    expect(variant.segments.map((segment) => segment.text)).toEqual([
      "번역된 도입",
      "번역된 중간",
      "번역된 끝",
    ]);
  });

  it("translates transcript text into a saved language variant", async () => {
    const providerCalls: ProviderCompletionRequest[] = [];
    const providerService: ProviderService = {
      complete: vi.fn(async (request) => {
        providerCalls.push(request);
        return {
          ok: true as const,
          text: "s1\t0:00\t번역된 인트로",
          requestPlan: createProviderRequestPlan(request),
        };
      }),
    };
    const service = createSummaryChatService(providerService);

    const variant = await service.translateTranscript({
      video,
      transcript,
      provider: "openai",
      model: "gpt-5.4-mini",
      language: { code: "ko", label: "Korean" },
    });

    expect(variant).toMatchObject({
      videoId: "video-1",
      kind: "translation",
      languageCode: "ko",
      languageLabel: "Korean",
      artifactPath: "videos/video-1/transcript/Design-Review_ko.txt",
    });
    expect(providerCalls[0].systemPrompt).toContain(
      "Every output line must echo the input segment id and start timestamp exactly.",
    );
    expect(providerCalls[0].userPrompt).toContain(
      "segment_id<TAB>start_timestamp<TAB>translated_text",
    );
    expect(variant.segments[0].text).toBe("번역된 인트로");
  });

  it("rejects transcript translation lines with shifted timestamps", async () => {
    const providerService: ProviderService = {
      complete: vi.fn(async (request) => ({
        ok: true as const,
        text:
          request.userPrompt.includes("s1\t0:00")
            ? "s1\t0:01\t잘못 정렬된 도입\ns2\t0:10\t번역된 중간\ns3\t0:20\t번역된 끝"
            : "s1\t0:00\t번역된 도입\ns2\t0:10\t번역된 중간\ns3\t0:20\t번역된 끝",
        requestPlan: createProviderRequestPlan(request),
      })),
    };
    const service = createSummaryChatService(providerService);

    await expect(
      service.translateTranscript({
        video,
        transcript: multiSegmentTranscript,
        provider: "openai",
        language: { code: "ko", label: "Korean" },
      }),
    ).rejects.toThrow("transcript_transform_incomplete:s1");
  });
});
