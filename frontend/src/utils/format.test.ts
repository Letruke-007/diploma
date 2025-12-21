import { describe, it, expect, vi } from "vitest";
import { fmtDate, fmtSize } from "./format";

describe("fmtSize", () => {
  it("форматирует байты без перехода к другим единицам", () => {
    expect(fmtSize(0)).toBe("0 B");
    expect(fmtSize(500)).toBe("500 B");
  });

  it("форматирует килобайты с одним знаком после запятой", () => {
    expect(fmtSize(1024)).toBe("1.0 KB");
    expect(fmtSize(1536)).toBe("1.5 KB");
  });

  it("форматирует мегабайты и выше", () => {
    const oneMB = 1024 * 1024;
    const twoAndHalfGB = 2.5 * 1024 * 1024 * 1024;

    expect(fmtSize(oneMB)).toBe("1.0 MB");

    const formatted = fmtSize(twoAndHalfGB);
    expect(formatted.endsWith(" GB")).toBe(true);
    expect(formatted.startsWith("2.5")).toBe(true);
  });

  it("не выходит за пределы последней единицы (TB)", () => {
    const huge = 1024 ** 6;
    const formatted = fmtSize(huge);

    expect(formatted.endsWith(" TB")).toBe(true);
  });

  it("возвращает '0 B' для undefined/null/отрицательных значений", () => {
    expect(fmtSize()).toBe("0 B");
    expect(fmtSize(undefined)).toBe("0 B");
    expect(fmtSize(null)).toBe("0 B");
    expect(fmtSize(-1)).toBe("0 B");
  });
});

describe("fmtDate", () => {
  it("возвращает '-' при undefined, null или пустой строке", () => {
    expect(fmtDate()).toBe("-");
    expect(fmtDate(undefined)).toBe("-");
    expect(fmtDate(null)).toBe("-");
    expect(fmtDate("")).toBe("-");
  });

  it("возвращает '-' при невалидной дате", () => {
    expect(fmtDate("not-a-date")).toBe("-");
  });

  it("использует результат Date.prototype.toLocaleString", () => {
    const iso = "2020-01-01T00:00:00.000Z";

    const spy = vi
      .spyOn(Date.prototype, "toLocaleString")
      .mockReturnValue("LOCALIZED");

    try {
      const result = fmtDate(iso);

      expect(result).toBe("LOCALIZED");
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});
