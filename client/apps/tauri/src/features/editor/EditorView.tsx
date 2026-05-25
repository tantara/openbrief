import type { SummaryDocument, TranscriptSegment, VideoAsset } from "@/domain/media-library";
import type {
  VideoGenerationComposition,
  VideoGenerationRender,
} from "@/domain/video-generation";
import { mediaSourceTypeForAsset } from "@/domain/media-library";
import {
  createVideoGenerationService,
  type VideoGenerationRuntimeStatus,
} from "@/services/videoGenerationService";
import { resolveLibraryAssetUrl } from "@/services/libraryAssetUrl";
import { useI18n } from "@/i18n";
import { useEffect, useMemo, useState } from "react";
import { Clapperboard, FileText, Loader2, Play, Sparkles } from "lucide-react";
import "@hyperframes/player";

import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
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
}: EditorViewProps) {
  const { t } = useI18n();
  const service = useMemo(() => createVideoGenerationService(), []);
  const [runtimeStatus, setRuntimeStatus] =
    useState<VideoGenerationRuntimeStatus>();
  const [runtimeError, setRuntimeError] = useState<string>();
  const [isInspecting, setIsInspecting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [activeCompositionId, setActiveCompositionId] = useState<string>();
  const [prompt, setPrompt] = useState("");
  const [renderUrl, setRenderUrl] = useState<string>();

  const activeComposition =
    compositionHistory.find((composition) => composition.id === activeCompositionId) ??
    latestComposition;
  const latestRender = activeComposition
    ? rendersByCompositionId[activeComposition.id]?.[0]
    : undefined;

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
      setRuntimeStatus(await service.inspectRuntime());
    } catch (error) {
      setRuntimeStatus(undefined);
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsInspecting(false);
    }
  }

  async function generateComposition() {
    if (!selectedVideo) return;

    setIsGenerating(true);
    try {
      const composition = await service.generateComposition({
        asset: selectedVideo,
        summary: selectedSummary,
        transcript: selectedTranscript,
        prompt,
      });
      onSaveComposition(composition);
      setActiveCompositionId(composition.id);
    } finally {
      setIsGenerating(false);
    }
  }

  async function renderComposition() {
    if (!activeComposition || !runtimeStatus?.available) return;

    setIsRendering(true);
    try {
      const render = await service.renderComposition({ composition: activeComposition });
      onSaveRender(render);
    } finally {
      setIsRendering(false);
    }
  }

  const scenarioLabel =
    selectedVideo && mediaSourceTypeForAsset(selectedVideo) === "pdf"
      ? t("editor.scenario.pdf")
      : t("editor.scenario.summary");

  return (
    <div className="grid min-h-[calc(100vh-6.5rem)] grid-cols-[360px_minmax(0,1fr)] gap-6">
      <aside className="border-border bg-card/60 flex min-h-0 flex-col rounded-md border p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{t("editor.title")}</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {t("editor.subtitle")}
            </p>
          </div>
          <Clapperboard className="text-muted-foreground h-5 w-5" aria-hidden="true" />
        </div>

        <div className="mt-5 space-y-4">
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
              onClick={generateComposition}
              disabled={!selectedVideo || isGenerating}
            >
              {isGenerating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
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
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
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
              disabled={!activeComposition || !runtimeStatus?.available || isRendering}
            >
              {isRendering ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
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
              <div className="text-sm font-medium">{t("editor.compositions")}</div>
              <div className="space-y-2">
                {compositionHistory.map((composition) => (
                  <button
                    key={composition.id}
                    type="button"
                    className="border-border hover:bg-muted/60 data-[active=true]:border-primary data-[active=true]:bg-primary/10 w-full rounded-md border px-3 py-2 text-left text-sm"
                    data-active={composition.id === activeComposition?.id}
                    onClick={() => setActiveCompositionId(composition.id)}
                  >
                    <div className="truncate font-medium">{composition.title}</div>
                    <div className="text-muted-foreground mt-1 truncate text-xs">
                      {composition.entryPath}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </aside>

      <section className="grid min-h-0 grid-rows-[minmax(0,1fr)_220px] gap-4">
        <div className="border-border bg-card/40 min-h-0 overflow-hidden rounded-md border">
          {activeComposition ? (
            <hyperframes-player
              className="block h-full w-full bg-black"
              srcdoc={activeComposition.html}
              width={activeComposition.aspectRatio === "9:16" ? 1080 : 1920}
              height={
                activeComposition.aspectRatio === "9:16"
                  ? 1920
                  : activeComposition.aspectRatio === "1:1"
                    ? 1080
                    : 1080
              }
              controls
              muted
              aria-label={t("editor.preview")}
            />
          ) : (
            <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
              {t("editor.preview.empty")}
            </div>
          )}
        </div>
        <div className="border-border bg-card/40 grid min-h-0 grid-cols-[1fr_320px] gap-4 rounded-md border p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">{t("editor.rendered")}</h3>
              {latestRender ? <Badge variant="secondary">MP4</Badge> : null}
            </div>
            <p className="text-muted-foreground mt-2 truncate text-sm">
              {latestRender?.outputPath ?? t("editor.rendered.empty")}
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
    </div>
  );
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
