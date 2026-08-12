import { describe, test } from "node:test";
import assert from "node:assert";
import { mapDetailedEntry } from "../src/clockify-sdk/reports";

// Shape captured from a real detailed-report response (2026-08-11 probe)
const rawEntry = {
  _id: "6a7653b4508b9e72ecda84e8",
  description: "ITPs / Prep",
  userId: "user-1",
  userName: "Support Person",
  userEmail: "support@example.com",
  timeInterval: {
    start: "2026-08-05T10:20:00Z",
    end: "2026-08-05T15:06:00Z",
    duration: 17160,
  },
  billable: true,
  projectId: "proj-1",
  projectName: "PS-00485 Dorchester",
  clientId: "client-1",
  clientName: "Dorchester",
  taskId: null,
  tagIds: [],
  approvalRequestId: null,
  isLocked: false,
  customFields: [
    { customFieldId: "cf-location", value: "Remote" },
    { customFieldId: "cf-customer", value: null },
  ],
};

describe("mapDetailedEntry custom fields", () => {
  test("passes custom field values through", () => {
    const mapped = mapDetailedEntry(rawEntry);

    assert.deepStrictEqual(mapped.customFields, [
      { customFieldId: "cf-location", name: undefined, type: undefined, value: "Remote" },
      { customFieldId: "cf-customer", name: undefined, type: undefined, value: null },
    ]);
  });

  test("enriches names and types from workspace field definitions", () => {
    const fieldInfo = new Map([
      ["cf-location", { name: "Location", type: "DROPDOWN_SINGLE" }],
      ["cf-customer", { name: "Customer ID", type: "TXT" }],
    ]);

    const mapped = mapDetailedEntry(rawEntry, fieldInfo);

    assert.deepStrictEqual(mapped.customFields, [
      {
        customFieldId: "cf-location",
        name: "Location",
        type: "DROPDOWN_SINGLE",
        value: "Remote",
      },
      {
        customFieldId: "cf-customer",
        name: "Customer ID",
        type: "TXT",
        value: null,
      },
    ]);
  });

  test("entry without customFields maps to an empty array", () => {
    const { customFields, ...rest } = rawEntry;
    const mapped = mapDetailedEntry(rest);
    assert.deepStrictEqual(mapped.customFields, []);
  });

  test("core fields still map correctly", () => {
    const mapped = mapDetailedEntry(rawEntry);
    assert.strictEqual(mapped.id, "6a7653b4508b9e72ecda84e8");
    assert.strictEqual(mapped.durationSeconds, 17160);
    assert.strictEqual(mapped.isLocked, false);
    assert.strictEqual(mapped.invoiced, false);
  });
});
