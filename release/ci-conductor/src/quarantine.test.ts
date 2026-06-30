import { describe, expect, it } from "bun:test";

import type { NormalizedTest } from "./contract.ts";
import {
  type FailedTest,
  type QuarantineEntry,
  compareFailedToQuarantine,
  junitFailuresToFailedTests,
  matchKey,
} from "./quarantine.ts";

const failed = (
  test_name: string,
  test_path: string | null = "Suite",
  file_path: string | null = "e2e/test/foo.cy.spec.ts",
): FailedTest => ({ test_name, test_path, file_path });

const quarantined = (
  test_name: string,
  test_path = "Suite",
  file_path = "e2e/test/foo.cy.spec.ts",
): QuarantineEntry => ({ test_name, test_path, file_path, test_suite: "e2e" });

describe("compareFailedToQuarantine", () => {
  it("puts every failure in `unquarantined` when nothing is quarantined", () => {
    const failures = [failed("a"), failed("b")];

    const { quarantined: q, unquarantined } = compareFailedToQuarantine(
      failures,
      [],
    );

    expect(q).toEqual([]);
    expect(unquarantined).toEqual(failures);
  });

  it("puts every failure in `quarantined` when all are listed", () => {
    const failures = [failed("a"), failed("b")];

    const { quarantined: q, unquarantined } = compareFailedToQuarantine(
      failures,
      [quarantined("a"), quarantined("b")],
    );

    expect(q).toEqual(failures);
    expect(unquarantined).toEqual([]);
  });

  it("partitions a mixed set", () => {
    const a = failed("a");
    const b = failed("b");
    const c = failed("c");

    const { quarantined: q, unquarantined } = compareFailedToQuarantine(
      [a, b, c],
      [quarantined("a"), quarantined("c")],
    );

    expect(q).toEqual([a, c]);
    expect(unquarantined).toEqual([b]);
  });

  it("returns two empty buckets for no failures", () => {
    expect(compareFailedToQuarantine([], [quarantined("a")])).toEqual({
      quarantined: [],
      unquarantined: [],
    });
  });

  it("matches on all three fields — same name, different file is not a match", () => {
    const failure = failed("a", "Suite", "e2e/test/foo.cy.spec.ts");

    const { unquarantined } = compareFailedToQuarantine(
      [failure],
      [quarantined("a", "Suite", "e2e/test/bar.cy.spec.ts")],
    );

    expect(unquarantined).toEqual([failure]);
  });

  it("matches on all three fields — same name/file, different describe path is not a match", () => {
    const failure = failed("a", "Suite > inner");

    const { unquarantined } = compareFailedToQuarantine(
      [failure],
      [quarantined("a", "Suite > other")],
    );

    expect(unquarantined).toEqual([failure]);
  });

  it("treats a null path on the failure as an empty string for matching", () => {
    const failure = failed("a", null, null);

    const { quarantined: q } = compareFailedToQuarantine(
      [failure],
      [quarantined("a", "", "")],
    );

    expect(q).toEqual([failure]);
  });
});

describe("matchKey", () => {
  it("normalizes null/undefined paths to empty strings", () => {
    expect(matchKey(null, undefined, "a")).toBe(matchKey("", "", "a"));
  });

  it("does not collide when a boundary between fields shifts", () => {
    // ["a", "b", "c"] vs ["ab", "", "c"] must stay distinct.
    expect(matchKey("a", "b", "c")).not.toBe(matchKey("ab", "", "c"));
  });
});

describe("junitFailuresToFailedTests", () => {
  it("renames name/path/file to the gate's identity fields", () => {
    const tests: NormalizedTest[] = [
      {
        name: "renders the table",
        path: "metabase.viz-test",
        file: "viz_test.clj",
        status: "failure",
      },
    ];

    expect(junitFailuresToFailedTests(tests)).toEqual([
      {
        test_name: "renders the table",
        test_path: "metabase.viz-test",
        file_path: "viz_test.clj",
      },
    ]);
  });

  it("defaults a missing path/file to null", () => {
    const tests: NormalizedTest[] = [{ name: "a", status: "failure" }];

    expect(junitFailuresToFailedTests(tests)).toEqual([
      { test_name: "a", test_path: null, file_path: null },
    ]);
  });

  it("treats an absent status as a failure (JUnit only emits failures)", () => {
    const tests: NormalizedTest[] = [{ name: "a" }];

    expect(junitFailuresToFailedTests(tests)).toHaveLength(1);
  });

  it("drops a non-failure row defensively", () => {
    const tests: NormalizedTest[] = [
      { name: "broke", status: "failure" },
      { name: "recovered", status: "passed" },
    ];

    expect(junitFailuresToFailedTests(tests)).toEqual([
      { test_name: "broke", test_path: null, file_path: null },
    ]);
  });
});
