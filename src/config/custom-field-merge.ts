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
 * Overlay custom field edits onto an entry's current values.
 *
 * PUT /time-entries/{id} is a full replace, so the body must carry every
 * value the entry should keep — fields the caller didn't name are passed
 * through untouched. An edit of `null` (or any blank value) drops the field
 * from the array, which is how a value is cleared under full-replace
 * semantics; a literal null is never sent.
 */
export function mergeCustomFieldValues(
  current: readonly CustomFieldValue[],
  edits: readonly CustomFieldValue[]
): CustomFieldValue[] {
  const merged = new Map<string, unknown>();
  // Blank values are dropped rather than echoed back: a cell the entry
  // already shows as empty must not go out as a literal null, which some
  // field types reject
  for (const field of current) {
    if (!isEmptyCustomFieldValue(field.value)) {
      merged.set(field.customFieldId, field.value);
    }
  }

  for (const edit of edits) {
    if (isEmptyCustomFieldValue(edit.value)) merged.delete(edit.customFieldId);
    else merged.set(edit.customFieldId, edit.value);
  }

  return [...merged].map(([customFieldId, value]) => ({
    customFieldId,
    value,
  }));
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
