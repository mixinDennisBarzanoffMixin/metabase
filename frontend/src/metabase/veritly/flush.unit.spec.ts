import { IframeCodec } from "@veritly/iframe";

import { MetabaseWorkspaceDriver } from "./flush";

const codec = new IframeCodec();

describe("MetabaseWorkspaceDriver", () => {
  it("reports loaded only after the routed editor registers", async () => {
    const paths: string[] = [];
    const driver = new MetabaseWorkspaceDriver({
      push(path) {
        paths.push(path);
      },
    });
    const open = codec.open("metabase:test", 1, "dashboards/test.dashboard", {
      path: "/veritly/dashboard/1",
    });
    let loaded = false;
    const pending = driver.open(open).then(() => {
      loaded = true;
    });
    await Promise.resolve();
    expect(loaded).toBe(false);
    let saved = false;
    const dispose = driver.register(
      "dashboard",
      "/veritly/dashboard/1",
      async () => {
        saved = true;
      },
      async () => new Blob(["dashboard"], { type: "application/pdf" }),
    );
    await pending;
    expect(paths).toEqual(["/veritly/dashboard/1"]);
    await driver.flush(codec.flush(open.frame, 2, open.path));
    expect(saved).toBe(true);
    const result = await driver.invoke(
      codec.invoke(open.frame, 3, open.path, "download", null),
    );
    expect(result).toBeInstanceOf(Blob);
    if (!(result instanceof Blob)) {
      throw new Error("Download did not return a Blob");
    }
    expect(result.size).toBe(9);
    expect(result.type).toBe("application/pdf");
    dispose();
    driver.dispose();
  });

  it("scopes and disposes save handlers", async () => {
    const driver = new MetabaseWorkspaceDriver({ push() {} });
    const open = codec.open("metabase:test", 1, "questions/test.question", {
      path: "/veritly/question/1",
    });
    const dispose = driver.register(
      "question",
      "/veritly/question/1",
      async () => {},
    );
    await driver.open(open);
    dispose();
    const flush = driver.flush(codec.flush(open.frame, 2, open.path));
    driver.dispose();
    await expect(flush).rejects.toThrow("workspace was disposed");
  });
});
