// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter } from "react-router-dom";
import { render, screen, within, cleanup, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

import Files from "./Files";

// ----------------------
// Mocks: utils / icons / FileRow
// IMPORTANT: module specifiers MUST match Files.tsx imports
// ----------------------
vi.mock("../utils/format", () => ({
  fmtSize: (n: number) => `fmt:${n}`,
}));

vi.mock("../components/icons/filetypes/FileTypeIcon", () => ({
  default: () => <span data-testid="filetype-icon" />,
}));

vi.mock("../components/FileRow", () => ({
  default: (props: any) => {
    const { file, onRowClick } = props;
    return (
      <tr
        data-testid={`file-row-${file.id}`}
        onClick={(e) => onRowClick?.(file.id, Boolean((e as any).ctrlKey || (e as any).metaKey))}
      >
        <td>{file.original_name}</td>
      </tr>
    );
  },
}));

// ----------------------
// Mocks: RTK Query hooks (auth + files)
// IMPORTANT: module specifiers MUST match Files.tsx imports
// ----------------------
const useMeQueryMock = vi.fn();
const useLogoutMutationMock = vi.fn();

vi.mock("../features/auth/authApi", () => ({
  useMeQuery: (...args: any[]) => useMeQueryMock(...args),
  useLogoutMutation: (...args: any[]) => useLogoutMutationMock(...args),
}));

const useListFilesQueryMock = vi.fn();
const useUploadFileMutationMock = vi.fn();
const useDeleteFileMutationMock = vi.fn();
const useRestoreFileMutationMock = vi.fn();
const useCreateFolderMutationMock = vi.fn();
const useIssuePublicMutationMock = vi.fn();
const useBulkMoveMutationMock = vi.fn();
const useStorageUsageQueryMock = vi.fn();

vi.mock("../features/files/filesApi", () => {
  const filesApi = {
    util: {
      resetApiState: () => ({ type: "filesApi/resetApiState" }),
      invalidateTags: (tags: any) => ({ type: "filesApi/invalidateTags", payload: tags }),
    },
  };

  return {
    filesApi,

    useListFilesQuery: (...args: any[]) => useListFilesQueryMock(...args),
    useUploadFileMutation: (...args: any[]) => useUploadFileMutationMock(...args),
    useDeleteFileMutation: (...args: any[]) => useDeleteFileMutationMock(...args),
    useRestoreFileMutation: (...args: any[]) => useRestoreFileMutationMock(...args),
    useCreateFolderMutation: (...args: any[]) => useCreateFolderMutationMock(...args),
    useIssuePublicMutation: (...args: any[]) => useIssuePublicMutationMock(...args),
    useBulkMoveMutation: (...args: any[]) => useBulkMoveMutationMock(...args),
    useStorageUsageQuery: (...args: any[]) => useStorageUsageQueryMock(...args),
  };
});

// ----------------------
// Test data
// ----------------------
const filesMock = [
  {
    id: 51,
    original_name: "doc.txt",
    is_folder: false,
    size: 123,
    parent: null,
    comment: "",
    is_deleted: false,
    deleted_at: null,
    uploaded_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 52,
    original_name: "report.pdf",
    is_folder: false,
    size: 456,
    parent: null,
    comment: "",
    is_deleted: false,
    deleted_at: null,
    uploaded_at: "2025-01-02T00:00:00Z",
    public_token: "existing-token",
  },
];

// ----------------------
// Helpers
// ----------------------
function makeStore() {
  return configureStore({
    reducer: {
      app: (state = {}) => state,
    },
  });
}

function renderPage(ui: React.ReactElement, initialPath = "/") {
  const store = makeStore();
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialPath]}>{ui}</MemoryRouter>
    </Provider>,
  );
}

function getFilesTable(): HTMLTableElement {
  const table = document.querySelector("table.table-files");
  if (!table) throw new Error("Files table not found (table.table-files)");
  return table as HTMLTableElement;
}

function getSelectionActionButtonByTitle(title: string): HTMLButtonElement {
  const btn = document.querySelector(`.files-selection-bar button[title="${title}"]`);
  if (!btn) throw new Error(`Selection action button not found: title=${title}`);
  return btn as HTMLButtonElement;
}

function getTypeFilterButton(): HTMLButtonElement {
  const btn = document.querySelector('button.files-type-filter-btn[title="Фильтр по типу"]');
  if (!btn) throw new Error("Type filter button not found");
  return btn as HTMLButtonElement;
}

function getToastText(): string | null {
  const toast = document.querySelector(".files-toast, .toast, [role='status']");
  return toast ? (toast.textContent || "").trim() : null;
}

// ----------------------
// Default hook priming
// ----------------------
function primeDefaultHooks(opts?: {
  listResults?: any[];
  listCount?: number;
  issueToken?: string | null;
}) {
  useMeQueryMock.mockReturnValue({
    data: { id: 1, username: "u", is_admin: false },
    isLoading: false,
    error: undefined,
  });

  useLogoutMutationMock.mockReturnValue([vi.fn(() => ({ unwrap: vi.fn().mockResolvedValue({}) })), {}]);

  useStorageUsageQueryMock.mockReturnValue({
    data: { used_bytes: 123, quota_bytes: 5 * 1024 * 1024 * 1024 },
    isLoading: false,
    error: undefined,
  });

  useListFilesQueryMock.mockReturnValue({
    data: { results: opts?.listResults ?? filesMock, count: opts?.listCount ?? (opts?.listResults ?? filesMock).length },
    isLoading: false,
    error: undefined,
    refetch: vi.fn(),
  });

  const uploadUnwrap = vi.fn().mockResolvedValue({});
  const uploadFn = vi.fn(() => ({ unwrap: uploadUnwrap }));
  useUploadFileMutationMock.mockReturnValue([uploadFn, { isLoading: false }]);

  const issueUnwrap = vi.fn().mockResolvedValue(opts?.issueToken === null ? {} : { token: opts?.issueToken ?? "tok" });
  const issueFn = vi.fn(() => ({ unwrap: issueUnwrap }));
  useIssuePublicMutationMock.mockReturnValue([issueFn, { isLoading: false }]);

  useDeleteFileMutationMock.mockReturnValue([vi.fn(() => ({ unwrap: vi.fn().mockResolvedValue({}) })), { isLoading: false }]);
  useRestoreFileMutationMock.mockReturnValue([vi.fn(() => ({ unwrap: vi.fn().mockResolvedValue({}) })), { isLoading: false }]);
  useCreateFolderMutationMock.mockReturnValue([vi.fn(() => ({ unwrap: vi.fn().mockResolvedValue({ id: 999 }) })), { isLoading: false }]);
  useBulkMoveMutationMock.mockReturnValue([vi.fn(() => ({ unwrap: vi.fn().mockResolvedValue({}) })), { isLoading: false }]);

  return { uploadFn, uploadUnwrap, issueFn, issueUnwrap };
}

// ----------------------
// Global stubs
// ----------------------
function primeClipboardAndWindowOpen() {
  const openSpy = vi.spyOn(window, "open").mockImplementation(() => null as any);

  let writeTextSpy: any = vi.fn().mockResolvedValue(undefined);

  try {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextSpy },
      configurable: true,
    });
  } catch {
    const clip = (navigator as any).clipboard;
    if (clip && typeof clip.writeText === "function") {
      try {
        writeTextSpy = vi.spyOn(clip, "writeText").mockResolvedValue(undefined);
      } catch {
      }
    }
  }

  return { openSpy, writeTextSpy };
}

// ----------------------
// Tests
// ----------------------
describe("Files page (stable tests, FileRow mocked as dumb <tr>)", () => {
  beforeEach(() => {
    useMeQueryMock.mockReset();
    useLogoutMutationMock.mockReset();

    useListFilesQueryMock.mockReset();
    useUploadFileMutationMock.mockReset();
    useDeleteFileMutationMock.mockReset();
    useRestoreFileMutationMock.mockReset();
    useCreateFolderMutationMock.mockReset();
    useIssuePublicMutationMock.mockReset();
    useBulkMoveMutationMock.mockReset();
    useStorageUsageQueryMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("render: shows table rows + subtitle uses fmtSize(used_bytes)", async () => {
    primeDefaultHooks();

    renderPage(<Files />, "/");

    expect(await screen.findByText(/занято fmt:123/i)).toBeInTheDocument();

    const table = getFilesTable();
    expect(within(table).getByTestId("file-row-51")).toBeInTheDocument();
    expect(within(table).getByTestId("file-row-52")).toBeInTheDocument();
  });

  it("upload: select file via #fileInput -> inline form appears -> submit calls uploadFile().unwrap()", async () => {
    const { uploadFn, uploadUnwrap } = primeDefaultHooks();
    const user = userEvent.setup();

    renderPage(<Files />, "/");

    const input = document.querySelector('input[type="file"]#fileInput') as HTMLInputElement | null;
    expect(input).toBeTruthy();

    const file = new File(["hello"], "hello.txt", { type: "text/plain" });
    await user.upload(input!, file);

    const inlineForm = document.querySelector("form.files-upload-inline") as HTMLFormElement | null;
    expect(inlineForm).toBeTruthy();

    const form = within(inlineForm!);
    const comment = form.getByPlaceholderText(/комментарий/i);
    await user.type(comment, "test comment");

    const submitBtn = form.getByRole("button", { name: /загрузить/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(uploadFn).toHaveBeenCalled();
      expect(uploadUnwrap).toHaveBeenCalled();
    });
  });

  it("SelectionBar: 'Отменить выделение' returns bar to idle", async () => {
    primeDefaultHooks();
    const user = userEvent.setup();

    renderPage(<Files />, "/");

    const table = getFilesTable();
    await user.click(within(table).getByTestId("file-row-51"));

    const cancelBtn = getSelectionActionButtonByTitle("Отменить выделение");
    await user.click(cancelBtn);

    const bar = document.querySelector(".files-selection-bar");
    expect(bar?.className).toContain("files-selection-bar--idle");
  });

  it("Type filter: choose 'Изображения' -> empty state 'Ничего не найдено' + 'Очистить фильтр' restores rows", async () => {
    primeDefaultHooks();
    const user = userEvent.setup();

    renderPage(<Files />, "/");

    await user.click(getTypeFilterButton());

    const menu = await screen.findByRole("menu");
    // пункты имеют role="menuitem"
    await user.click(within(menu).getByRole("menuitem", { name: "Изображения" }));

    expect(await screen.findByText(/ничего не найдено/i)).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: /очистить фильтр/i }));

    const table = getFilesTable();
    expect(within(table).getByTestId("file-row-51")).toBeInTheDocument();
    expect(within(table).getByTestId("file-row-52")).toBeInTheDocument();
  });

  it("copyLinks: only folders selected -> shows toast 'Публичные ссылки можно создать только для файлов'", async () => {
    primeDefaultHooks({
      listResults: [
        {
          id: 60,
          original_name: "folder",
          is_folder: true,
          size: 0,
          parent: null,
          comment: "",
          is_deleted: false,
          deleted_at: null,
          uploaded_at: "2025-01-01T00:00:00Z",
        },
      ],
      listCount: 1,
    });

    primeClipboardAndWindowOpen();
    const user = userEvent.setup();

    renderPage(<Files />, "/");

    const table = getFilesTable();
    await user.click(within(table).getByTestId("file-row-60"));

    await user.click(getSelectionActionButtonByTitle("Копировать ссылку"));

    await waitFor(() => {
      expect(getToastText()).toMatch(/публичные ссылки можно создать только для файлов/i);
    });
  });

  it("copyLinks error: issuePublic unwrap resolves without token -> toast 'Не удалось скопировать ссылки'", async () => {
    const { issueFn } = primeDefaultHooks({ issueToken: null });
    primeClipboardAndWindowOpen();
    const user = userEvent.setup();

    renderPage(<Files />, "/");

    const table = getFilesTable();
    await user.click(within(table).getByTestId("file-row-51"));

    await user.click(getSelectionActionButtonByTitle("Копировать ссылку"));

    await waitFor(() => {
      expect(issueFn).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(getToastText()).toMatch(/не удалось скопировать ссылки/i);
    });
  });

  it("Empty state: recent view shows unique text 'Недавних файлов пока нет.'", async () => {
    primeDefaultHooks({ listResults: [], listCount: 0 });

    renderPage(<Files />, "/recent");

    expect(await screen.findByText(/недавних файлов пока нет/i)).toBeInTheDocument();
  });

  it("Empty state: trash view shows unique subtitle about trash", async () => {
    primeDefaultHooks({ listResults: [], listCount: 0 });

    renderPage(<Files />, "/trash");

    expect(await screen.findByText(/файлы в корзине хранятся 30 дней/i)).toBeInTheDocument();
  });
});
