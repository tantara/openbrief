"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@acme/ui/button";
import { Label } from "@acme/ui/label";

import { useTRPC } from "~/trpc/react";

type Phase =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "waiting"; uploadId: string }
  | { kind: "uploadError"; message: string };

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

export function UploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [optInRanking, setOptInRanking] = useState(true);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const trpc = useTRPC();

  const polledUploadId = phase.kind === "waiting" ? phase.uploadId : null;
  const pollQuery = useQuery(
    trpc.youtube.uploadById.queryOptions(
      { id: polledUploadId ?? ZERO_UUID },
      { enabled: polledUploadId !== null, refetchInterval: 1500 },
    ),
  );

  const polled = pollQuery.data;
  useEffect(() => {
    if (phase.kind === "waiting" && polled?.status === "succeeded") {
      router.push("/youtube/dashboard");
    }
  }, [phase.kind, polled?.status, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setPhase({ kind: "uploading" });
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("optInRanking", optInRanking ? "true" : "false");
      const res = await fetch("/api/youtube/upload", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const text = await res.text();
        setPhase({
          kind: "uploadError",
          message: text || `HTTP ${res.status}`,
        });
        return;
      }
      const json = (await res.json()) as { uploadId: string };
      setPhase({ kind: "waiting", uploadId: json.uploadId });
    } catch (err) {
      setPhase({
        kind: "uploadError",
        message: err instanceof Error ? err.message : "upload failed",
      });
    }
  }

  const busy = phase.kind === "uploading" || phase.kind === "waiting";
  const extractionFailed =
    phase.kind === "waiting" && polled?.status === "failed";
  const errorMessage =
    phase.kind === "uploadError"
      ? phase.message
      : extractionFailed
        ? (polled.extractionError ?? "extraction failed")
        : null;

  return (
    <form
      onSubmit={onSubmit}
      className="border-border bg-card flex flex-col gap-6 rounded-lg border p-6"
    >
      <label
        htmlFor="screenshot"
        className="border-border bg-muted/30 hover:bg-muted/50 flex min-h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed p-6 text-center transition-colors"
      >
        <input
          id="screenshot"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={busy}
        />
        {file ? (
          <>
            <span className="text-sm font-medium">{file.name}</span>
            <span className="text-muted-foreground text-xs">
              {(file.size / 1024).toFixed(0)} KB · click to replace
            </span>
          </>
        ) : (
          <>
            <span className="text-base font-medium">
              Click to choose a screenshot
            </span>
            <span className="text-muted-foreground text-xs">
              PNG, JPEG, or WebP · 8 MB max
            </span>
          </>
        )}
      </label>

      <div className="flex items-center gap-3">
        <input
          id="optInRanking"
          type="checkbox"
          checked={optInRanking}
          onChange={(e) => setOptInRanking(e.target.checked)}
          disabled={busy}
          className="size-4"
        />
        <Label htmlFor="optInRanking" className="text-sm">
          Include me in this week's ranking
        </Label>
      </div>

      <Button type="submit" size="lg" disabled={!file || busy}>
        {phase.kind === "uploading" && "Uploading…"}
        {phase.kind === "waiting" && !extractionFailed && "Extracting stats…"}
        {(phase.kind === "idle" ||
          phase.kind === "uploadError" ||
          extractionFailed) &&
          "Extract stats"}
      </Button>

      {errorMessage && <p className="text-destructive text-sm">{errorMessage}</p>}
      {phase.kind === "waiting" && !extractionFailed && (
        <p className="text-muted-foreground text-sm">
          Hold on — we are reading the chart and totals.
        </p>
      )}
    </form>
  );
}
