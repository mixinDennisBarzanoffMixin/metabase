/* eslint-disable no-console -- Veritly diagnostics intentionally trace every embedded iframe lifecycle boundary. */
/* eslint-disable metabase/no-literal-metabase-strings -- Stable trace labels identify the embedded Metabase process. */
import { IframeChildBridge } from "@veritly/iframe";
import { type PropsWithChildren, useEffect, useState } from "react";

import { useHistory } from "metabase/history";

import { MetabaseWorkspaceDriver, VeritlyContext } from "./flush";

export function VeritlyFrame(props: PropsWithChildren) {
  const { history } = useHistory();
  const [driver] = useState(() => new MetabaseWorkspaceDriver(history));

  useEffect(() => {
    const url = new URL(window.location.href);
    const origin = url.searchParams.get("parentOrigin")?.trim();
    const frame = url.searchParams.get("frame")?.trim();
    console.info("[veritly-iframe:child]", "Metabase frame effect", {
      href: window.location.href,
      origin,
      frame,
      embedded: window.parent !== window,
    });
    if (!origin || !frame || window.parent === window) {
      console.info("[veritly-iframe:child]", "Metabase bridge skipped", {
        origin,
        frame,
        embedded: window.parent !== window,
      });
      return;
    }
    const bridge = new IframeChildBridge({ frame, origin, driver, window });
    console.info("[veritly-iframe:child]", "Metabase bridge starting", {
      origin,
      frame,
    });
    bridge.start();
    return () => {
      console.info("[veritly-iframe:child]", "Metabase bridge cleanup", {
        origin,
        frame,
      });
      bridge.dispose();
    };
  }, [driver]);

  useEffect(
    () => () => {
      console.info("[veritly-iframe:child]", "Metabase driver cleanup");
      driver.dispose();
    },
    [driver],
  );

  return (
    <VeritlyContext.Provider value={driver}>
      {props.children}
    </VeritlyContext.Provider>
  );
}

export function VeritlyWorkspace() {
  return null;
}
