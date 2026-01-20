// INFO : app/entry.server.tsx - Correction mineure
import type { AppLoadContext, EntryContext } from "react-router";
import { ServerRouter } from "react-router";
import { isbot } from "isbot";
import { renderToReadableStream } from "react-dom/server";

export default async function handleRequest(
    request: Request,
    responseStatusCode: number,
    responseHeaders: Headers,
    routerContext: EntryContext,
    _loadContext: AppLoadContext,
) {
    let shellRendered = false;
    const userAgent = request.headers.get("user-agent");

    const body = await renderToReadableStream(
        <ServerRouter context={routerContext} url={request.url} />,
        {
            onError(error: unknown) {
                responseStatusCode = 500;
                console.error("Error during SSR:", error);
            }
        }
    );

    shellRendered = true;

    if ((userAgent && isbot(userAgent)) || routerContext.isSpaMode) {
        await body.allReady;
    }

    responseHeaders.set("Content-Type", "text/html");
    // Ne pas définir Cross-Origin-Opener-Policy sur les pages HTML car cela interfère
    // avec @react-oauth/google qui utilise des iframes et postMessage.
    // On garde COOP uniquement sur les routes API nécessaires (défini dans workers/app.ts et workers/upload.ts).
    // responseHeaders.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    responseHeaders.set("Cross-Origin-Embedder-Policy", "unsafe-none");

    return new Response(body, {
        headers: responseHeaders,
        status: responseStatusCode,
    });
}