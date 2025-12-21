// @vitest-environment jsdom
import React, { useEffect } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { useThrottle } from "./hooks";

vi.useFakeTimers();

type ThrottledFn = (...args: any[]) => void;

type TestComponentProps = {
  callback: (...args: any[]) => void;
  delay: number;
  onReady: (fn: ThrottledFn) => void;
};

function TestComponent({ callback, delay, onReady }: TestComponentProps) {
  const throttled = useThrottle(callback, delay);

  useEffect(() => {
    onReady(throttled);
  }, [throttled, onReady]);

  return null;
}

function setup(delay = 1000) {
  const callback = vi.fn();
  let throttled: ThrottledFn = () => {};

  render(
    <TestComponent
      callback={callback}
      delay={delay}
      onReady={(fn) => {
        throttled = fn;
      }}
    />,
  );

  return { callback, throttled };
}

describe("useThrottle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
  });

  it("немедленно вызывает функцию при первом вызове", () => {
    const { callback, throttled } = setup(1000);

    act(() => {
      throttled("a");
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith("a");
  });

  it("не вызывает функцию повторно, если delay ещё не прошёл", () => {
    const { callback, throttled } = setup(1000);

    act(() => {
      throttled();
      throttled();
      throttled();
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("вызывает отложенно, если вызвали раньше delay", () => {
    const { callback, throttled } = setup(1000);

    act(() => {
      throttled("first"); // сразу
    });
    expect(callback).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(300);
      throttled("second"); // ставим таймер
    });
    expect(callback).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(700); // всего прошло 1000 мс
    });

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith("second");
  });

  it("после окончания delay снова вызывает сразу", () => {
    const { callback, throttled } = setup(500);

    act(() => {
      throttled();                   // вызов №1 — сразу
      vi.advanceTimersByTime(200);
      throttled();                   // уходит в timeout
      vi.advanceTimersByTime(300);   // timeout → вызов №2
      vi.advanceTimersByTime(500);   // проходит ещё один delay
      throttled();                   // вызов №3 — снова сразу
    });

    expect(callback).toHaveBeenCalledTimes(3);
  });
});
