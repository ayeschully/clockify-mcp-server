import { describe, test } from "node:test";
import assert from "node:assert";
import {
  mapWithConcurrency,
  withRateLimitRetry,
} from "../src/config/concurrency";

describe("mapWithConcurrency", () => {
  test("preserves input order in results", async () => {
    const items = [30, 10, 20];
    const results = await mapWithConcurrency(
      items,
      async (ms) => {
        await new Promise((resolve) => setTimeout(resolve, ms));
        return ms;
      },
      3
    );
    assert.deepStrictEqual(results, [30, 10, 20]);
  });

  test("never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(
      Array.from({ length: 10 }, (_, i) => i),
      async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;
      },
      3
    );
    assert.ok(peak <= 3, `peak concurrency was ${peak}`);
  });
});

describe("withRateLimitRetry", () => {
  test("retries 429 responses and eventually succeeds", async () => {
    let calls = 0;
    const result = await withRateLimitRetry(async () => {
      calls++;
      if (calls < 3) {
        throw { response: { status: 429, headers: { "retry-after": "0" } } };
      }
      return "ok";
    });
    assert.strictEqual(result, "ok");
    assert.strictEqual(calls, 3);
  });

  test("rethrows non-429 errors immediately", async () => {
    let calls = 0;
    await assert.rejects(
      withRateLimitRetry(async () => {
        calls++;
        throw { response: { status: 403 }, message: "forbidden" };
      })
    );
    assert.strictEqual(calls, 1);
  });
});
