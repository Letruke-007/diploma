// @vitest-environment jsdom
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import FileRow from "./FileRow";
import { usePatchFileMutation } from "../features/files/filesApi";

vi.mock("../features/files/filesApi", () => ({
  usePatchFileMutation: vi.fn(),
}));

const mockedUsePatch = vi.mocked(usePatchFileMutation);

const baseFile = {
  id: 10,
  original_name: "document.pdf",
  size: 2048,
  uploaded_at: "2024-01-01T12:00:00Z",
  last_downloaded_at: null,
  comment: "",
  has_public_link: false,
  public_token: null,
};

function setup(overrides: Partial<typeof baseFile> = {}) {
  const onFileUpdated = vi.fn();
  const onFileDeleted = vi.fn();

  const actions = {
    download: vi.fn(),
    trash: vi.fn(),
    restore: vi.fn(),
    hardDelete: vi.fn(),
    move: vi.fn(),
    copyLinks: vi.fn(),
    rename: vi.fn(),
  };

  const file = { ...baseFile, ...overrides };

  const patchFn = vi.fn(() => ({
    unwrap: () => Promise.resolve(file),
  }));

  mockedUsePatch.mockReturnValue([patchFn, {}] as any);

  render(
    <table>
      <tbody>
        <FileRow
          file={file}
          view="my"
          actions={actions}
          selected={false}
          onRowClick={vi.fn()}
          onFileUpdated={onFileUpdated}
          onFileDeleted={onFileDeleted}
        />
      </tbody>
    </table>,
  );

  return { file, actions, onFileUpdated, onFileDeleted, patchFn };
}

afterEach(() => cleanup());

describe("FileRow (current)", () => {
  it("renders file name and formatted size", () => {
    setup();
    expect(screen.getByText("document.pdf")).toBeInTheDocument();
    expect(screen.getByText("2.0 KB")).toBeInTheDocument();
  });

  it("opens actions menu and triggers download action", async () => {
    const user = userEvent.setup();
    const { actions } = setup();

    await user.click(
      screen.getByRole("button", { name: "Дополнительные действия" }),
    );

    await user.click(screen.getByRole("button", { name: "Скачать" }));

    expect(actions.download).toHaveBeenCalledWith([10]);
  });

  it("renames file via menu prompt and calls patch + onFileUpdated", async () => {
    const user = userEvent.setup();
    const { onFileUpdated, patchFn } = setup();

    vi.stubGlobal("prompt", vi.fn(() => "newname"));

    await user.click(
      screen.getByRole("button", { name: "Дополнительные действия" }),
    );

    await user.click(screen.getByRole("button", { name: "Переименовать" }));

    expect(patchFn).toHaveBeenCalled();
    expect(onFileUpdated).toHaveBeenCalled();
  });

  it("double click opens file and updates last_downloaded_at", async () => {
    const user = userEvent.setup();
    const { onFileUpdated } = setup();

    const name = screen.getByText("document.pdf");
    await user.dblClick(name);

    expect(onFileUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        last_downloaded_at: expect.any(String),
      }),
    );
  });

  it("trash action calls actions.trash", async () => {
    const user = userEvent.setup();
    const { actions } = setup();

    await user.click(
      screen.getByRole("button", { name: "Дополнительные действия" }),
    );

    await user.click(screen.getByRole("button", { name: "Отправить в корзину" }));

    expect(actions.trash).toHaveBeenCalledWith([10]);
  });
});
