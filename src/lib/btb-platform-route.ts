import { NextResponse } from "next/server";
import { PRIVATE_HEADERS, requireBtbOrigin } from "./btb-api";
import { platformActor, platformRpc, type PlatformActor } from "./btb-platform-server";

export { platformActor, platformRpc };
export type { PlatformActor };

export const PLATFORM_HEADERS = PRIVATE_HEADERS;

/**
 * Wrap a platform route handler: enforce same-origin writes, resolve the
 * personal session, and translate SQL authorization failures into safe HTTP
 * errors. The browser never supplies an actor id or a location permission.
 *
 * A handler may return either plain JSON-able data or its own Response (used by
 * the binary file download); Next's route context is forwarded untouched.
 */
export function platformRoute<A extends unknown[], B>(
  methods: readonly string[],
  handler: (context: PlatformActor, request: Request, ...rest: A) => Promise<B>,
) {
  return async (request: Request, ...rest: A): Promise<NextResponse | Response> => {
    try {
      if (methods.includes(request.method)) requireBtbOrigin(request);
      const data = await handler(await platformActor(), request, ...rest);
      if (data instanceof Response) return data;
      return NextResponse.json(data, { headers: PLATFORM_HEADERS });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "The location workspace could not complete this request." },
        { status: platformStatus(error), headers: PLATFORM_HEADERS },
      );
    }
  };
}

function platformStatus(error: unknown): number {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" && status >= 400 && status <= 599 ? status : 503;
}
