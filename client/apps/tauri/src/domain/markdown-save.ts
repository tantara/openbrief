import type { SummaryDocument, VideoAsset } from "@/domain/media-library";
import { sanitizePathSegment } from "@/domain/media-library";

export type MarkdownSavePayload = {
  suggestedFileName: string;
  targetPath?: string;
  markdown: string;
};

export function createMarkdownSavePayload({
  video,
  summary,
  targetPath,
}: {
  video: VideoAsset;
  summary: SummaryDocument;
  targetPath?: string;
}): MarkdownSavePayload {
  return {
    suggestedFileName: `${sanitizePathSegment(video.title).toLowerCase() || "summary"}.md`,
    targetPath,
    markdown: summary.markdown,
  };
}
