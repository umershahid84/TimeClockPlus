import { describe, expect, it, vi } from "vitest";
import { asyncHandler } from "./asyncHandler";

describe("asyncHandler", () => {
  it("forwards a rejected promise to next() instead of leaving it unhandled", async () => {
    const boom = new Error("boom");
    const handler = asyncHandler(async () => {
      throw boom;
    });
    const next = vi.fn();

    // @ts-expect-error - minimal req/res stand-ins are sufficient here
    await handler({}, {}, next);

    expect(next).toHaveBeenCalledWith(boom);
  });

  it("does not call next() when the handler resolves normally", async () => {
    const handler = asyncHandler(async (_req, res) => {
      (res as unknown as { json: (v: unknown) => void }).json({ ok: true });
    });
    const next = vi.fn();
    const res = { json: vi.fn() };

    // @ts-expect-error - minimal req/res stand-ins are sufficient here
    await handler({}, res, next);

    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(next).not.toHaveBeenCalled();
  });
});
