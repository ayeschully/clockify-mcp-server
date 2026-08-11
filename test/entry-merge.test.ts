import { describe, test } from "node:test";
import assert from "node:assert";
import { mergeEntryUpdate } from "../src/config/entry-merge";

const fullEntry = {
  description: "Original work",
  billable: true,
  projectId: "proj-1",
  taskId: "task-1",
  tagIds: ["tag-1", "tag-2"],
  timeInterval: {
    start: "2026-08-01T09:00:00Z",
    end: "2026-08-01T17:00:00Z",
  },
  customFieldValues: [
    { customFieldId: "cf-1", value: "PO-1234", name: "PO Number" },
  ],
};

describe("mergeEntryUpdate", () => {
  test("editing only description preserves project, task, tags, billable and custom fields", () => {
    // Acceptance criterion for the read-modify-write fix
    const body = mergeEntryUpdate(fullEntry, { description: "New text" });

    assert.strictEqual(body.description, "New text");
    assert.strictEqual(body.projectId, "proj-1");
    assert.strictEqual(body.taskId, "task-1");
    assert.deepStrictEqual(body.tagIds, ["tag-1", "tag-2"]);
    assert.strictEqual(body.billable, true);
    assert.deepStrictEqual(body.customFields, [
      { customFieldId: "cf-1", value: "PO-1234" },
    ]);
    assert.strictEqual(body.start, "2026-08-01T09:00:00Z");
    assert.strictEqual(body.end, "2026-08-01T17:00:00Z");
  });

  test("running entry (no end) omits end instead of sending Invalid Date", () => {
    const running = {
      ...fullEntry,
      timeInterval: { start: "2026-08-01T09:00:00Z", end: null },
    };

    const body = mergeEntryUpdate(running, { description: "Edit" });

    assert.ok(!("end" in body), "end must be omitted for a running entry");
    assert.strictEqual(body.start, "2026-08-01T09:00:00Z");
  });

  test("explicit edits override current values", () => {
    const body = mergeEntryUpdate(fullEntry, {
      billable: false,
      projectId: "proj-2",
      tagIds: [],
      start: new Date("2026-08-02T08:00:00Z"),
    });

    assert.strictEqual(body.billable, false);
    assert.strictEqual(body.projectId, "proj-2");
    assert.deepStrictEqual(body.tagIds, []);
    assert.strictEqual(body.start, "2026-08-02T08:00:00.000Z");
    assert.strictEqual(body.description, "Original work");
  });

  test("taskId: null actively clears the task; undefined preserves it", () => {
    const cleared = mergeEntryUpdate(fullEntry, {
      projectId: "proj-2",
      taskId: null,
    });
    assert.ok(!("taskId" in cleared), "null must clear the task");

    const preserved = mergeEntryUpdate(fullEntry, { projectId: "proj-2" });
    assert.strictEqual(preserved.taskId, "task-1");
  });

  test("entry without custom fields omits the customFields key", () => {
    const plain = { ...fullEntry, customFieldValues: [] };
    const body = mergeEntryUpdate(plain, { description: "Edit" });

    assert.ok(!("customFields" in body));
  });

  test("caller-supplied customFields replace the current ones", () => {
    const body = mergeEntryUpdate(fullEntry, {
      customFields: [{ customFieldId: "cf-1", value: "PO-9999" }],
    });

    assert.deepStrictEqual(body.customFields, [
      { customFieldId: "cf-1", value: "PO-9999" },
    ]);
  });
});
