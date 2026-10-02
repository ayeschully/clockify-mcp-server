export interface CustomFieldValue {
  customFieldId: string;
  value: unknown;
}

export interface CustomFieldInfo {
  id: string;
  name?: string;
  type?: string;
}

export interface CustomFieldChange {
  customFieldId: string;
  name?: string;
  from: unknown;
  to: unknown;
}

/**
 * Whether Clockify would show this cell as blank: null/undefined, a string
 * that is empty or only whitespace, or an empty list (multi-select fields).
 * `fill-empty` backfills exactly these.
 */
export function isEmptyCustomFieldValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Compare two custom field values for "already the same".
 *
 * Values arrive from three endpoints with inconsistent primitive types — a
 * NUMBER field comes back as 7 on an entry and "7" as a project default —
 * so primitives are compared as strings. Comparing them with === would
 * report a spurious difference and rewrite every cell in overwrite mode.
 */
export function sameCustomFieldValue(a: unknown, b: unknown): boolean {
  const aEmpty = isEmptyCustomFieldValue(a);
  const bEmpty = isEmptyCustomFieldValue(b);
  if (aEmpty || bEmpty) return aEmpty && bEmpty;

  if (typeof a === "object" || typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return String(a) === String(b);
}

/**
 * How a cleared cell is represented in the PUT body. Clockify accepts a
 * literal null for most field types; `typed-empty` is the fallback for the
 * ones that reject it.
 */
export type ClearStrategy = "null" | "typed-empty";

/** The blank Clockify expects for a field type under `typed-empty`. */
function emptyValueForType(type?: string): unknown {
  return String(type ?? "").toUpperCase().includes("MULTIPLE") ? [] : "";
}

/**
 * Overlay custom field edits onto an entry's current values.
 *
 * PUT /time-entries/{id} replaces the entry, but NOT its custom fields:
 * verified against the live API, Clockify KEEPS any custom field missing
 * from the `customFields` array rather than clearing it. So a cleared field
 * must be named explicitly with a blank value — omitting it is a silent
 * no-op that still reports success.
 *
 * Current values that are already blank are still dropped, since there is
 * nothing to preserve and some field types reject a null echo. Fields the
 * caller didn't name are passed through untouched.
 */
export function mergeCustomFieldValues(
  current: readonly CustomFieldValue[],
  edits: readonly CustomFieldValue[],
  infoById?: ReadonlyMap<string, CustomFieldInfo>,
  clearStrategy: ClearStrategy = "null"
): CustomFieldValue[] {
  const merged = new Map<string, unknown>();
  for (const field of current) {
    if (!isEmptyCustomFieldValue(field.value)) {
      merged.set(field.customFieldId, field.value);
    }
  }

  for (const edit of edits) {
    if (!isEmptyCustomFieldValue(edit.value)) {
      merged.set(edit.customFieldId, edit.value);
      continue;
    }
    merged.set(
      edit.customFieldId,
      clearStrategy === "null"
        ? null
        : emptyValueForType(infoById?.get(edit.customFieldId)?.type)
    );
  }

  return [...merged].map(([customFieldId, value]) => ({
    customFieldId,
    value,
  }));
}

/** Ids the edit set would clear, in the order they were given. */
export function clearedFieldIds(
  edits: readonly CustomFieldValue[]
): string[] {
  return edits
    .filter((edit) => isEmptyCustomFieldValue(edit.value))
    .map((edit) => edit.customFieldId);
}

/**
 * The cell-level diff an edit would produce. Edits that match the current
 * value are left out, so an empty result means the write is a no-op and can
 * be skipped entirely.
 */
export function describeCustomFieldChanges(
  current: readonly CustomFieldValue[],
  edits: readonly CustomFieldValue[],
  infoById?: ReadonlyMap<string, CustomFieldInfo>
): CustomFieldChange[] {
  const currentById = new Map(
    current.map((field) => [field.customFieldId, field.value])
  );

  return edits
    .filter(
      (edit) =>
        !sameCustomFieldValue(currentById.get(edit.customFieldId), edit.value)
    )
    .map((edit) => ({
      customFieldId: edit.customFieldId,
      name: infoById?.get(edit.customFieldId)?.name,
      from: currentById.get(edit.customFieldId) ?? null,
      to: edit.value,
    }));
}

export interface FieldResolution {
  fields: CustomFieldInfo[];
  unresolved: string[];
}

/**
 * Resolve a mixed list of custom field ids and names against the workspace
 * field list. Unknown references are reported rather than thrown so a
 * backfill still runs for the fields that do exist — but they are never
 * silently dropped, because a field missing from a backfill looks identical
 * to a field that had nothing to backfill.
 */
export function resolveCustomFieldRefs(
  refs: readonly string[],
  workspaceFields: readonly any[]
): FieldResolution {
  const byId = new Map<string, any>();
  const byName = new Map<string, any>();
  const ambiguousNames = new Set<string>();
  for (const field of workspaceFields) {
    byId.set(field.id, field);
    const key = String(field.name).trim().toLowerCase();
    if (byName.has(key)) ambiguousNames.add(key);
    byName.set(key, field);
  }

  const fields: CustomFieldInfo[] = [];
  const unresolved: string[] = [];

  for (const ref of refs) {
    const nameKey = ref.trim().toLowerCase();
    // Two fields sharing a name: guessing one would write to the wrong
    // column, so the reference is reported unresolved and must be given by id
    if (!byId.has(ref) && ambiguousNames.has(nameKey)) {
      unresolved.push(ref);
      continue;
    }
    const match = byId.get(ref) ?? byName.get(nameKey);
    if (!match) {
      unresolved.push(ref);
      continue;
    }
    if (fields.some((field) => field.id === match.id)) continue;
    fields.push({ id: match.id, name: match.name, type: match.type });
  }

  return { fields, unresolved };
}
