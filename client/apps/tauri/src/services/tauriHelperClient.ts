import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  HelperCommand,
  HelperCommandName,
  HelperCommandResult,
  HelperErrorCode,
  HelperEvent,
} from "@/domain/helper-protocol";
import type { HelperClient, HelperRunOptions } from "@/services/fakeHelperClient";

export type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

type RawHelperRunResult = {
  events: RawHelperEvent[];
  result: HelperCommandResult;
};

type RawHelperEvent = {
  event: string;
  jobId: string;
  command?: HelperCommandName;
  progress?: number;
  message?: string;
  result?: HelperCommandResult;
  error?: {
    message?: string;
    code?: HelperErrorCode;
  };
};

export class TauriHelperClient implements HelperClient {
  private readonly events = new Map<string, HelperEvent[]>();

  constructor(private readonly invokeCommand: TauriInvoke = invoke) {}

  async run(
    command: HelperCommand,
    options: HelperRunOptions = {},
  ): Promise<HelperCommandResult> {
    const unlisten =
      options.onEvent && canUseTauriRuntime()
        ? await listen<RawHelperEvent>("openbrief://helper-event", (event) => {
            const helperEvent = mapHelperEvent(command, event.payload);

            if (
              helperEvent.jobId === command.jobId ||
              (helperEvent.type === "job_cancelled" &&
                helperEvent.targetJobId === command.jobId)
            ) {
              this.recordEvent(command.jobId, helperEvent);
              options.onEvent?.(helperEvent);
            }
          })
        : undefined;

    try {
      const response = await this.invokeCommand<RawHelperRunResult>(
        "run_helper_command",
        {
          command,
        },
      );
      const events = response.events.map((event) => mapHelperEvent(command, event));

      for (const event of events) {
        this.recordEvent(command.jobId, event);
      }

      return response.result;
    } finally {
      unlisten?.();
    }
  }

  eventsForJob(jobId: string) {
    return this.events.get(jobId) ?? [];
  }

  private recordEvent(jobId: string, event: HelperEvent) {
    const current = this.events.get(jobId) ?? [];

    if (!current.some((candidate) => helperEventKey(candidate) === helperEventKey(event))) {
      this.events.set(jobId, [...current, event]);
    }
  }
}

export function canUseTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function helperEventKey(event: HelperEvent) {
  switch (event.type) {
    case "job_progress":
      return `${event.type}:${event.jobId}:${event.progressPercent}:${event.message ?? ""}`;
    case "job_completed":
      return `${event.type}:${event.jobId}`;
    case "job_failed":
      return `${event.type}:${event.jobId}:${event.message}`;
    case "job_cancelled":
      return `${event.type}:${event.jobId}:${event.targetJobId}`;
    case "job_started":
    default:
      return `${event.type}:${event.jobId}`;
  }
}

function mapHelperEvent(command: HelperCommand, event: RawHelperEvent): HelperEvent {
  const commandName = event.command ?? command.command;
  const jobId = event.jobId || command.jobId;

  switch (event.event) {
    case "job_started":
      return {
        type: "job_started",
        jobId,
        command: commandName,
      };
    case "job_progress":
      return {
        type: "job_progress",
        jobId,
        command: commandName,
        progressPercent: Math.round((event.progress ?? 0) * 100),
        message: event.message,
      };
    case "job_completed":
      return {
        type: "job_completed",
        jobId,
        command: commandName,
        result: event.result ?? commandResultFallback(command, event),
      };
    case "job_cancelled":
      return {
        type: "job_cancelled",
        jobId,
        command: "cancel_job",
        targetJobId:
          command.command === "cancel_job" ? command.targetJobId : command.jobId,
      };
    case "job_failed":
    default:
      return {
        type: "job_failed",
        jobId,
        command: commandName,
        errorCode: event.error?.code ?? "helper_unavailable",
        message: event.error?.message ?? "helper_unavailable",
      };
  }
}

function commandResultFallback(
  command: HelperCommand,
  event: RawHelperEvent,
): HelperCommandResult {
  if (event.result) {
    return event.result;
  }

  if (command.command === "cancel_job") {
    return {
      command: "cancel_job",
      targetJobId: command.targetJobId,
      cancelled: true,
    };
  }

  throw new Error(`helper_result_missing:${command.command}`);
}
