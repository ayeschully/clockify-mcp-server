import { describe, test } from "node:test";
import assert from "node:assert";
import { resolveTaskMapping } from "../src/config/task-mapping";

const targetTasks = new Map([
  ["development", "task-dev"],
  ["qa review", "task-qa"],
]);

describe("resolveTaskMapping", () => {
  test("entry without a task needs no mapping regardless of strategy", () => {
    assert.deepStrictEqual(
      resolveTaskMapping("match-by-name", undefined, targetTasks),
      { action: "none" }
    );
    assert.deepStrictEqual(
      resolveTaskMapping("fail-if-task-present", undefined, targetTasks),
      { action: "none" }
    );
  });

  test("clear strategy drops the task", () => {
    assert.deepStrictEqual(
      resolveTaskMapping("clear", "Development", targetTasks),
      { action: "clear" }
    );
  });

  test("fail-if-task-present fails entries that have a task", () => {
    const result = resolveTaskMapping(
      "fail-if-task-present",
      "Development",
      targetTasks
    );
    assert.strictEqual(result.action, "fail");
  });

  test("match-by-name maps case-insensitively", () => {
    assert.deepStrictEqual(
      resolveTaskMapping("match-by-name", "DEVELOPMENT", targetTasks),
      { action: "map", taskId: "task-dev" }
    );
    assert.deepStrictEqual(
      resolveTaskMapping("match-by-name", "QA Review", targetTasks),
      { action: "map", taskId: "task-qa" }
    );
  });

  test("match-by-name creates the task when no same-named task exists", () => {
    assert.deepStrictEqual(
      resolveTaskMapping("match-by-name", "Design", targetTasks),
      { action: "create", name: "Design" }
    );
  });
});
