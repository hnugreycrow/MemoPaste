import path from "node:path";
import { protocol, net } from "electron";
import { pathToFileURL } from "node:url";
import { CLIPIMG_SCHEME } from "@shared/clipimg";
import { getClipboardImagesDir, isSafeImageFileName } from "./services/image-storage";

/**
 * 必须在 app.ready 之前调用。
 * 特权 scheme 才能在渲染进程 <img> / fetch 中加载。
 */
export function registerClipimgSchemePrivileged(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: CLIPIMG_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        bypassCSP: true,
        stream: true,
      },
    },
  ]);
}

/** app.ready 之后：clipimg://image/{file} → userData/clipboard-images/{file} */
export function registerClipimgProtocolHandler(): void {
  protocol.handle(CLIPIMG_SCHEME, (request) => {
    try {
      const url = new URL(request.url);
      const fileName = path.basename(decodeURIComponent(url.pathname));
      if (!isSafeImageFileName(fileName)) {
        return new Response("Forbidden", { status: 403 });
      }
      const fullPath = path.join(getClipboardImagesDir(), fileName);
      return net.fetch(pathToFileURL(fullPath).href);
    } catch (error) {
      console.error("clipimg protocol error:", error);
      return new Response("Not Found", { status: 404 });
    }
  });
}
