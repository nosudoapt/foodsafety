import { NextResponse } from "next/server";
import { apiFailure, PRIVATE_HEADERS, requireBtbOrigin } from "./btb-api";
import { platformActor, platformRpc, type PlatformActor } from "./btb-platform-server";
import { BtbApiError } from "./api-errors";
import { inWorkspace } from "./workspace-request-context";

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
       const actor = await platformActor();
       const selected = new URL(request.url).searchParams.get("location");
       if (selected !== null && selected !== actor.locationId) throw new BtbApiError("This location is not the current workspace.", 403);
       const data = await inWorkspace({ claims: actor.workspace.claims, db: actor.db }, () => handler(actor, request, ...rest));
      if (data instanceof Response) return data;
      return NextResponse.json(data, { headers: PLATFORM_HEADERS });
    } catch (error) {
      return apiFailure(error, request);
    }
  };
}
