import { describe, expect, it, vi } from "vitest";

import { awaitable, awaitPendingCallbacks } from "@/awaitableCallback";

describe("awaitPendingCallbacks", () => {
  it("waits for callbacks added while it is already draining pending callbacks", async () => {
    const events: string[] = [];
    let resolveSecond!: () => void;
    const secondCanFinish = new Promise<void>((resolve) => {
      resolveSecond = resolve;
    });

    let resolveSecondStarted!: () => void;
    const secondStarted = new Promise<void>((resolve) => {
      resolveSecondStarted = resolve;
    });

    const second = awaitable(async () => {
      events.push("second:start");
      resolveSecondStarted();
      await secondCanFinish;
      events.push("second:end");
    });

    const first = awaitable(async () => {
      events.push("first:start");
      await Promise.resolve();
      second();
      events.push("first:end");
    });

    first();

    let drained = false;
    const drain = awaitPendingCallbacks().then(() => {
      drained = true;
    });

    await secondStarted;
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(drained).toBe(false);
    expect(events).toEqual(["first:start", "first:end", "second:start"]);

    resolveSecond();
    await drain;

    expect(drained).toBe(true);
    expect(events).toEqual(["first:start", "first:end", "second:start", "second:end"]);
  });

  it("waits for callbacks scheduled just before the drain starts", async () => {
    const events: string[] = [];
    let resolveCallback!: () => void;
    const callbackCanFinish = new Promise<void>((resolve) => {
      resolveCallback = resolve;
    });

    let resolveCallbackStarted!: () => void;
    const callbackStarted = new Promise<void>((resolve) => {
      resolveCallbackStarted = resolve;
    });

    const callback = awaitable(async () => {
      events.push("callback:start");
      resolveCallbackStarted();
      await callbackCanFinish;
      events.push("callback:end");
    });

    setTimeout(() => {
      callback();
    }, 0);

    let drained = false;
    const drain = awaitPendingCallbacks().then(() => {
      drained = true;
    });

    await callbackStarted;
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(drained).toBe(false);
    expect(events).toEqual(["callback:start"]);

    resolveCallback();
    await drain;

    expect(drained).toBe(true);
    expect(events).toEqual(["callback:start", "callback:end"]);
  });

  it("timeout resolves while a callback stays pending and a later drain still waits", async () => {
    const events: string[] = [];
    let resolveCallback!: () => void;
    const callbackCanFinish = new Promise<void>((resolve) => {
      resolveCallback = resolve;
    });

    const callback = awaitable(async () => {
      events.push("callback:start");
      await callbackCanFinish;
      events.push("callback:end");
    });

    callback();

    await awaitPendingCallbacks({ timeoutMs: 5 });
    expect(events).toEqual(["callback:start"]);

    let drained = false;
    const drain = awaitPendingCallbacks().then(() => {
      drained = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(drained).toBe(false);

    resolveCallback();
    await drain;

    expect(drained).toBe(true);
    expect(events).toEqual(["callback:start", "callback:end"]);
  });

  it("logs rejected callbacks and continues draining later callbacks", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const events: string[] = [];

    try {
      const failing = awaitable(async function failingCallback() {
        events.push("failing");
        throw new Error("boom");
      });
      const following = awaitable(async function followingCallback() {
        events.push("following");
      });

      failing();
      following();
      await awaitPendingCallbacks();

      expect(events).toEqual(["failing", "following"]);
      expect(error).toHaveBeenCalledWith(
        'Error in awaitable callback "failingCallback":',
        expect.any(Error),
      );
    } finally {
      error.mockRestore();
    }
  });
});
