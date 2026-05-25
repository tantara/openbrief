import type { VideoAsset } from "@/domain/media-library";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n";
import { resolveLibraryAssetUrl } from "@/services/libraryAssetUrl";
import { canUseTauriRuntime } from "@/services/tauriHelperClient";
import { FileSpreadsheet } from "lucide-react";

type CsvViewerProps = {
  media: VideoAsset;
};

export function CsvViewer({ media }: CsvViewerProps) {
  const { t } = useI18n();
  const [preview, setPreview] = useState<CsvPreview>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadCsv() {
      setFailed(false);
      setPreview(undefined);

      try {
        const url = canUseTauriRuntime()
          ? await resolveLibraryAssetUrl(media.libraryPath)
          : media.libraryPath;
        if (!url) {
          throw new Error("csv_file_unavailable");
        }

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`csv_fetch_failed:${response.status}`);
        }

        const text = await response.text();
        if (!cancelled) {
          setPreview(
            parseCsvPreview(text, (index) =>
              t("csv.viewer.column", { index: index + 1 }),
            ),
          );
        }
      } catch {
        if (!cancelled) {
          setPreview(undefined);
          setFailed(true);
        }
      }
    }

    void loadCsv();

    return () => {
      cancelled = true;
    };
  }, [media.libraryPath, t]);

  if (!preview) {
    return (
      <div className="bg-muted text-muted-foreground flex aspect-video min-h-64 flex-col items-center justify-center gap-3 rounded-md p-5 text-center text-sm">
        <FileSpreadsheet className="h-8 w-8" aria-hidden="true" />
        {failed ? t("csv.viewer.fileUnavailable") : t("csv.viewer.loading")}
      </div>
    );
  }

  return (
    <div className="border-border bg-background flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
      <div className="border-border border-b px-3 py-2 text-sm font-medium">
        {media.title}
      </div>
      <div className="min-h-64 flex-1 overflow-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="bg-muted sticky top-0">
            <tr>
              {preview.headers.map((header, index) => (
                <th
                  key={`${header}-${index}`}
                  className="border-border max-w-52 border-r border-b px-2 py-1.5 font-medium"
                >
                  <span className="line-clamp-2 break-words">{header}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="odd:bg-muted/30">
                {preview.headers.map((_, columnIndex) => (
                  <td
                    key={columnIndex}
                    className="border-border max-w-52 border-r border-b px-2 py-1.5 align-top"
                  >
                    <span className="line-clamp-3 break-words">
                      {row[columnIndex] ?? ""}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type CsvPreview = {
  headers: string[];
  rows: string[][];
};

function parseCsvPreview(
  text: string,
  fallbackHeader: (index: number) => string,
): CsvPreview {
  const rows = parseCsvRows(text).slice(0, 13);
  const firstRow = rows[0] ?? [];
  const columnCount = Math.min(Math.max(firstRow.length, 1), 8);
  const headers = Array.from({ length: columnCount }, (_, index) => {
    const header = firstRow[index]?.trim();
    return header || fallbackHeader(index);
  });

  return {
    headers,
    rows: rows.slice(1, 13).map((row) => row.slice(0, columnCount)),
  };
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((candidate) => candidate.some((value) => value.trim()));
}
