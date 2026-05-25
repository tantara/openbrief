import type {
  EditorAgentMessage,
  EditorAgentPlan,
  EditorAgentPlanKind,
} from "@/domain/editor-agent";
import type {
  SummaryDocument,
  TranscriptSegment,
  VideoAsset,
} from "@/domain/media-library";
import type {
  VideoGenerationAspectRatio,
  VideoGenerationComposition,
  VideoGenerationRender,
} from "@/domain/video-generation";
import { createEditorAgentMessage } from "@/domain/editor-agent";
import { mediaSourceTypeForAsset } from "@/domain/media-library";
import { dimensionsForVideoGenerationAspectRatio } from "@/domain/video-generation";
import { EditorAgentPanel } from "@/features/editor/EditorAgentPanel";
import {
  createVideoGenerationService,
  type VideoGenerationRuntimeStatus,
} from "@/services/videoGenerationService";
import {
  createEditorAgentService,
  type EditorAgentService,
} from "@/services/editorAgentService";
import {
  defaultAiProviderPreferences,
  type AiWorkflowProviderConfig,
} from "@/services/aiProviderPreferencesService";
import { resolveLibraryAssetUrl } from "@/services/libraryAssetUrl";
import { useI18n } from "@/i18n";
import { useEffect, useMemo, useState } from "react";
import { Clapperboard, FileText, Loader2, Play, Sparkles } from "lucide-react";
import "@hyperframes/player";

import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@acme/ui/card";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@acme/ui/resizable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@acme/ui/select";
import { Textarea } from "@acme/ui/textarea";

export type EditorViewProps = {
  videos: VideoAsset[];
  selectedVideoId?: string;
  selectedVideo?: VideoAsset;
  selectedSummary?: SummaryDocument;
  selectedTranscript: TranscriptSegment[];
  latestComposition?: VideoGenerationComposition;
  compositionHistory: VideoGenerationComposition[];
  rendersByCompositionId: Record<string, VideoGenerationRender[]>;
  onSelectVideo(videoId: string): void;
  onSaveComposition(composition: VideoGenerationComposition): void;
  onSaveRender(render: VideoGenerationRender): void;
  editorAgentProviderConfig?: AiWorkflowProviderConfig;
  onEditorAgentProviderConfigChange?(config: AiWorkflowProviderConfig): void;
  editorAgentService?: EditorAgentService;
};

export function EditorView({
  videos,
  selectedVideoId,
  selectedVideo,
  selectedSummary,
  selectedTranscript,
  latestComposition,
  compositionHistory,
  rendersByCompositionId,
  onSelectVideo,
  onSaveComposition,
  onSaveRender,
  editorAgentProviderConfig,
  onEditorAgentProviderConfigChange,
  editorAgentService,
}: EditorViewProps) {
  const { t } = useI18n();
  const service = useMemo(() => createVideoGenerationService(), []);
  const agentService = useMemo(
    () => editorAgentService ?? createEditorAgentService(),
    [editorAgentService],
  );
  const [runtimeStatus, setRuntimeStatus] =
    useState<VideoGenerationRuntimeStatus>();
  const [runtimeError, setRuntimeError] = useState<string>();
  const [isInspecting, setIsInspecting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [activeCompositionId, setActiveCompositionId] = useState<string>();
  const [prompt, setPrompt] = useState("");
  const [renderUrl, setRenderUrl] = useState<string>();
  const [renderProgress, setRenderProgress] = useState<number>();
  const [renderStatus, setRenderStatus] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [agentMessages, setAgentMessages] = useState<EditorAgentMessage[]>([]);
  const [agentInput, setAgentInput] = useState("");
  const [isAgentDrafting, setIsAgentDrafting] = useState(false);
  const [activeAgentPlan, setActiveAgentPlan] = useState<EditorAgentPlan>();
  const [aspectRatio, setAspectRatio] =
    useState<VideoGenerationAspectRatio>("16:9");
  const [localEditorAgentProviderConfig, setLocalEditorAgentProviderConfig] =
    useState<AiWorkflowProviderConfig>(defaultAiProviderPreferences.editorAgent);

  const activeComposition =
    compositionHistory.find((composition) => composition.id === activeCompositionId) ??
    latestComposition;
  const latestRender = activeComposition
    ? rendersByCompositionId[activeComposition.id]?.[0]
    : undefined;
  const previewDimensions = activeComposition
    ? dimensionsForVideoGenerationAspectRatio(activeComposition.aspectRatio)
    : undefined;
  const previewAspectRatio = activeComposition?.aspectRatio ?? aspectRatio;
  const agentProviderConfig =
    editorAgentProviderConfig ?? localEditorAgentProviderConfig;

  useEffect(() => {
    if (!activeCompositionId && latestComposition) {
      setActiveCompositionId(latestComposition.id);
    }
  }, [activeCompositionId, latestComposition]);

  useEffect(() => {
    let disposed = false;

    if (!latestRender) {
      setRenderUrl(undefined);
      return;
    }

    void resolveLibraryAssetUrl(latestRender.outputPath)
      .then((url) => {
        if (!disposed) setRenderUrl(url);
      })
      .catch(() => {
        if (!disposed) setRenderUrl(undefined);
      });

    return () => {
      disposed = true;
    };
  }, [latestRender?.outputPath]);

  async function inspectRuntime() {
    setIsInspecting(true);
    setRuntimeError(undefined);
    try {
      return await inspectRuntimeStatus();
    } catch (error) {
      setRuntimeStatus(undefined);
      setRuntimeError(error instanceof Error ? error.message : String(error));
      return undefined;
    } finally {
      setIsInspecting(false);
    }
  }

  async function inspectRuntimeStatus() {
    const status = await service.inspectRuntime();

    setRuntimeStatus(status);
    setRuntimeError(undefined);

    return status;
  }

  async function generateComposition(overrides: {
    prompt?: string;
    componentNames?: string[];
    storyboard?: EditorAgentPlan["storyboard"];
  } = {}) {
    if (!selectedVideo) return;

    setIsGenerating(true);
    setActionError(undefined);
    try {
      const composition = await service.generateComposition({
        asset: selectedVideo,
        summary: selectedSummary,
        transcript: selectedTranscript,
        prompt: overrides.prompt ?? prompt,
        aspectRatio,
        componentNames: overrides.componentNames,
        storyboard: overrides.storyboard,
      });
      onSaveComposition(composition);
      setActiveCompositionId(composition.id);
      setRenderProgress(undefined);
      setRenderStatus(undefined);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsGenerating(false);
    }
  }

  async function draftEditorAgentPlan(
    kind: EditorAgentPlanKind,
    instructionOverride?: string,
  ) {
    if (!selectedVideo) return;

    const instruction = (instructionOverride ?? agentInput).trim();
    const userMessage = createEditorAgentMessage({
      role: "user",
      content:
        instruction ||
        (kind === "transcript-edit"
          ? t("editor.agent.defaultCuts")
          : t("editor.agent.defaultVideo")),
    });

    setAgentMessages((messages) => [...messages, userMessage]);
    setIsAgentDrafting(true);
    setActionError(undefined);

    try {
      const plan = await agentService.draftPlan({
        asset: selectedVideo,
        summary: selectedSummary,
        transcript: selectedTranscript,
        instruction: instruction || userMessage.content,
        kind,
        provider: agentProviderConfig.provider,
        model: agentProviderConfig.model,
        streamingMode: agentProviderConfig.streamingMode,
      });
      const assistantMessage = createEditorAgentMessage({
        role: "assistant",
        content: plan.summary,
        plan,
      });

      setActiveAgentPlan(plan);
      setAgentMessages((messages) => [...messages, assistantMessage]);
      if (!instructionOverride) setAgentInput("");
      await executeEditorAgentPlan(plan);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setActionError(message);
      setAgentMessages((messages) => [
        ...messages,
        createEditorAgentMessage({
          role: "assistant",
          content: message,
        }),
      ]);
    } finally {
      setIsAgentDrafting(false);
    }
  }

  async function executeEditorAgentPlan(plan: EditorAgentPlan) {
    if (plan.kind !== "composition" || !plan.validation.ok) {
      return;
    }

    setActiveAgentPlan(plan);
    await generateComposition({
      prompt: plan.direction || plan.summary,
      componentNames: plan.componentNames,
      storyboard: plan.storyboard,
    });
  }

  async function renderComposition() {
    if (!activeComposition) return;

    setIsRendering(true);
    setActionError(undefined);
    setRenderProgress(0);
    setRenderStatus(undefined);
    try {
      const status = runtimeStatus?.available ? runtimeStatus : await inspectRuntimeStatus();

      if (!status.available) {
        setRuntimeError(status.message);
        setRenderProgress(undefined);
        return;
      }

      const render = await service.renderComposition({
        composition: activeComposition,
        onEvent(event) {
          if (event.type === "job_progress") {
            setRenderProgress(event.progressPercent);
            setRenderStatus(event.message);
          }
          if (event.type === "job_started") {
            setRenderStatus(undefined);
          }
          if (event.type === "job_failed") {
            setActionError(event.message);
          }
        },
      });
      onSaveRender(render);
      setRenderProgress(100);
      setRenderStatus(render.outputPath);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRendering(false);
    }
  }

  const scenarioLabel =
    selectedVideo && mediaSourceTypeForAsset(selectedVideo) === "pdf"
      ? t("editor.scenario.pdf")
      : t("editor.scenario.summary");

  return (
    <ResizablePanelGroup
      id="editor-columns"
      direction="horizontal"
      className="min-h-[calc(100vh-6.5rem)]"
    >
      <ResizablePanel id="editor-controls" defaultSize="24%" minSize="260px">
        <Card className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3 text-base">
              <span>{t("editor.title")}</span>
              <Clapperboard className="text-muted-foreground h-5 w-5" aria-hidden="true" />
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              {t("editor.subtitle")}
            </p>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="editor-source">
                  {t("editor.source")}
                </label>
                <Select value={selectedVideoId} onValueChange={onSelectVideo}>
                  <SelectTrigger id="editor-source">
                    <SelectValue placeholder={t("editor.source.placeholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {videos.map((video) => (
                      <SelectItem key={video.id} value={video.id}>
                        {video.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <ScenarioPill label={scenarioLabel} active />
                <ScenarioPill label={t("editor.scenario.csv")} disabled />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="editor-aspect">
                  {t("editor.aspect")}
                </label>
                <Select
                  value={aspectRatio}
                  onValueChange={(value) =>
                    setAspectRatio(value as VideoGenerationAspectRatio)
                  }
                >
                  <SelectTrigger id="editor-aspect">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="16:9">
                      {t("editor.aspect.landscape")}
                    </SelectItem>
                    <SelectItem value="9:16">
                      {t("editor.aspect.portrait")}
                    </SelectItem>
                    <SelectItem value="1:1">
                      {t("editor.aspect.square")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="editor-prompt">
                  {t("editor.prompt")}
                </label>
                <Textarea
                  id="editor-prompt"
                  value={prompt}
                  placeholder={t("editor.prompt.placeholder")}
                  onChange={(event) => setPrompt(event.target.value)}
                  className="min-h-28 resize-none"
                />
              </div>

              <div className="space-y-2">
                <Button
                  type="button"
                  className="w-full justify-start"
                  onClick={() => void generateComposition()}
                  disabled={!selectedVideo || isGenerating}
                >
                  {isGenerating ? (
                    <Loader2
                      className="mr-2 h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  {t("editor.generate")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={inspectRuntime}
                  disabled={isInspecting}
                >
                  {isInspecting ? (
                    <Loader2
                      className="mr-2 h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  {t("editor.inspect")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={renderComposition}
                  disabled={!activeComposition || isInspecting || isRendering}
                >
                  {isRendering ? (
                    <Loader2
                      className="mr-2 h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Play className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  {t("editor.render")}
                </Button>
              </div>

              <div className="border-border rounded-md border p-3 text-sm">
                <div className="font-medium">{t("editor.runtime")}</div>
                <p className="text-muted-foreground mt-1">
                  {runtimeError ??
                    (runtimeStatus
                      ? runtimeStatus.available
                        ? t("editor.runtime.ready")
                        : runtimeStatus.message
                      : t("editor.runtime.pending"))}
                </p>
              </div>

              {compositionHistory.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-sm font-medium">
                    {t("editor.compositions")}
                  </div>
                  <div className="space-y-2">
                    {compositionHistory.map((composition) => (
                      <button
                        key={composition.id}
                        type="button"
                        className="border-border hover:bg-muted/60 data-[active=true]:border-primary data-[active=true]:bg-primary/10 w-full rounded-md border px-3 py-2 text-left text-sm"
                        data-active={composition.id === activeComposition?.id}
                        onClick={() => setActiveCompositionId(composition.id)}
                      >
                        <div className="truncate font-medium">
                          {composition.title}
                        </div>
                        <div className="text-muted-foreground mt-1 truncate text-xs">
                          {composition.entryPath}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </ResizablePanel>

      <ResizableHandle withHandle className="mx-2" />

      <ResizablePanel id="editor-preview" defaultSize="50%" minSize="360px">
        <section className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_220px] gap-4">
          <div className="border-border bg-black min-h-0 overflow-hidden rounded-md border p-4">
            {activeComposition ? (
              <div
                className={`mx-auto flex max-h-full max-w-full items-center justify-center overflow-hidden bg-black ${previewFrameClassName(previewAspectRatio)}`}
                data-testid="editor-preview-frame"
                data-preview-aspect={previewAspectRatio}
              >
                <hyperframes-player
                  className="block h-full w-full bg-black"
                  srcdoc={activeComposition.html}
                  width={previewDimensions?.width}
                  height={previewDimensions?.height}
                  controls
                  muted
                  aria-label={t("editor.preview")}
                />
              </div>
            ) : (
              <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
                {t("editor.preview.empty")}
              </div>
            )}
          </div>
          <div className="border-border bg-card/40 grid min-h-0 grid-cols-[1fr_320px] gap-4 rounded-md border p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">
                  {t("editor.rendered")}
                </h3>
                {latestRender ? <Badge variant="secondary">MP4</Badge> : null}
                {isRendering ? (
                  <Badge variant="outline">{renderProgress ?? 0}%</Badge>
                ) : null}
              </div>
              <p className="text-muted-foreground mt-2 truncate text-sm">
                {actionError ??
                  renderStatus ??
                  latestRender?.outputPath ??
                  t("editor.rendered.empty")}
              </p>
            </div>
            <div className="bg-muted/40 min-h-0 overflow-hidden rounded-md">
              {renderUrl ? (
                <video className="h-full w-full" controls src={renderUrl} />
              ) : (
                <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
                  {t("editor.rendered.previewEmpty")}
                </div>
              )}
            </div>
          </div>
        </section>
      </ResizablePanel>

      <ResizableHandle withHandle className="mx-2" />

      <ResizablePanel id="editor-agent" defaultSize="26%" minSize="280px">
        <EditorAgentPanel
          messages={agentMessages}
          input={agentInput}
          disabled={!selectedVideo}
          isDrafting={isAgentDrafting}
          activePlan={activeAgentPlan}
          providerConfig={agentProviderConfig}
          onInputChange={setAgentInput}
          onSubmit={draftEditorAgentPlan}
          onProviderConfigChange={(config) => {
            if (onEditorAgentProviderConfigChange) {
              onEditorAgentProviderConfigChange(config);
              return;
            }

            setLocalEditorAgentProviderConfig(config);
          }}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function previewFrameClassName(aspectRatio: VideoGenerationAspectRatio) {
  switch (aspectRatio) {
    case "9:16":
      return "aspect-[9/16] h-full";
    case "1:1":
      return "aspect-square h-full";
    case "16:9":
      return "aspect-video w-full";
  }
}

function ScenarioPill({
  label,
  active,
  disabled,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <div
      className="border-border data-[active=true]:border-primary data-[active=true]:bg-primary/10 data-[disabled=true]:opacity-55 rounded-md border px-3 py-2 text-sm"
      data-active={active}
      data-disabled={disabled}
    >
      {label}
    </div>
  );
}
