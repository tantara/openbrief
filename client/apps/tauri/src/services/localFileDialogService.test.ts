import {
  supportedAudioFileExtensions,
  supportedCsvFileExtensions,
  supportedPdfFileExtensions,
  supportedVideoFileExtensions,
} from "@/domain/ingest";
import { createLocalFileDialogService } from "@/services/localFileDialogService";
import { open } from "@tauri-apps/plugin-dialog";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

describe("localFileDialogService", () => {
  it("allows video, audio, PDF, and CSV imports from the computer picker", async () => {
    vi.mocked(open).mockResolvedValue("/tmp/interview.mp3");

    const service = createLocalFileDialogService();
    const selected = await service.selectVideoFile();

    expect(selected).toBe("/tmp/interview.mp3");
    expect(open).toHaveBeenCalledWith({
      title: "Select from computer",
      multiple: false,
      directory: false,
      filters: [
        {
          name: "Media",
          extensions: [
            ...supportedVideoFileExtensions,
            ...supportedAudioFileExtensions,
            ...supportedPdfFileExtensions,
            ...supportedCsvFileExtensions,
          ],
        },
      ],
    });
  });
});
