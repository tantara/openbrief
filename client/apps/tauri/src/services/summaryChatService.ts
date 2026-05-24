import { createChatMessage, createChatPrompt, type ChatContextMode } from "@/domain/chat";
import { createMarkdownSavePayload } from "@/domain/markdown-save";
import type {
  ChatMessage,
  ProviderKind,
  SummaryDocument,
  TranscriptSegment,
  VideoAsset,
} from "@/domain/media-library";
import {
  applyTranscriptTextMapBySegmentId,
  createTranscriptReviewPrompt,
  createTranscriptTranslationPrompt,
  createTranscriptVariant,
  findFirstMissingTranscriptSegmentIndex,
  parseTranscriptSegmentTsv,
  parseTimestampAlignedTranscriptSegmentTsv,
  type TranscriptLanguageOption,
  type TranscriptVariant,
} from "@/domain/transcript-actions";
import {
  createPodcastScriptPrompt,
  parsePodcastScriptJson,
  validatePodcastScriptResponse,
  type PodcastLengthMode,
  type PodcastOutputMode,
  type PodcastScriptDocument,
  type PodcastSourceKind,
  type PodcastSpeakerConfig,
} from "@/domain/podcast";
import {
  createQuizDocument,
  createQuizPrompt,
  parseQuizJson,
  validateQuizResponse,
  type QuizDocument,
  type QuizMode,
} from "@/domain/quiz";
import {
  createSummaryDocument,
  createSummaryPrompt,
  type SummaryLengthMode,
  type VideoSummaryTemplateId,
} from "@/domain/summary";
import {
  createMockProviderService,
  type ProviderService,
} from "@/services/providerService";
import {
  defaultSystemPromptSettings,
  loadSystemPromptSettings,
  type SystemPromptSettings,
} from "@/services/systemPromptSettingsService";
import {
  loadGenerationSettings,
  type GenerationSettings,
} from "@/services/generationSettingsService";

export type SummaryChatService = {
  generateSummary(request: GenerateSummaryRequest): Promise<SummaryDocument>;
  generatePodcastScript(
    request: GeneratePodcastScriptRequest,
  ): Promise<PodcastScriptDocument>;
  generateQuiz(request: GenerateQuizRequest): Promise<QuizDocument>;
  sendChat(request: SendChatRequest): Promise<ChatMessage[]>;
  reviewTranscript(request: TranscriptReviewRequest): Promise<TranscriptSegment[]>;
  translateTranscript(request: TranscriptTranslationRequest): Promise<TranscriptVariant>;
  createMarkdownSave(request: MarkdownSaveRequest): ReturnType<
    typeof createMarkdownSavePayload
  >;
};

export type GenerateSummaryRequest = {
  video: VideoAsset;
  transcript: TranscriptSegment[];
  provider: ProviderKind;
  model?: string;
  templateId?: VideoSummaryTemplateId;
  lengthMode?: SummaryLengthMode;
  outputLanguage?: string;
  streamingMode?: boolean;
  onTextSnapshot?(text: string): void;
  nowIso?: string;
};

export type SendChatRequest = {
  video: VideoAsset;
  question: string;
  contextMode: ChatContextMode;
  provider: ProviderKind;
  model?: string;
  transcript: TranscriptSegment[];
  summary?: SummaryDocument;
  sessionId?: string;
  streamingMode?: boolean;
  onTextSnapshot?(text: string): void;
  nowIso?: string;
};

export type GeneratePodcastScriptRequest = {
  video: VideoAsset;
  sourceKind: PodcastSourceKind;
  summary?: SummaryDocument;
  transcript: TranscriptSegment[];
  transcriptVariant?: TranscriptVariant;
  mode: PodcastOutputMode;
  lengthMode: PodcastLengthMode;
  outputLanguage?: string;
  speakers: [PodcastSpeakerConfig, PodcastSpeakerConfig];
  provider: ProviderKind;
  model?: string;
};

export type GenerateQuizRequest = {
  video: VideoAsset;
  transcript: TranscriptSegment[];
  summary?: SummaryDocument;
  mode: QuizMode;
  questionCount: number;
  areaOfInterest: string;
  provider: ProviderKind;
  model?: string;
  nowIso?: string;
};

export type MarkdownSaveRequest = {
  video: VideoAsset;
  summary: SummaryDocument;
  targetPath?: string;
};

export type TranscriptReviewRequest = {
  video: VideoAsset;
  transcript: TranscriptSegment[];
  provider: ProviderKind;
  model?: string;
};

export type TranscriptTranslationRequest = {
  video: VideoAsset;
  transcript: TranscriptSegment[];
  provider: ProviderKind;
  model?: string;
  language: TranscriptLanguageOption;
};

export type SystemPromptSettingsProvider = () => SystemPromptSettings;
export type GenerationSettingsProvider = () => GenerationSettings;

const maxTranscriptTransformAttempts = 3;

export function createSummaryChatService(
  providerService: ProviderService = createMockProviderService(),
  getSystemPromptSettings: SystemPromptSettingsProvider = loadSystemPromptSettings,
  getGenerationSettings: GenerationSettingsProvider = loadGenerationSettings,
): SummaryChatService {
  return {
    async generateSummary(request) {
      const systemPrompts = getSystemPromptSettings() ?? defaultSystemPromptSettings;
      const generationSettings = getGenerationSettings();
      const prompt = createSummaryPrompt({
        video: request.video,
        segments: request.transcript,
        options: {
          templateId: request.templateId,
          lengthMode: request.lengthMode,
          outputLanguage: request.outputLanguage,
          systemPromptOverride: systemPrompts.videoSummary,
        },
      });
      const result = await providerService.complete({
        provider: request.provider,
        operation: "summary",
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
        model: request.model,
        streamingMode: request.streamingMode,
        generationParams: generationSettings.summary,
        onTextSnapshot: request.onTextSnapshot,
      });

      if (!result.ok) {
        throw new Error(result.message);
      }

      return createSummaryDocument({
        videoId: request.video.id,
        provider: request.provider,
        markdown: result.text,
        templateId: request.templateId,
        lengthMode: request.lengthMode,
        outputLanguage: request.outputLanguage,
        sourceSegmentCount: request.transcript.length,
        sourceFileName: request.video.originalFileName ?? request.video.title,
        nowIso: request.nowIso,
      });
    },

    async generatePodcastScript(request) {
      const generationSettings = getGenerationSettings();
      const prompt = createPodcastScriptPrompt(request);
      const result = await providerService.complete({
        provider: request.provider,
        operation: "podcast_script",
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
        model: request.model,
        generationParams: generationSettings.podcast_script,
      });

      if (!result.ok) {
        throw new Error(result.message);
      }

      return validatePodcastScriptResponse(parsePodcastScriptJson(result.text), {
        video: request.video,
        speakers: request.speakers,
      });
    },

    async generateQuiz(request) {
      const systemPrompts = getSystemPromptSettings() ?? defaultSystemPromptSettings;
      const generationSettings = getGenerationSettings();
      const prompt = createQuizPrompt({
        ...request,
        systemPromptOverride: systemPrompts.quiz,
      });
      const result = await providerService.complete({
        provider: request.provider,
        operation: "quiz",
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
        model: request.model,
        generationParams: generationSettings.quiz,
      });

      if (!result.ok) {
        throw new Error(result.message);
      }

      const quiz = validateQuizResponse(parseQuizJson(result.text), {
        video: request.video,
        mode: request.mode,
        questionCount: request.questionCount,
        areaOfInterest: request.areaOfInterest,
      });

      return createQuizDocument({
        video: request.video,
        mode: request.mode,
        questionCount: request.questionCount,
        areaOfInterest: request.areaOfInterest,
        provider: request.provider,
        model: request.model,
        quiz,
        sourceSummaryId: request.summary?.id,
        nowIso: request.nowIso,
      });
    },

    async sendChat(request) {
      const systemPrompts = getSystemPromptSettings() ?? defaultSystemPromptSettings;
      const generationSettings = getGenerationSettings();
      const prompt = createChatPrompt({
        ...request,
        systemPromptOverride: systemPrompts.chat,
      });
      const userMessage = createChatMessage({
        videoId: request.video.id,
        role: "user",
        content: request.question,
        contextMode: request.contextMode,
        sessionId: request.sessionId,
        nowIso: request.nowIso,
      });
      const result = await providerService.complete({
        provider: request.provider,
        operation: "chat",
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
        model: request.model,
        streamingMode: request.streamingMode,
        generationParams: generationSettings.chat,
        onTextSnapshot: request.onTextSnapshot,
      });

      if (!result.ok) {
        throw new Error(result.message);
      }

      const assistantMessage = createChatMessage({
        videoId: request.video.id,
        role: "assistant",
        content: result.text,
        contextMode: request.contextMode,
        sessionId: request.sessionId,
        provider: request.provider,
        model: request.model,
        tokenUsage: result.usage,
        nowIso: request.nowIso,
      });

      return [userMessage, assistantMessage];
    },

    async reviewTranscript(request) {
      const systemPrompts = getSystemPromptSettings() ?? defaultSystemPromptSettings;
      const generationSettings = getGenerationSettings();
      const textById = await completeTranscriptTransformWithResume({
        providerService,
        provider: request.provider,
        operation: "transcript_review",
        model: request.model,
        generationParams: generationSettings.transcript_review,
        segments: request.transcript,
        createPrompt: (segments) =>
          createTranscriptReviewPrompt({
            video: request.video,
            segments,
            systemPromptOverride: systemPrompts.transcriptReview,
          }),
      });

      return applyTranscriptTextMapBySegmentId(request.transcript, textById);
    },

    async translateTranscript(request) {
      const systemPrompts = getSystemPromptSettings() ?? defaultSystemPromptSettings;
      const generationSettings = getGenerationSettings();
      const textById = await completeTranscriptTransformWithResume({
        providerService,
        provider: request.provider,
        operation: "transcript_translate",
        model: request.model,
        generationParams: generationSettings.transcript_translate,
        segments: request.transcript,
        createPrompt: (segments) =>
          createTranscriptTranslationPrompt({
            video: request.video,
            segments,
            language: request.language,
            systemPromptOverride: systemPrompts.transcriptTranslation,
          }),
      });

      return createTranscriptVariant({
        video: request.video,
        kind: "translation",
        language: request.language,
        provider: request.provider,
        model: request.model,
        segments: applyTranscriptTextMapBySegmentId(request.transcript, textById),
      });
    },

    createMarkdownSave(request) {
      return createMarkdownSavePayload(request);
    },
  };
}

async function completeTranscriptTransformWithResume({
  providerService,
  provider,
  operation,
  model,
  generationParams,
  segments,
  createPrompt,
}: {
  providerService: ProviderService;
  provider: ProviderKind;
  operation: "transcript_review" | "transcript_translate";
  model?: string;
  generationParams: GenerationSettings["transcript_review"];
  segments: TranscriptSegment[];
  createPrompt(segments: TranscriptSegment[]): {
    systemPrompt: string;
    userPrompt: string;
  };
}) {
  const textById = new Map<string, string>();
  let nextIndex = findFirstMissingTranscriptSegmentIndex(segments, textById);
  let lastFailureMessage = "provider_request_failed";

  for (
    let attempt = 0;
    attempt < maxTranscriptTransformAttempts && nextIndex < segments.length;
    attempt += 1
  ) {
    const remainingSegments = segments.slice(nextIndex);
    let latestSnapshot = "";
    const prompt = createPrompt(remainingSegments);
    const result = await providerService.complete({
      provider,
      operation,
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
      model,
      generationParams,
      streamingMode: true,
      onTextSnapshot: (text) => {
        latestSnapshot = text;
      },
    });

    const providerText = result.ok ? result.text : latestSnapshot;
    mergeTranscriptTransformText({
      textById,
      expectedSegments: remainingSegments,
      providerText,
      requireTimestampAlignment: operation === "transcript_translate",
    });
    nextIndex = findFirstMissingTranscriptSegmentIndex(segments, textById);

    if (!result.ok) {
      lastFailureMessage = result.message;
      if (!providerText.trim()) {
        throw new Error(result.message);
      }
    }
  }

  if (nextIndex < segments.length) {
    throw new Error(
      `${lastFailureMessage}:transcript_transform_incomplete:${segments[nextIndex].id}`,
    );
  }

  return textById;
}

function mergeTranscriptTransformText({
  textById,
  expectedSegments,
  providerText,
  requireTimestampAlignment,
}: {
  textById: Map<string, string>;
  expectedSegments: TranscriptSegment[];
  providerText: string;
  requireTimestampAlignment: boolean;
}) {
  const expectedIds = new Set(expectedSegments.map((segment) => segment.id));
  const parsedTextById = requireTimestampAlignment
    ? parseTimestampAlignedTranscriptSegmentTsv(providerText, expectedSegments)
    : parseTranscriptSegmentTsv(providerText);

  for (const [id, text] of parsedTextById) {
    if (expectedIds.has(id) && text.trim()) {
      textById.set(id, text);
    }
  }
}
