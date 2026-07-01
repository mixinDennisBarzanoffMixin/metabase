import { getPathnameWithoutSubPath } from "metabase/utils/dom";
import { isWithinIframe } from "metabase/utils/iframe";

function stripRoot(pathname: string): string {
  const raw = window.MetabaseRoot;

  if (!raw) {
    return pathname;
  }

  const root = raw.replace(/\/+$/, "");

  if (!root) {
    return pathname;
  }

  if (pathname === root) {
    return "/";
  }

  if (pathname.startsWith(`${root}/`)) {
    return pathname.slice(root.length);
  }

  return pathname;
}

/**
 * Returns whether the current route is in sync with the given pathname,
 * only if we're in an iframe context.
 *
 * This has been implemented as part of a fix for metabase#65500
 * to prevent iframes navigated through postMessage from getting stuck in an error state
 *
 * @param pathname the current path name
 * @returns whether the routes are in sync, if we're in an iframe context
 */
export function isRouteInSync(pathname: string): boolean {
  const isRouteInSync =
    stripRoot(getPathnameWithoutSubPath(window.location.pathname)) ===
    stripRoot(pathname);

  if (isWithinIframe()) {
    return isRouteInSync;
  }

  return true;
}
