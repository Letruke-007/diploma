// @vitest-environment jsdom
import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";

import { ProgressBar } from "./ProgressBar";

describe("ProgressBar", () => {
  it("рендерит внешний контейнер с базовыми классами", () => {
    const { container } = render(<ProgressBar percent={50} />);

    const outer = container.querySelector("div.w-full") as HTMLDivElement | null;
    expect(outer).toBeInTheDocument();
    expect(outer?.tagName.toLowerCase()).toBe("div");

    expect(outer).toHaveClass("w-full", "bg-gray-200", "rounded-xl", "h-3", "overflow-hidden");
  });

  it("использует percent в диапазоне 0–100 как ширину (%)", () => {
    const { container } = render(<ProgressBar percent={42.5} />);

    const inner = container.querySelector('div[style*="width: 42.5%"]') as HTMLDivElement | null;
    expect(inner).toBeInTheDocument();
    expect(inner?.style.width).toBe("42.5%");
  });

  it("обрезает отрицательное значение percent до 0%", () => {
    const { container } = render(<ProgressBar percent={-10} />);

    const inner = container.querySelector('div[style*="width: 0%"]') as HTMLDivElement | null;
    expect(inner).toBeInTheDocument();
    expect(inner?.style.width).toBe("0%");
  });

  it("обрезает значение percent больше 100 до 100%", () => {
    const { container } = render(<ProgressBar percent={180} />);

    const inner = container.querySelector('div[style*="width: 100%"]') as HTMLDivElement | null;
    expect(inner).toBeInTheDocument();
    expect(inner?.style.width).toBe("100%");
  });
});
