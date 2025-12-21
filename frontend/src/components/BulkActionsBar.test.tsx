// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import BulkActionsBar from "./BulkActionsBar";
import { useDeleteFileMutation } from "../features/files/filesApi";

vi.mock("../features/files/filesApi", () => ({
  useDeleteFileMutation: vi.fn(),
}));

type DeleteCall = { unwrap: () => Promise<unknown> };
type DeleteFn = (id: number) => DeleteCall;

const mockedUseDeleteFileMutation = vi.mocked(useDeleteFileMutation);

function makeDeleteFn(
  perId: Record<number, "ok" | "fail">
): DeleteFn & { calls: number[] } {
  const calls: number[] = [];

  const fn = ((id: number) => {
    calls.push(id);
    const mode = perId[id] ?? "ok";
    return {
      unwrap: () =>
        mode === "ok"
          ? Promise.resolve({ ok: true })
          : Promise.reject(new Error("fail")),
    };
  }) as DeleteFn & { calls: number[] };

  fn.calls = calls;
  return fn;
}

function getDeleteButton(count: number) {
  // В dom могут оставаться элементы от предыдущих тестов, если test runner настроен нестандартно.
  // Поэтому берём кнопку в рамках последнего контейнера (последнего render()).
  const buttons = screen.getAllByRole("button", {
    name: new RegExp(`Удалить выбранные \\(${count}\\)`, "i"),
  });
  return buttons[buttons.length - 1];
}

describe("BulkActionsBar", () => {
  const onDeleted = vi.fn();
  const clearSelection = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("alert", vi.fn());

    const deleteFn = makeDeleteFn({});
    mockedUseDeleteFileMutation.mockReturnValue([deleteFn, {}] as any);
  });

  afterEach(() => {
    cleanup();
  });

  it("не рендерит панель, если выбрано 0 или 1 файл", () => {
    const { rerender } = render(
      <BulkActionsBar
        selectedIds={[]}
        onDeleted={onDeleted}
        clearSelection={clearSelection}
      />
    );

    expect(
      screen.queryByRole("button", { name: /Удалить выбранные/i })
    ).toBeNull();

    rerender(
      <BulkActionsBar
        selectedIds={[1]}
        onDeleted={onDeleted}
        clearSelection={clearSelection}
      />
    );

    expect(
      screen.queryByRole("button", { name: /Удалить выбранные/i })
    ).toBeNull();
  });

  it("рендерит кнопку удаления, если выбрано больше одного файла", () => {
    render(
      <BulkActionsBar
        selectedIds={[1, 2, 3]}
        onDeleted={onDeleted}
        clearSelection={clearSelection}
      />
    );

    expect(getDeleteButton(3)).toBeInTheDocument();
  });

  it("при подтверждении удаляет выбранные и вызывает onDeleted/clearSelection (только успешно удалённые)", async () => {
    const user = userEvent.setup();

    const deleteFn = makeDeleteFn({ 10: "ok", 20: "ok" });
    mockedUseDeleteFileMutation.mockReturnValue([deleteFn, {}] as any);

    render(
      <BulkActionsBar
        selectedIds={[10, 20]}
        onDeleted={onDeleted}
        clearSelection={clearSelection}
      />
    );

    await user.click(getDeleteButton(2));

    expect(globalThis.confirm).toHaveBeenCalledTimes(1);
    expect(deleteFn.calls).toEqual([10, 20]);

    expect(onDeleted).toHaveBeenCalledWith([10, 20]);
    expect(clearSelection).toHaveBeenCalledTimes(1);
    expect(globalThis.alert).not.toHaveBeenCalled();
  });

  it("если пользователь отменяет confirm, ничего не происходит", async () => {
    const user = userEvent.setup();

    vi.stubGlobal("confirm", vi.fn(() => false));

    const deleteFn = makeDeleteFn({ 1: "ok", 2: "ok" });
    mockedUseDeleteFileMutation.mockReturnValue([deleteFn, {}] as any);

    render(
      <BulkActionsBar
        selectedIds={[1, 2]}
        onDeleted={onDeleted}
        clearSelection={clearSelection}
      />
    );

    await user.click(getDeleteButton(2));

    expect(globalThis.confirm).toHaveBeenCalledTimes(1);
    expect(deleteFn.calls).toEqual([]);

    expect(onDeleted).not.toHaveBeenCalled();
    expect(clearSelection).not.toHaveBeenCalled();
    expect(globalThis.alert).not.toHaveBeenCalled();
  });

  it("если часть удалений падает, вызывает onDeleted только с успешно удалёнными и очищает выделение", async () => {
    const user = userEvent.setup();

    const deleteFn = makeDeleteFn({ 1: "fail", 2: "ok", 3: "fail" });
    mockedUseDeleteFileMutation.mockReturnValue([deleteFn, {}] as any);

    render(
      <BulkActionsBar
        selectedIds={[1, 2, 3]}
        onDeleted={onDeleted}
        clearSelection={clearSelection}
      />
    );

    await user.click(getDeleteButton(3));

    expect(deleteFn.calls).toEqual([1, 2, 3]);
    expect(onDeleted).toHaveBeenCalledWith([2]);
    expect(clearSelection).toHaveBeenCalledTimes(1);
    expect(globalThis.alert).not.toHaveBeenCalled();
  });

  it("если ни один файл не удалён, показывает alert и не вызывает onDeleted/clearSelection", async () => {
    const user = userEvent.setup();

    const deleteFn = makeDeleteFn({ 1: "fail", 2: "fail" });
    mockedUseDeleteFileMutation.mockReturnValue([deleteFn, {}] as any);

    render(
      <BulkActionsBar
        selectedIds={[1, 2]}
        onDeleted={onDeleted}
        clearSelection={clearSelection}
      />
    );

    await user.click(getDeleteButton(2));

    expect(deleteFn.calls).toEqual([1, 2]);

    expect(globalThis.alert).toHaveBeenCalledWith(
      "Не удалось удалить выбранные файлы."
    );
    expect(onDeleted).not.toHaveBeenCalled();
    expect(clearSelection).not.toHaveBeenCalled();
  });
});
