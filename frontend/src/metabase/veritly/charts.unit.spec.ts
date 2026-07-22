import type { ChartRef } from "@veritly/chart";

import { ChartRegistry } from "./charts";

const chart: ChartRef = {
  provider: "onlyoffice",
  fileId: "file_1",
  fileName: "Sheet.xlsx",
  chartId: "1:1",
  sourceId: "1",
  sourceName: "Sheet1",
  revision: 1,
  name: "Sheet.xlsx / Sheet1 / Revenue",
};

function provider(id: string, list: () => Promise<ChartRef[]>) {
  return {
    id,
    list,
    async get() {
      throw new Error("unused");
    },
    async watch() {},
  };
}

describe("ChartRegistry", () => {
  it("keeps healthy provider results when another provider fails", async () => {
    const error = jest.spyOn(console, "error").mockImplementation();
    const registry = new ChartRegistry()
      .use(provider("onlyoffice", async () => [chart]))
      .use(
        provider("broken", async () => {
          throw new Error("offline");
        }),
      );

    await expect(registry.list()).resolves.toEqual([chart]);
    expect(error).toHaveBeenCalledWith(
      "Chart provider broken list failed",
      expect.objectContaining({ message: "offline" }),
    );
    error.mockRestore();
  });

  it("forwards provider catalog changes", async () => {
    const ctrl = new AbortController();
    const refresh = jest.fn();
    const registry = new ChartRegistry().use({
      ...provider("onlyoffice", async () => [chart]),
      async changes(run, signal) {
        run();
        if (signal.aborted) return;
        await new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve(), { once: true }),
        );
      },
    });

    const pending = registry.changes(refresh, ctrl.signal);
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);
    ctrl.abort();
    await pending;
  });
});
