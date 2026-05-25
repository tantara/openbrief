import { describe, expect, it, vi } from "vitest";
import type { HelperClient } from "@/services/fakeHelperClient";
import type { TauriInvoke } from "@/services/tauriHelperClient";
import { createVideoGenerationService } from "@/services/videoGenerationService";

describe("video generation service", () => {
  it("passes explicit catalog component names into generated composition HTML", async () => {
    const service = createVideoGenerationService();

    const composition = await service.generateComposition({
      asset: {
        id: "video-1",
        title: "Launch Notes",
        sourceKind: "local-file",
        originalUri: "file:///launch.mp4",
        libraryPath: "videos/video-1/launch.mp4",
        importStatus: "ready",
        createdAtIso: "2026-05-25T00:00:00.000Z",
      },
      prompt: "Add caption wipe.",
      componentNames: ["caption-clip-wipe"],
    });

    expect(composition.components?.map((component) => component.name)).toEqual([
      "caption-clip-wipe",
    ]);
    expect(composition.html).toContain(
      'data-openbrief-component="caption-clip-wipe"',
    );
  });

  it("preserves applied editor-agent storyboard scenes", async () => {
    const service = createVideoGenerationService();

    const composition = await service.generateComposition({
      asset: {
        id: "video-1",
        title: "Launch Notes",
        sourceKind: "local-file",
        originalUri: "file:///launch.mp4",
        libraryPath: "videos/video-1/launch.mp4",
        importStatus: "ready",
        createdAtIso: "2026-05-25T00:00:00.000Z",
      },
      prompt: "Use the plan.",
      storyboard: [
        {
          title: "Agent hook",
          narration: "Open from the editor agent plan.",
          startSeconds: 0,
          durationSeconds: 5,
        },
      ],
    });

    expect(composition.storyboard).toEqual([
      expect.objectContaining({ title: "Agent hook" }),
    ]);
    expect(composition.html).toContain("Open from the editor agent plan.");
  });

  it("renders a composition through the helper command contract", async () => {
    const events: string[] = [];
    const helperClient = {
      run: vi.fn(async (command, options) => {
        if (command.command === "render_html_composition") {
          options?.onEvent?.({
            type: "job_progress",
            jobId: command.jobId,
            command: command.command,
            progressPercent: 50,
            message: "starting media tool",
          });
          return {
            command: "render_html_composition" as const,
            videoPath: command.outputPath,
          };
        }

        throw new Error("unexpected command");
      }),
      eventsForJob: vi.fn(() => []),
    } satisfies HelperClient;
    const service = createVideoGenerationService({ helperClient });

    const render = await service.renderComposition({
      composition: {
        id: "composition-1",
        sourceId: "video-1",
        sourceType: "video",
        scenario: "summary-to-video",
        adapter: "deno-hyperframes",
        title: "Demo",
        prompt: "Demo",
        html: "<html></html>",
        entryPath: "videos/video-1/generated-video/composition-1/index.html",
        manifestPath:
          "videos/video-1/generated-video/composition-1/composition.json",
        renderPath: "videos/video-1/generated-video/composition-1/render.mp4",
        durationSeconds: 45,
        aspectRatio: "16:9",
        createdAtIso: "2026-05-25T00:00:00.000Z",
        updatedAtIso: "2026-05-25T00:00:00.000Z",
      },
      onEvent: (event) => events.push(event.type),
    });

    expect(helperClient.run).toHaveBeenCalledWith(
      {
        protocolVersion: 1,
        command: "render_html_composition",
        jobId: expect.stringMatching(/^video-generation-render-/),
        inputPath: "videos/video-1/generated-video/composition-1/index.html",
        outputPath: "videos/video-1/generated-video/composition-1/render.mp4",
        tempDir: "videos/video-1/generated-video/composition-1/tmp",
      },
      { onEvent: expect.any(Function) },
    );
    expect(events).toEqual(["job_progress"]);
    expect(render.outputPath).toBe(
      "videos/video-1/generated-video/composition-1/render.mp4",
    );
  });

  it("installs the native Deno runtime through the trusted command", async () => {
    const invokeCommandCalls: string[] = [];
    const invokeCommand: TauriInvoke = async <T>(command: string): Promise<T> => {
      invokeCommandCalls.push(command);

      if (command === "install_deno_runtime") {
        return {
          tool: "deno",
          version: "deno 2.8.0",
          activePath: "runtime-tools/aarch64-apple-darwin/deno",
          source: "downloaded",
        } as T;
      }

      throw new Error(`unexpected command:${command}`);
    };
    const service = createVideoGenerationService({
      invokeCommand,
      useTauriRuntime: true,
    });

    const result = await service.installRuntime();

    expect(invokeCommandCalls).toEqual(["install_deno_runtime"]);
    expect(result).toEqual({
      tool: "deno",
      version: "deno 2.8.0",
      activePath: "runtime-tools/aarch64-apple-darwin/deno",
      source: "downloaded",
    });
  });
});
