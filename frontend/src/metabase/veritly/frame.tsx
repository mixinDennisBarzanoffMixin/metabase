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
    if (!origin || !frame || window.parent === window) {
      return;
    }
    const bridge = new IframeChildBridge({ frame, origin, driver, window });
    bridge.start();
    return () => bridge.dispose();
  }, [driver]);

  useEffect(() => () => driver.dispose(), [driver]);

  return (
    <VeritlyContext.Provider value={driver}>
      {props.children}
    </VeritlyContext.Provider>
  );
}

export function VeritlyWorkspace() {
  return null;
}
