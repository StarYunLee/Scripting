/**
 * 用本机 HttpServer 捕获 localhost OAuth 回调（与 Codex CLI 同思路）。
 * HttpServer 为 Scripting Pro 能力：不可用或启动失败时返回 null，调用方回退到粘贴。
 */

export type LocalOAuthCapture = {
  /** 收到回调后 resolve 完整 URL；停止后若尚未收到则永不 resolve。 */
  wait: Promise<string>;
  stop: () => void;
};

function queryValue(
  params: Array<{ key: string; value: string }> | undefined,
  key: string,
): string | null {
  if (!params?.length) return null;
  const hit = params.find((item) => item.key === key);
  return hit?.value?.trim() || null;
}

function buildCallbackUrl(
  port: number,
  path: string,
  req: {
    target?: string;
    path?: string;
    queryParams?: Array<{ key: string; value: string }>;
  },
): string {
  const target =
    typeof req.target === "string" && req.target.trim()
      ? req.target.trim()
      : `${path}?${(req.queryParams || [])
          .map(
            (item) =>
              `${encodeURIComponent(item.key)}=${encodeURIComponent(item.value)}`,
          )
          .join("&")}`;
  const suffix = target.startsWith("/") ? target : `/${target}`;
  return `http://127.0.0.1:${port}${suffix}`;
}

/**
 * 在指定端口监听 path；收到带 code/error 的请求后 resolve 完整回调 URL。
 * 若环境无 HttpServer 或端口占用，返回 null。
 */
export function startLocalOAuthCapture(options: {
  port: number;
  path: string;
}): LocalOAuthCapture | null {
  try {
    if (typeof HttpServer === "undefined") return null;
    const server = new HttpServer();
    let settled = false;
    let resolveUrl: ((url: string) => void) | null = null;
    const wait = new Promise<string>((resolve) => {
      resolveUrl = resolve;
    });

    const finish = (url: string) => {
      if (settled) return;
      settled = true;
      resolveUrl?.(url);
    };

    const handler = (req: {
      target?: string;
      path?: string;
      queryParams?: Array<{ key: string; value: string }>;
    }) => {
      const code = queryValue(req.queryParams, "code");
      const error = queryValue(req.queryParams, "error");
      if (!code && !error) {
        return HttpResponse.badRequest(
          HttpResponseBody.text("缺少 authorization code"),
        );
      }
      finish(buildCallbackUrl(options.port, options.path, req));
      const body = error
        ? "授权被拒绝，请返回 AI Usage 重试。"
        : "授权完成，请关闭此页并返回 AI Usage。";
      return HttpResponse.ok(HttpResponseBody.text(body));
    };

    if (typeof server.registerAsyncHandler === "function") {
      server.registerAsyncHandler(options.path, async (req) => handler(req));
    } else {
      server.registerHandler(options.path, (req) => handler(req));
    }

    const startError = server.start({
      port: options.port,
      forceIPv4: true,
    });
    if (startError) {
      try {
        server.stop();
      } catch {
        /* ignore */
      }
      return null;
    }

    return {
      wait,
      stop: () => {
        try {
          server.stop();
        } catch {
          /* ignore */
        }
      },
    };
  } catch {
    return null;
  }
}

function delay(ms: number): Promise<null> {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}

/**
 * 打开授权页；在 in-app Safari（present）路径下尽量自动拿到 localhost 回调。
 * 外部 Safari（openURL）通常无法在短时内完成登录，返回 callbackUrl=null，由粘贴回退。
 */
export async function openAuthAndCaptureLocalCallback(options: {
  authorizationUrl: string;
  port: number;
  path: string;
}): Promise<{
  mode: "present" | "openURL";
  callbackUrl: string | null;
}> {
  const capture = startLocalOAuthCapture({
    port: options.port,
    path: options.path,
  });

  try {
    try {
      await Safari.present(options.authorizationUrl, true);
      if (!capture) return { mode: "present", callbackUrl: null };
      // 回调一般在关闭页面前已到达；极短等待兜底在途请求。
      const callbackUrl = await Promise.race([capture.wait, delay(400)]);
      return { mode: "present", callbackUrl };
    } catch {
      const opened = await Safari.openURL(options.authorizationUrl);
      if (!opened) throw new Error("无法打开授权页");
      return { mode: "openURL", callbackUrl: null };
    }
  } finally {
    capture?.stop();
  }
}
