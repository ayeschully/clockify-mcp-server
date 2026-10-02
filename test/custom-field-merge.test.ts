import { describe, test } from "node:test";
import assert from "node:assert";
import {
  describeCustomFieldChanges,
  isEmptyCustomFieldValue,
  mergeCustomFieldValues,
  resolveCustomFieldRefs,
  sameCustomFieldValue,
} from "../src/config/custom-field-merge";

const PROJECT_ID_FIELD = "6a3aa5cd5cf4acae5ba87169";
const PS_PRODUCT_FIELD = "6a3aa6422d62d001f6ad3c3b";
const LOCATION_FIELD = "68c954344fcc90742d5051e2";

const workspaceFields = [
  { id: PROJECT_ID_FIELD, name: "Project ID", type: "TXT" },
  { id: PS_PRODUCT_FIELD, name: "PS-Product", type: "TXT" },
  { id: LOCATION_FIELD, name: "Location", type: "DROPDOWN_SINGLE" },
];

describe("isEmptyCustomFieldValue", () => {
  test("treats null, undefined, blank strings and empty lists as empty", () => {
    for (const value of [null, undefined, "", "   ", []]) {
      assert.strictEqual(isEmptyCustomFieldValue(value), true, String(value));
    }
  });

  test("treats 0 and false as real values, not blanks", () => {
    // A PS-Hours of 0 is a value someone set; backfilling over it would be a write
    assert.strictEqual(isEmptyCustomFieldValue(0), false);
    assert.strictEqual(isEmptyCustomFieldValue(false), false);
  });
});

describe("sameCustomFieldValue", () => {
  test("compares primitives across types so 7 and \"7\" are not a difference", () => {
    assert.strictEqual(sameCustomFieldValue(7, "7"), true);
    assert.strictEqual(sameCustomFieldValue("PS-01057", "PS-01057"), true);
    assert.strictEqual(sameCustomFieldValue("PS-01057", "PS-01058"), false);
  });

  test("two blanks are the same; a blank and a value are not", () => {
    assert.strictEqual(sameCustomFieldValue(null, ""), true);
    assert.strictEqual(sameCustomFieldValue(null, "PS-01057"), false);
  });

  test("lists compare structurally", () => {
    assert.strictEqual(sameCustomFieldValue(["a", "b"], ["a", "b"]), true);
    assert.strictEqual(sameCustomFieldValue(["a", "b"], ["b", "a"]), false);
  });
});

describe("mergeCustomFieldValues", () => {
  const current = [
    { customFieldId: LOCATION_FIELD, value: "Travel Time" },
    { customFieldId: PS_PRODUCT_FIELD, value: "Old Product" },
  ];

  test("fields the caller did not name survive the write", () => {
    // The acceptance criterion: backfilling Project ID must not drop Location
    const merged = mergeCustomFieldValues(current, [
      { customFieldId: PROJECT_ID_FIELD, value: "PS-01057" },
    ]);

    assert.deepStrictEqual(merged, [
      { customFieldId: LOCATION_FIELD, value: "Travel Time" },
      { customFieldId: PS_PRODUCT_FIELD, value: "Old Product" },
      { customFieldId: PROJECT_ID_FIELD, value: "PS-01057" },
    ]);
  });

  test("a named field is overwritten in place", () => {
    const merged = mergeCustomFieldValues(current, [
      { customFieldId: PS_PRODUCT_FIELD, value: "NICE Retainer" },
    ]);

    assert.deepStrictEqual(merged, [
      { customFieldId: LOCATION_FIELD, value: "Travel Time" },
      { customFieldId: PS_PRODUCT_FIELD, value: "NICE Retainer" },
    ]);
  });

  test("a blank edit is sent explicitly, because omission does NOT clear", () => {
    // Verified against the live API: Clockify KEEPS any custom field that is
    // missing from the body, so a cleared field has to be named with a null
    const merged = mergeCustomFieldValues(current, [
      { customFieldId: PS_PRODUCT_FIELD, value: null },
    ]);

    assert.deepStrictEqual(merged, [
      { customFieldId: LOCATION_FIELD, value: "Travel Time" },
      { customFieldId: PS_PRODUCT_FIELD, value: null },
    ]);
  });

  test("an empty string edit clears the same way a null does", () => {
    const merged = mergeCustomFieldValues(current, [
      { customFieldId: PS_PRODUCT_FIELD, value: "" },
    ]);

    assert.deepStrictEqual(
      merged.find((f) => f.customFieldId === PS_PRODUCT_FIELD),
      { customFieldId: PS_PRODUCT_FIELD, value: null }
    );
  });

  test("clearing a field the entry does not have still names it explicitly", () => {
    const merged = mergeCustomFieldValues(current, [
      { customFieldId: PROJECT_ID_FIELD, value: null },
    ]);

    assert.deepStrictEqual(merged, [
      ...current,
      { customFieldId: PROJECT_ID_FIELD, value: null },
    ]);
  });

  test("the typed-empty strategy sends the right blank per field type", () => {
    const infoById = new Map([
      [PS_PRODUCT_FIELD, { id: PS_PRODUCT_FIELD, name: "PS-Product", type: "TXT" }],
      [LOCATION_FIELD, { id: LOCATION_FIELD, name: "Location", type: "DROPDOWN_MULTIPLE" }],
    ]);

    const merged = mergeCustomFieldValues(
      current,
      [
        { customFieldId: PS_PRODUCT_FIELD, value: null },
        { customFieldId: LOCATION_FIELD, value: null },
      ],
      infoById,
      "typed-empty"
    );

    assert.deepStrictEqual(merged, [
      { customFieldId: LOCATION_FIELD, value: [] },
      { customFieldId: PS_PRODUCT_FIELD, value: "" },
    ]);
  });
});

describe("describeCustomFieldChanges", () => {
  const current = [{ customFieldId: PS_PRODUCT_FIELD, value: "NICE Retainer" }];
  const infoById = new Map(
    workspaceFields.map((field) => [field.id, field])
  );

  test("reports a real change with its field name and before value", () => {
    const changes = describeCustomFieldChanges(
      current,
      [{ customFieldId: PROJECT_ID_FIELD, value: "PS-01057" }],
      infoById
    );

    assert.deepStrictEqual(changes, [
      {
        customFieldId: PROJECT_ID_FIELD,
        name: "Project ID",
        from: null,
        to: "PS-01057",
      },
    ]);
  });

  test("an edit matching the current value produces no change, so no write", () => {
    const changes = describeCustomFieldChanges(
      current,
      [{ customFieldId: PS_PRODUCT_FIELD, value: "NICE Retainer" }],
      infoById
    );

    assert.deepStrictEqual(changes, []);
  });
});

describe("resolveCustomFieldRefs", () => {
  test("resolves by name case-insensitively and by id", () => {
    const { fields, unresolved } = resolveCustomFieldRefs(
      ["ps-product", PROJECT_ID_FIELD],
      workspaceFields
    );

    assert.deepStrictEqual(
      fields.map((field) => field.name),
      ["PS-Product", "Project ID"]
    );
    assert.deepStrictEqual(unresolved, []);
  });

  test("unknown references are reported, not silently dropped", () => {
    const { fields, unresolved } = resolveCustomFieldRefs(
      ["Project ID", "Nonexistent Field"],
      workspaceFields
    );

    assert.strictEqual(fields.length, 1);
    assert.deepStrictEqual(unresolved, ["Nonexistent Field"]);
  });

  test("the same field named twice resolves once", () => {
    const { fields } = resolveCustomFieldRefs(
      ["Project ID", PROJECT_ID_FIELD],
      workspaceFields
    );

    assert.strictEqual(fields.length, 1);
  });
});
