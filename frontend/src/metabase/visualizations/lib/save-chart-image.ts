/* eslint-disable no-console -- Veritly diagnostics intentionally trace each chart image rendering stage. */
import EmbedFrameS from "metabase/embedding/theme.module.css";
import { isStorybookActive } from "metabase/env";
import { openImageBlobOnStorybook } from "metabase/utils/loki-utils";

import {
  createBrandingElement,
  getBrandingConfig,
  getBrandingSize,
} from "./exports-branding-utils";
import { resolveSvgVarPaint, restoreNestedSvgOverflow } from "./image-exports";

export const SAVING_DOM_IMAGE_CLASS = "saving-dom-image";
export const SAVING_DOM_IMAGE_HIDDEN_CLASS = "saving-dom-image-hidden";

interface RenderOpts {
  selector: string;
  includeBranding: boolean;
}

interface Opts extends RenderOpts {
  fileName: string;
}

export const renderChartImage = async ({
  selector,
  includeBranding,
}: RenderOpts) => {
  console.info("[veritly-download]", "chart image render starting", {
    selector,
    includeBranding,
  });
  const node = document.querySelector(selector);

  if (!node || !(node instanceof HTMLElement)) {
    console.error("[veritly-download]", "chart image node missing", {
      selector,
    });
    throw new Error(`No chart found for selector ${selector}`);
  }

  const contentHeight = node.getBoundingClientRect().height;
  const contentWidth = node.getBoundingClientRect().width;

  const size = getBrandingSize(contentWidth);
  const brandingHeight = getBrandingConfig(size).h;
  const verticalOffset = includeBranding ? brandingHeight : 0;

  // Appending any element to the node does not automatically increase the canvas height.
  const canvasHeight = contentHeight + verticalOffset;
  console.info("[veritly-download]", "chart image dimensions measured", {
    selector,
    contentWidth,
    contentHeight,
    brandingHeight,
    canvasHeight,
  });

  // Ensure fonts are fully loaded before capturing, otherwise
  // html2canvas may render text with fallback fonts.
  await document.fonts.ready;
  console.info("[veritly-download]", "chart image fonts ready", { selector });

  const { default: html2canvas } = await import("html2canvas-pro");
  console.info("[veritly-download]", "chart image html2canvas loaded", {
    selector,
  });
  const canvas = await html2canvas(node, {
    scale: 2,
    useCORS: true,
    cspNonce: window.MetabaseNonce,
    height: canvasHeight,
    onclone: (_doc: Document, node: HTMLElement) => {
      node.classList.add(SAVING_DOM_IMAGE_CLASS);
      node.classList.add(EmbedFrameS.WithThemeBackground);

      node.style.borderRadius = "0px";
      node.style.border = "none";

      if (includeBranding) {
        const branding = createBrandingElement(size);
        /**
         * The DOM node that encapsulates the dashboard card is absolutely positioned.
         * That node is the container for the chart, and for the branding element.
         * Unless we sanitize the container, we have to position the branding content
         * appropriately, or it will not be visible.
         */
        branding.style.position = "absolute";
        branding.style.left = "0";
        branding.style.bottom = `-${brandingHeight}px`;
        branding.style.zIndex = "1000";

        node.appendChild(branding);
      }

      resolveSvgVarPaint(node);
      restoreNestedSvgOverflow(node);
    },
  });
  console.info("[veritly-download]", "chart image canvas captured", {
    selector,
    width: canvas.width,
    height: canvas.height,
  });

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) {
    console.error("[veritly-download]", "chart image blob conversion failed", {
      selector,
    });
    throw new Error("The chart image renderer returned no content");
  }
  console.info("[veritly-download]", "chart image blob ready", {
    selector,
    type: blob.type,
    size: blob.size,
  });
  if (isStorybookActive) {
    openImageBlobOnStorybook({ canvas, blob });
  }
  return blob;
};

export const saveChartImage = async (opts: Opts) => {
  console.info("[veritly-download]", "chart image browser save starting", {
    selector: opts.selector,
    fileName: opts.fileName,
  });
  const blob = await renderChartImage(opts);
  if (isStorybookActive) {
    return;
  }
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.rel = "noopener";
  link.download = opts.fileName;
  link.href = url;
  console.info("[veritly-download]", "chart image anchor clicking", {
    fileName: opts.fileName,
    url,
    type: blob.type,
    size: blob.size,
  });
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
