import { describe, test } from "node:test";
import assert from "node:assert";
import {
  buildProjectDefaults,
  planBackfill,
  tallyCellsByField,
} from "../src/config/custom-field-backfill";

const PROJECT_ID_FIELD = "6a3aa5cd5cf4acae5ba87169";
const PS_PRODUCT_FIELD = "6a3aa6422d62d001f6ad3c3b";
const MONDAY_STATUS_FIELD = "6a56520be2ffc6c2da14a613";
const LOCATION_FIELD = "68c954344fcc90742d5051e2";

const ST_LUCIE = "6a982cd4d4e7f87b3c404f41";
const OTHER_PROJECT = "6a982cd4d4e7f87b3c404f99";

const fields = [
  { id: PROJECT_ID_FIELD, name: "Project ID" },
  { id: PS_PRODUCT_FIELD, name: "PS-Product" },
];

// Shape of GET /workspaces/{ws}/projects/{id}/custom-fields: every workspace
// field, each carrying its defaults for EVERY project in the workspace
const projectCustomFieldsResponse = [
  {
    id: PROJECT_ID_FIELD,
    name: "Project ID",
    entityType: "TIMEENTRY",
    projectDefaultValues: [
      { projectId: ST_LUCIE, value: "PS-01057", status: "VISIBLE" },
      { projectId: OTHER_PROJECT, value: "PS-02000", status: "VISIBLE" },
    ],
  },
  {
    id: PS_PRODUCT_FIELD,
    name: "PS-Product",
    entityType: "TIMEENTRY",
    projectDefaultValues: [
      { projectId: ST_LUCIE, value: "NICE Retainer", status: "VISIBLE" },
      { projectId: OTHER_PROJECT, value: "", status: "VISIBLE" },
      { projectId: "project-inactive", value: "Ignored", status: "INACTIVE" },
    ],
  },
  {
    id: MONDAY_STATUS_FIELD,
    name: "Monday Status",
    entityType: "TIMEENTRY",
    projectDefaultValues: [
      { projectId: ST_LUCIE, value: "In Progress", status: "VISIBLE" },
    ],
  },
];

describe("buildProjectDefaults", () => {
  const defaults = buildProjectDefaults(projectCustomFieldsResponse);

  test("maps every project in one pass, not just the one in the path", () => {
    assert.deepStrictEqual(
      [...defaults.keys()].sort(),
      [OTHER_PROJECT, ST_LUCIE].sort()
    );
    assert.strictEqual(defaults.get(ST_LUCIE)?.get(PROJECT_ID_FIELD), "PS-01057");
    assert.strictEqual(
      defaults.get(ST_LUCIE)?.get(PS_PRODUCT_FIELD),
      "NICE Retainer"
    );
  });

  test("blank defaults are not recorded, so they can never be copied", () => {
    assert.strictEqual(defaults.get(OTHER_PROJECT)?.has(PS_PRODUCT_FIELD), false);
  });

  test("defaults switched off for a project are skipped", () => {
    assert.strictEqual(defaults.has("project-inactive"), false);
  });
});

describe("planBackfill", () => {
  const defaultsByProject = buildProjectDefaults(projectCustomFieldsResponse);

  // Shape of the detailed report: id under _id, values under customFields
  const entry = {
    _id: "6a99a29a370a978113ce91fa",
    projectId: ST_LUCIE,
    projectName: "PS-01057 - ST LUCIE COUNTY - NICE Retainer",
    customFields: [
      { customFieldId: LOCATION_FIELD, value: "Travel Time" },
      { customFieldId: PROJECT_ID_FIELD, value: null },
      { customFieldId: PS_PRODUCT_FIELD, value: null },
    ],
  };

  test("fill-empty writes only the blank cells", () => {
    const plan = planBackfill({
      entries: [entry],
      defaultsByProject,
      fields,
      mode: "fill-empty",
    });

    assert.strictEqual(plan.length, 1);
    assert.strictEqual(plan[0].timeEntryId, "6a99a29a370a978113ce91fa");
    assert.deepStrictEqual(plan[0].customFields, [
      { customFieldId: PROJECT_ID_FIELD, value: "PS-01057" },
      { customFieldId: PS_PRODUCT_FIELD, value: "NICE Retainer" },
    ]);
  });

  test("a field the caller did not select is never planned", () => {
    // Monday Status has a project default but is outside `fields`
    const plan = planBackfill({
      entries: [entry],
      defaultsByProject,
      fields,
      mode: "fill-empty",
    });

    const planned = plan[0].customFields.map((cf) => cf.customFieldId);
    assert.ok(!planned.includes(MONDAY_STATUS_FIELD));
    assert.ok(!planned.includes(LOCATION_FIELD));
  });

  test("fill-empty leaves a populated cell alone", () => {
    const populated = {
      ...entry,
      customFields: [
        { customFieldId: PROJECT_ID_FIELD, value: "MANUAL-OVERRIDE" },
        { customFieldId: PS_PRODUCT_FIELD, value: null },
      ],
    };

    const plan = planBackfill({
      entries: [populated],
      defaultsByProject,
      fields,
      mode: "fill-empty",
    });

    assert.deepStrictEqual(plan[0].customFields, [
      { customFieldId: PS_PRODUCT_FIELD, value: "NICE Retainer" },
    ]);
  });

  test("overwrite replaces a cell that differs from the default", () => {
    const populated = {
      ...entry,
      customFields: [
        { customFieldId: PROJECT_ID_FIELD, value: "MANUAL-OVERRIDE" },
        { customFieldId: PS_PRODUCT_FIELD, value: "NICE Retainer" },
      ],
    };

    const plan = planBackfill({
      entries: [populated],
      defaultsByProject,
      fields,
      mode: "overwrite",
    });

    // PS-Product already matches, so only Project ID is rewritten
    assert.deepStrictEqual(plan[0].customFields, [
      { customFieldId: PROJECT_ID_FIELD, value: "PS-01057" },
    ]);
  });

  test("an entry already matching every default produces no plan item", () => {
    const complete = {
      ...entry,
      customFields: [
        { customFieldId: PROJECT_ID_FIELD, value: "PS-01057" },
        { customFieldId: PS_PRODUCT_FIELD, value: "NICE Retainer" },
      ],
    };

    const plan = planBackfill({
      entries: [complete],
      defaultsByProject,
      fields,
      mode: "overwrite",
    });

    assert.deepStrictEqual(plan, []);
  });

  test("entries on a project with no defaults are skipped", () => {
    const orphan = { ...entry, projectId: "project-with-no-defaults" };

    const plan = planBackfill({
      entries: [orphan],
      defaultsByProject,
      fields,
      mode: "fill-empty",
    });

    assert.deepStrictEqual(plan, []);
  });

  test("records the before value so the manifest can be read as an undo", () => {
    const plan = planBackfill({
      entries: [entry],
      defaultsByProject,
      fields,
      mode: "fill-empty",
    });

    assert.deepStrictEqual(plan[0].changes[0], {
      customFieldId: PROJECT_ID_FIELD,
      name: "Project ID",
      from: null,
      to: "PS-01057",
    });
  });
});

describe("tallyCellsByField", () => {
  test("counts cells per field name across the whole plan", () => {
    const defaultsByProject = buildProjectDefaults(projectCustomFieldsResponse);
    const entries = [
      {
        _id: "entry-1",
        projectId: ST_LUCIE,
        customFields: [{ customFieldId: PROJECT_ID_FIELD, value: null }],
      },
      {
        _id: "entry-2",
        projectId: ST_LUCIE,
        customFields: [],
      },
    ];

    const plan = planBackfill({
      entries,
      defaultsByProject,
      fields,
      mode: "fill-empty",
    });

    assert.deepStrictEqual(tallyCellsByField(plan, fields), {
      "Project ID": 2,
      "PS-Product": 2,
    });
  });
});
