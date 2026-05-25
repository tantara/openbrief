import type {
  ProviderKind,
  SummaryDocument,
  TranscriptSegment,
  VideoAsset,
} from "@/domain/media-library";
import {
  createEditorAgentPrompt,
  createFallbackEditorAgentPlan,
  parseEditorAgentPlanJson,
  validateEditorAgentPlan,
  type EditorAgentPlan,
  type EditorAgentPlanKind,
} from "@/domain/editor-agent";
import { scenarioForVideoGenerationAsset } from "@/domain/video-generation";
import {
  loadAiProviderPreferences,
  type AiProviderPreferences,
} from "@/services/aiProviderPreferencesService";
import {
  loadGenerationSettings,
  type GenerationSettings,
} from "@/services/generationSettingsService";
import {
  createDefaultProviderService,
  type ProviderService,
} from "@/services/providerService";

export type DraftEditorAgentPlanRequest = {
  asset: VideoAsset;
  summary?: SummaryDocument;
  transcript: TranscriptSegment[];
  instruction: string;
  kind?: EditorAgentPlanKind;
  provider?: ProviderKind;
  model?: string;
  streamingMode?: boolean;
  onTextSnapshot?(text: string): void;
};

export type EditorAgentService = {
  draftPlan(request: DraftEditorAgentPlanRequest): Promise<EditorAgentPlan>;
};

export type AiProviderPreferencesProvider = () => AiProviderPreferences;

export function createEditorAgentService(
  providerService: ProviderService = createDefaultProviderService(),
  getProviderPreferences: AiProviderPreferencesProvider = loadAiProviderPreferences,
  getGenerationSettings: () => GenerationSettings = loadGenerationSettings,
): EditorAgentService {
  return {
    async draftPlan(request) {
      const kind = request.kind ?? "composition";
      const scenario = scenarioForVideoGenerationAsset(request.asset);
      const providerPreferences = getProviderPreferences().editorAgent;
      const generationSettings = getGenerationSettings();
      const prompt = createEditorAgentPrompt({
        asset: request.asset,
        summary: request.summary,
        transcript: request.transcript,
        instruction: request.instruction,
        kind,
      });
      const result = await providerService.complete({
        provider: request.provider ?? providerPreferences.provider,
        operation: "video_agent_plan",
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
        model: request.model ?? providerPreferences.model,
        streamingMode: request.streamingMode ?? providerPreferences.streamingMode,
        generationParams: generationSettings.video_agent_plan,
        onTextSnapshot: request.onTextSnapshot,
      });

      if (!result.ok) {
        throw new Error(result.message);
      }

      try {
        const plan = validateEditorAgentPlan(parseEditorAgentPlanJson(result.text), {
          fallbackKind: kind,
          fallbackScenario: scenario,
          transcript: request.transcript,
        });

        if (!plan.validation.ok) {
          throw new Error(plan.validation.errors.join("; "));
        }

        return plan;
      } catch (error) {
        const plan = createFallbackEditorAgentPlan({
          instruction: request.instruction,
          kind,
          scenario,
          transcript: request.transcript,
        });

        return {
          ...plan,
          validation: {
            ...plan.validation,
            warnings: [
              ...plan.validation.warnings,
              `Provider plan was replaced with a native fallback: ${
                error instanceof Error ? error.message : String(error)
              }`,
            ],
          },
        };
      }
    },
  };
}
