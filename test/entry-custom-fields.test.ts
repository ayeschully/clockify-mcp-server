import { after, before, describe, test } from "node:test";
import assert from "node:assert";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { api, reportsApi, setApiToken } from "../src/config/api";
import {
  backfillEntryCustomFieldsTool,
  setEntryCustomFieldsTool,
} from "../src/tools/entry-custom-fields";

/**
 * End-to-end cover for the two custom field write tools with a stubbed axios
 * adapter: no credentials, but the real handler, planner, merge and PUT-body
 * construction. The scenario mirrors the manual acceptance test — an entry on
 * PS-01057 whose Project ID / PS-Product / Customer Netsuite ID are blank and
 * whose Location (Travel Time) must survive every write untouched.
 */

const WS = "68c951f5ba722428ff2ba39b";
const PROJECT = "6a982cd4d4e7f87b3c404f41";
const ENTRY = "6a99a29a370a978113ce91fa";
const LOCKED_ENTRY = "6a99a29a370a978113ce91fb";

const F = {
  projectId: "6a3aa5cd5cf4acae5ba87169",
  psProduct: "6a3aa6422d62d001f6ad3c3b",
  psRevenue: "6a3aa419e6d0c8042a29f2a5",
  netsuite: "6a722dee0bdb011bf96f2bc3",
  mondayStatus: "6a56520be2ffc6c2da14a613",
  location: "68c954344fcc90742d5051e2",
};

const field = (id: string, name: string, defaults: any[]) => ({
  id,
  name,
  type: "TXT",
  entityType: "TIMEENTRY",
  projectDefaultValues: defaults,
});

const onProject = (value: unknown) => [
  { projectId: PROJECT, value, status: "VISIBLE" },
];

const customFieldsResponse = [
  field(F.projectId, "Project ID", onProject("PS-01057")),
  field(F.psProduct, "PS-Product", onProject("NICE Retainer")),
  field(F.psRevenue, "PS Revenue", onProject("")),
  field(F.netsuite, "Customer Netsuite ID", onProject("C42863")),
  field(F.mondayStatus, "Monday Status", onProject("Done")),
  field(F.location, "Location", []),
];

const BASE_ENTRY = {
  id: ENTRY,
  description: "NICE retainer work",
  billable: true,
  projectId: PROJECT,
  taskId: "task-7",
  tagIds: ["tag-a"],
  timeInterval: { start: "2026-09-02T13:00:00Z", end: "2026-09-02T15:30:00Z" },
  customFieldValues: [
    { customFieldId: F.location, value: "Travel Time" },
    { customFieldId: F.mondayStatus, value: "In Progress" },
  ],
};

/** The live entry the stubbed GET returns; tests mutate it to set up state. */
let liveEntry: any;
let puts: { url: string; body: any }[];

const reportEntry = (id: string, extra: Record<string, unknown> = {}) => ({
  _id: id,
  projectId: PROJECT,
  projectName: "PS-01057 - ST LUCIE COUNTY - NICE Retainer",
  customFields: [
    { customFieldId: F.location, value: "Travel Time" },
    { customFieldId: F.mondayStatus, value: "In Progress" },
    { customFieldId: F.projectId, value: null },
    { customFieldId: F.psProduct, value: null },
    { customFieldId: F.netsuite, value: "" },
  ],
  ...extra,
});

function ok(data: unknown) {
  return Promise.resolve({
    data,
    status: 200,
    statusText: "OK",
    headers: {},
    config: {} as any,
  });
}

function adapter(config: any): Promise<any> {
  const url = String(config.url);
  const method = String(config.method).toUpperCase();

  if (method === "PUT" && url.includes("/time-entries/")) {
    puts.push({ url, body: JSON.parse(config.data) });
    return ok({ id: ENTRY });
  }
  if (method === "GET" && /\/time-entries\/[^/?]+$/.test(url)) {
    return ok({ ...liveEntry, id: url.split("/").pop() });
  }
  if (method === "GET" && url.includes("/custom-fields")) {
    return ok(customFieldsResponse);
  }
  if (method === "GET" && url.includes("/projects")) {
    return ok([{ id: PROJECT, name: "PS-01057" }]);
  }
  if (method === "POST" && url.includes("/reports/detailed")) {
    const { page } = JSON.parse(config.data).detailedFilter;
    return ok({
      timeentries:
        page === 1
          ? [reportEntry(ENTRY), reportEntry(LOCKED_ENTRY, { isLocked: true })]
          : [],
    });
  }
  throw new Error(`unstubbed request: ${method} ${url}`);
}

const call = async (tool: any, params: any) =>
  JSON.parse((await tool.handler(params)).content[0].text);

const valuesOf = (body: any) =>
  new Map<string, unknown>(
    (body.customFields ?? []).map((cf: any) => [cf.customFieldId, cf.value])
  );

before(() => {
  api.defaults.adapter = adapter as any;
  reportsApi.defaults.adapter = adapter as any;
  setApiToken("test-token");
});

describe("set-time-entry-custom-fields", () => {
  const resetState = () => {
    liveEntry = structuredClone(BASE_ENTRY);
    puts = [];
  };

  test("dry run resolves names, plans the change and writes nothing", async () => {
    resetState();

    const result = await call(setEntryCustomFieldsTool, {
      workspaceId: WS,
      edits: [
        {
          timeEntryId: ENTRY,
          customFields: [{ customFieldName: "Project ID", value: "PS-01057" }],
        },
      ],
    });

    assert.strictEqual(puts.length, 0, "a dry run must not write");
    assert.strictEqual(result.dryRun, true);
    assert.strictEqual(result.items[0].status, "planned");
    assert.deepStrictEqual(result.items[0].changes, [
      { customFieldId: F.projectId, name: "Project ID", from: null, to: "PS-01057" },
    ]);
  });

  test("a real write changes custom fields and nothing else", async () => {
    resetState();

    await call(setEntryCustomFieldsTool, {
      workspaceId: WS,
      dryRun: false,
      edits: [
        {
          timeEntryId: ENTRY,
          customFields: [
            { customFieldId: F.projectId, value: "PS-01057" },
            { customFieldName: "PS-Product", value: "NICE Retainer" },
            { customFieldName: "Customer Netsuite ID", value: "C42863" },
          ],
        },
      ],
    });

    assert.strictEqual(puts.length, 1);
    const body = puts[0].body;

    // PUT is a full replace: everything below would be cleared if dropped
    assert.strictEqual(body.description, "NICE retainer work");
    assert.strictEqual(body.billable, true);
    assert.strictEqual(body.start, "2026-09-02T13:00:00Z");
    assert.strictEqual(body.end, "2026-09-02T15:30:00Z");
    assert.strictEqual(body.projectId, PROJECT);
    assert.strictEqual(body.taskId, "task-7");
    assert.deepStrictEqual(body.tagIds, ["tag-a"]);

    const values = valuesOf(body);
    assert.strictEqual(values.get(F.location), "Travel Time");
    assert.strictEqual(values.get(F.mondayStatus), "In Progress");
    assert.strictEqual(values.get(F.projectId), "PS-01057");
    assert.strictEqual(values.get(F.psProduct), "NICE Retainer");
    assert.strictEqual(values.get(F.netsuite), "C42863");
  });

  test("an entry already holding the value is unchanged, not rewritten", async () => {
    resetState();
    liveEntry.customFieldValues.push({
      customFieldId: F.projectId,
      value: "PS-01057",
    });

    const result = await call(setEntryCustomFieldsTool, {
      workspaceId: WS,
      dryRun: false,
      edits: [
        {
          timeEntryId: ENTRY,
          customFields: [{ customFieldId: F.projectId, value: "PS-01057" }],
        },
      ],
    });

    assert.strictEqual(puts.length, 0);
    assert.strictEqual(result.items[0].status, "unchanged");
    assert.strictEqual(result.unchanged, 1);
  });

  test("null clears one field and leaves the others intact", async () => {
    resetState();

    await call(setEntryCustomFieldsTool, {
      workspaceId: WS,
      dryRun: false,
      edits: [
        {
          timeEntryId: ENTRY,
          customFields: [{ customFieldName: "Monday Status", value: null }],
        },
      ],
    });

    const values = valuesOf(puts[0].body);
    assert.ok(!values.has(F.mondayStatus), "a cleared field is omitted");
    assert.strictEqual(values.get(F.location), "Travel Time");
  });

  test("a blank existing value is never echoed back as a literal null", async () => {
    resetState();
    liveEntry.customFieldValues.push({ customFieldId: F.psRevenue, value: null });

    await call(setEntryCustomFieldsTool, {
      workspaceId: WS,
      dryRun: false,
      edits: [
        {
          timeEntryId: ENTRY,
          customFields: [{ customFieldId: F.projectId, value: "PS-01057" }],
        },
      ],
    });

    const sent = puts[0].body.customFields.map((cf: any) => cf.value);
    assert.ok(!sent.includes(null), `no nulls in the body, got ${JSON.stringify(sent)}`);
  });

  test("an unknown field name is rejected with the available names", async () => {
    resetState();

    await assert.rejects(
      () =>
        call(setEntryCustomFieldsTool, {
          workspaceId: WS,
          edits: [
            {
              timeEntryId: ENTRY,
              customFields: [{ customFieldName: "Nope", value: "x" }],
            },
          ],
        }),
      /No time entry custom field named "Nope"/
    );
  });

  test("an unknown field id blocks a real write but is only reported on a dry run", async () => {
    resetState();
    const edits = [
      {
        timeEntryId: ENTRY,
        customFields: [{ customFieldId: "not-a-field", value: "x" }],
      },
    ];

    const planned = await call(setEntryCustomFieldsTool, {
      workspaceId: WS,
      edits,
    });
    assert.deepStrictEqual(planned.unknownCustomFieldIds, ["not-a-field"]);

    await assert.rejects(
      () => call(setEntryCustomFieldsTool, { workspaceId: WS, dryRun: false, edits }),
      /not time entry custom fields on this workspace/
    );
    assert.strictEqual(puts.length, 0);
  });

  test("the same entry twice is rejected, since the second PUT would drop the first", async () => {
    resetState();

    await assert.rejects(
      () =>
        call(setEntryCustomFieldsTool, {
          workspaceId: WS,
          dryRun: false,
          edits: [
            {
              timeEntryId: ENTRY,
              customFields: [{ customFieldId: F.projectId, value: "a" }],
            },
            {
              timeEntryId: ENTRY,
              customFields: [{ customFieldId: F.psProduct, value: "b" }],
            },
          ],
        }),
      /may appear only once per call/
    );
    assert.strictEqual(puts.length, 0);
  });
});

describe("backfill-entry-custom-fields-from-project", () => {
  const resetState = () => {
    liveEntry = structuredClone(BASE_ENTRY);
    puts = [];
  };

  test("dry run counts cells per field and excludes Monday Status", async () => {
    resetState();

    const result = await call(backfillEntryCustomFieldsTool, {
      workspaceId: WS,
      projectIds: [PROJECT],
    });

    assert.strictEqual(puts.length, 0);
    assert.strictEqual(result.entriesScanned, 2);
    assert.deepStrictEqual(result.cellsToChangeByField, {
      "Project ID": 2,
      "PS-Product": 2,
      "Customer Netsuite ID": 2,
    });
    // A point-in-time snapshot, and a project default that is blank
    assert.ok(!("Monday Status" in result.cellsToChangeByField));
    assert.ok(!("PS Revenue" in result.cellsToChangeByField));
  });

  test("locked entries are held back so the repeat-until-zero loop converges", async () => {
    resetState();

    const result = await call(backfillEntryCustomFieldsTool, {
      workspaceId: WS,
      projectIds: [PROJECT],
    });

    assert.strictEqual(result.entriesToChange, 2);
    assert.strictEqual(result.skippedBlockedEntries, 1);
    assert.strictEqual(result.remainingEntries, 0);
    assert.deepStrictEqual(result.likelyBlockedEntries, [
      { id: LOCKED_ENTRY, isLocked: true, approvalRequestId: null, invoiced: false },
    ]);
  });

  test("a real run copies the project defaults and preserves other fields", async () => {
    resetState();

    const result = await call(backfillEntryCustomFieldsTool, {
      workspaceId: WS,
      projectIds: [PROJECT],
      dryRun: false,
    });

    assert.strictEqual(puts.length, 1, "only the unlocked entry is written");
    const values = valuesOf(puts[0].body);
    assert.strictEqual(values.get(F.projectId), "PS-01057");
    assert.strictEqual(values.get(F.psProduct), "NICE Retainer");
    assert.strictEqual(values.get(F.netsuite), "C42863");
    assert.strictEqual(values.get(F.location), "Travel Time");
    assert.strictEqual(values.get(F.mondayStatus), "In Progress");
    assert.strictEqual(result.updated, 1);
    assert.strictEqual(result.failed, 0);
  });

  test("fill-empty is re-checked live, so a value set since the report survives", async () => {
    resetState();
    // The report says Project ID is null; the entry has since been filled in
    liveEntry.customFieldValues.push({
      customFieldId: F.projectId,
      value: "HAND-ENTERED",
    });

    const result = await call(backfillEntryCustomFieldsTool, {
      workspaceId: WS,
      projectIds: [PROJECT],
      dryRun: false,
    });

    const values = valuesOf(puts[0].body);
    assert.strictEqual(values.get(F.projectId), "HAND-ENTERED");
    assert.strictEqual(values.get(F.psProduct), "NICE Retainer");
    assert.deepStrictEqual(
      result.items[0].skippedFields.map((f: any) => f.name),
      ["Project ID"]
    );
  });

  test("overwrite replaces a value that differs from the default", async () => {
    resetState();
    liveEntry.customFieldValues.push({
      customFieldId: F.projectId,
      value: "HAND-ENTERED",
    });

    await call(backfillEntryCustomFieldsTool, {
      workspaceId: WS,
      projectIds: [PROJECT],
      mode: "overwrite",
      dryRun: false,
    });

    assert.strictEqual(valuesOf(puts[0].body).get(F.projectId), "PS-01057");
  });

  test("maxEntries caps the batch and reports the remainder", async () => {
    resetState();

    const result = await call(backfillEntryCustomFieldsTool, {
      workspaceId: WS,
      projectIds: [PROJECT],
      skipBlocked: false,
      maxEntries: 1,
    });

    assert.strictEqual(result.entriesToChange, 2);
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.remainingEntries, 1);
    assert.match(result.note, /remainingEntries is 0/);
  });

  test("a project with no defaults plans nothing and says so", async () => {
    resetState();

    const result = await call(backfillEntryCustomFieldsTool, {
      workspaceId: WS,
      projectIds: ["some-other-project"],
    });

    assert.strictEqual(result.projectsWithDefaults, 0);
    assert.match(result.note, /nothing to copy/);
  });
});

describe("backfill manifest file", () => {
  const outFile = join(tmpdir(), "clockify-backfill-test.csv");

  after(() => rmSync(outFile, { force: true }));

  test("writes a CSV manifest and keeps the items out of the response", async () => {
    liveEntry = structuredClone(BASE_ENTRY);
    puts = [];

    const result = await call(backfillEntryCustomFieldsTool, {
      workspaceId: WS,
      projectIds: [PROJECT],
      outputFile: outFile,
    });

    assert.ok(!("items" in result), "items must be offloaded, not inlined");
    assert.strictEqual(result.manifestFile.format, "csv");

    const lines = readFileSync(result.manifestFile.path, "utf8").trim().split("\n");
    assert.strictEqual(
      lines[0],
      "timeEntryId,status,projectId,customFieldId,customFieldName,from,to,error"
    );
    assert.strictEqual(lines.length, 1 + 3, "header + 1 entry x 3 cells");
  });

  test("a destination that is not .json or .csv is refused before anything is written", async () => {
    liveEntry = structuredClone(BASE_ENTRY);
    puts = [];

    await assert.rejects(
      () =>
        call(backfillEntryCustomFieldsTool, {
          workspaceId: WS,
          projectIds: [PROJECT],
          dryRun: false,
          outputFile: join(tmpdir(), "clockify-manifest.ts"),
        }),
      /must end in \.json or \.csv/
    );
    assert.strictEqual(puts.length, 0, "nothing may be written before the path check");
  });
});
