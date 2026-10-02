import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";

export type ManifestFormat = "json" | "csv";

/**
 * The slice of a bulk manifest item the writer needs. Declared structurally
 * so this module stays a leaf — config must not depend on clockify-sdk.
 */
export interface ManifestItem {
  timeEntryId: string;
  status: string;
  before?: { projectId?: string };
  changes?: { customFieldId: string; name?: string; from: unknown; to: unknown }[];
  error?: string;
}

export interface ManifestFileResult {
  path: string;
  format: ManifestFormat;
  items: number;
}

const ALLOWED_EXTENSIONS = [".json", ".csv"];

/**
 * Reject anything but a .json/.csv destination. The path itself comes from
 * tool input, so without this a caller could be steered into overwriting
 * source files, configs or credentials with manifest output.
 */
export function assertWritableManifestPath(filePath: string): string {
  const absolutePath = resolve(filePath);
  const extension = extname(absolutePath).toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    throw new Error(
      `outputFile must end in .json or .csv (got "${extension || "no extension"}"). Refusing to write ${absolutePath}`
    );
  }
  return absolutePath;
}

/** Pick the format from the file extension unless the caller named one. */
export function resolveManifestFormat(
  filePath: string,
  requested?: ManifestFormat
): ManifestFormat {
  if (requested) return requested;
  return filePath.toLowerCase().endsWith(".csv") ? "csv" : "json";
}

// Leading =, +, - and @ make a spreadsheet treat the cell as a formula.
// Custom field values are user-entered, so they are quoted and prefixed.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  const safe = FORMULA_PREFIX.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const CSV_HEADER = [
  "timeEntryId",
  "status",
  "projectId",
  "customFieldId",
  "customFieldName",
  "from",
  "to",
  "error",
];

/**
 * One row per changed cell, which is the shape a backfill audit is read in.
 * Entries with no cell changes (unchanged or failed) still get a row so the
 * file accounts for every entry the run touched.
 */
function toCsv(items: readonly ManifestItem[]): string {
  const rows = [CSV_HEADER.join(",")];

  for (const item of items) {
    const projectId = item.before?.projectId ?? "";
    if (!item.changes?.length) {
      rows.push(
        [item.timeEntryId, item.status, projectId, "", "", "", "", item.error]
          .map(csvCell)
          .join(",")
      );
      continue;
    }
    for (const change of item.changes) {
      rows.push(
        [
          item.timeEntryId,
          item.status,
          projectId,
          change.customFieldId,
          change.name,
          change.from,
          change.to,
          item.error,
        ]
          .map(csvCell)
          .join(",")
      );
    }
  }

  return `${rows.join("\n")}\n`;
}

/**
 * Write the per-entry manifest to disk so a 500-entry run doesn't have to
 * come back through the response. Parent directories are created; an
 * existing file is replaced, because re-running a capped backfill and
 * overwriting its manifest is the normal loop.
 */
export async function writeManifestFile(
  filePath: string,
  format: ManifestFormat,
  manifest: Record<string, unknown> & { items: ManifestItem[] }
): Promise<ManifestFileResult> {
  const absolutePath = assertWritableManifestPath(filePath);
  await mkdir(dirname(absolutePath), { recursive: true });

  const contents =
    format === "csv"
      ? toCsv(manifest.items)
      : `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(absolutePath, contents, "utf8");

  return { path: absolutePath, format, items: manifest.items.length };
}
