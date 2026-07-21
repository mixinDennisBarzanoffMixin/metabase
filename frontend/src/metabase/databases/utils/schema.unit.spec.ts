import type { Engine } from "metabase-types/api";

import { getValidationSchema } from "./schema";

describe("database schema", () => {
  it("preserves hidden string details", () => {
    const engine: Engine = {
      source: { type: "official", contact: null },
      "details-fields": [
        { name: "veritly-tunnel-enabled", type: "hidden", default: false },
        { name: "veritly-gateway", type: "hidden-string" },
      ],
      "driver-name": "PostgreSQL",
      "superseded-by": null,
      "extra-info": null,
    };
    const value = getValidationSchema(engine, "postgres", true).cast({
      details: {
        "veritly-tunnel-enabled": true,
        "veritly-gateway": "ws://connector-gateway:8090/client",
      },
    });

    expect(value.details["veritly-gateway"]).toBe(
      "ws://connector-gateway:8090/client",
    );
  });
});
