export type TaskMappingStrategy =
  | "clear"
  | "match-by-name"
  | "fail-if-task-present";

export type TaskMappingResult =
  | { action: "none" } // entry has no task; nothing to map
  | { action: "clear" } // drop the task association
  | { action: "map"; taskId: string } // same-named task exists on target
  | { action: "create"; name: string } // create the task on the target first
  | { action: "fail"; reason: string };

/**
 * Decide what happens to an entry's task when the entry moves to another
 * project. Tasks are project-scoped in Clockify, so a moved entry's taskId
 * no longer resolves on the target project and must be cleared, remapped
 * or treated as a blocking error.
 */
export function resolveTaskMapping(
  strategy: TaskMappingStrategy,
  sourceTaskName: string | undefined,
  targetTaskIdsByName: ReadonlyMap<string, string>
): TaskMappingResult {
  if (!sourceTaskName) return { action: "none" };

  if (strategy === "clear") return { action: "clear" };

  if (strategy === "fail-if-task-present") {
    return {
      action: "fail",
      reason: `Entry has task "${sourceTaskName}" and taskMappingStrategy is fail-if-task-present`,
    };
  }

  const targetTaskId = targetTaskIdsByName.get(sourceTaskName.toLowerCase());
  return targetTaskId
    ? { action: "map", taskId: targetTaskId }
    : { action: "create", name: sourceTaskName };
}
