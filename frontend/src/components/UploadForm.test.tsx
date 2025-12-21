// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

import UploadForm from "./UploadForm";
import { useUploadFileMutation } from "../features/files/filesApi";

vi.mock("../features/files/filesApi", () => ({
  useUploadFileMutation: vi.fn(),
}));

const mockUseUploadFileMutation = vi.mocked(useUploadFileMutation);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

function getLastCommentInput() {
  const items = screen.getAllByPlaceholderText("Комментарий");
  return items[items.length - 1] as HTMLInputElement;
}

function getLastChooseButton() {
  const items = screen.getAllByRole("button", { name: "Выбрать файл" });
  return items[items.length - 1] as HTMLButtonElement;
}

describe("UploadForm", () => {
  it("рендерит элементы формы и подсказку", () => {
    mockUseUploadFileMutation.mockReturnValue([
      vi.fn(),
      { isLoading: false },
    ] as any);

    render(<UploadForm />);

    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();

    expect(getLastCommentInput()).toBeInTheDocument();

    expect(getLastChooseButton()).toBeInTheDocument();

    expect(
      screen.getByText("Можно добавить комментарий перед загрузкой"),
    ).toBeInTheDocument();
  });

  it("загружает файл с комментарием и очищает поля после успешной загрузки", async () => {
    const user = userEvent.setup();

    const unwrap = vi.fn().mockResolvedValue(undefined);
    const upload = vi.fn().mockReturnValue({ unwrap });

    mockUseUploadFileMutation.mockReturnValue([
      upload,
      { isLoading: false },
    ] as any);

    const { container } = render(<UploadForm />);

    const commentInput = getLastCommentInput();

    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    const file = new File(["test"], "test.txt", { type: "text/plain" });

    await user.type(commentInput, "my comment");
    await user.upload(fileInput, file);

    expect(upload).toHaveBeenCalledWith({
      file,
      comment: "my comment",
    });
    expect(unwrap).toHaveBeenCalled();

    expect(commentInput.value).toBe("");
    expect(fileInput.value).toBe("");
  });

  it("отключает file-input и кнопку и показывает 'Загрузка…' при isLoading = true", () => {
    mockUseUploadFileMutation.mockReturnValue([
      vi.fn(),
      { isLoading: true },
    ] as any);

    const { container } = render(<UploadForm />);

    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    const commentInput = getLastCommentInput();
    const button = screen.getAllByRole("button").slice(-1)[0] as HTMLButtonElement;

    expect(fileInput).toBeDisabled();
    expect(button).toBeDisabled();
    expect(commentInput).not.toBeDisabled();
    expect(button).toHaveTextContent("Загрузка…");
  });

  it("по клику на кнопку вызывает click() у file-input", async () => {
    const user = userEvent.setup();

    mockUseUploadFileMutation.mockReturnValue([
      vi.fn(),
      { isLoading: false },
    ] as any);

    const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click");

    render(<UploadForm />);

    const button = getLastChooseButton();

    await user.click(button);

    expect(clickSpy).toHaveBeenCalled();
  });
});
