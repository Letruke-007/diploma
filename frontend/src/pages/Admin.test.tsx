/* @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import "@testing-library/jest-dom/vitest";

import Admin from "./Admin";
import { useMeQuery, useLogoutMutation } from "../features/auth/authApi";
import {
  useListUsersQuery,
  usePatchUserMutation,
  useDeleteUserMutation,
  usePurgeUserMutation,
} from "../features/users/usersApi";
import { fmtSize } from "../utils/format";

// ---- mocks ----
const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("../features/auth/authApi", () => ({
  useMeQuery: vi.fn(),
  useLogoutMutation: vi.fn(),
}));

vi.mock("../features/users/usersApi", () => ({
  useListUsersQuery: vi.fn(),
  usePatchUserMutation: vi.fn(),
  useDeleteUserMutation: vi.fn(),
  usePurgeUserMutation: vi.fn(),
}));

vi.mock("../utils/format", () => ({
  fmtSize: vi.fn((v: number) => `size-${v}`),
}));

vi.mock("react-redux", () => ({
  useDispatch: () => vi.fn(),
}));

const mockUseMeQuery = vi.mocked(useMeQuery);
const mockUseLogoutMutation = vi.mocked(useLogoutMutation);
const mockUseListUsersQuery = vi.mocked(useListUsersQuery);
const mockUsePatchUserMutation = vi.mocked(usePatchUserMutation);
const mockUseDeleteUserMutation = vi.mocked(useDeleteUserMutation);
const mockUsePurgeUserMutation = vi.mocked(usePurgeUserMutation);
const mockFmtSize = vi.mocked(fmtSize);

function renderAdmin(initialEntry = "/admin") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/admin" element={<Admin />} />
        <Route path="/login" element={<div>LOGIN</div>} />
        <Route path="/files" element={<div>FILES</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  navigateMock.mockReset();

  mockUseMeQuery.mockReturnValue({ data: { id: 999, is_admin: true } } as any);

  mockUseLogoutMutation.mockReturnValue([vi.fn()] as any);

  mockUseListUsersQuery.mockReturnValue({
    data: { results: [], count: 0 },
    isLoading: false,
    isFetching: false,
    error: undefined,
    refetch: vi.fn(),
  } as any);

  mockUsePatchUserMutation.mockReturnValue([vi.fn(), { isLoading: false }] as any);
  mockUseDeleteUserMutation.mockReturnValue([vi.fn(), { isLoading: false }] as any);
  mockUsePurgeUserMutation.mockReturnValue([vi.fn(), { isLoading: false }] as any);

  mockFmtSize.mockImplementation((v: number) => `size-${v}`);

  vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.spyOn(window, "alert").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
});

describe("Admin page (current)", () => {
  it("редиректит на /login, если me отсутствует", () => {
    mockUseMeQuery.mockReturnValue({ data: undefined } as any);

    renderAdmin("/admin");

    expect(screen.getByText("LOGIN")).toBeInTheDocument();
  });

  it("показывает 'Загрузка…' при isLoading списка пользователей", () => {
    mockUseListUsersQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: false,
      error: undefined,
      refetch: vi.fn(),
    } as any);

    renderAdmin();

    expect(screen.getByText("Загрузка…")).toBeInTheDocument();
  });

  it("показывает сообщение об ошибке при error", () => {
    mockUseListUsersQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      error: { status: 500 },
      refetch: vi.fn(),
    } as any);

    renderAdmin();

    expect(
      screen.getByText("Ошибка загрузки списка пользователей"),
    ).toBeInTheDocument();
  });

  it("показывает 'Пользователей нет' при пустом списке", () => {
    mockUseListUsersQuery.mockReturnValue({
      data: { results: [], count: 0 },
      isLoading: false,
      isFetching: false,
      error: undefined,
      refetch: vi.fn(),
    } as any);

    renderAdmin();

    expect(screen.getByText("Пользователей нет")).toBeInTheDocument();
  });

  it("рендерит пользователя, форматирует размер через fmtSize и открывает хранилище через меню 'Действия'", async () => {
    const user = userEvent.setup();

    mockUseListUsersQuery.mockReturnValue({
      data: {
        results: [
          {
            id: 1,
            username: "user1",
            full_name: "User One",
            email: "user1@example.com",
            is_admin: false,
            is_active: true,
            files_count: 3,
            files_total_size: 1234,
          },
        ],
        count: 1,
      },
      isLoading: false,
      isFetching: false,
      error: undefined,
      refetch: vi.fn(),
    } as any);

    renderAdmin();

    const row = screen.getByText("user1").closest("tr") as HTMLTableRowElement;
    expect(row).toBeInTheDocument();

    const utils = within(row);
    expect(utils.getByText("user1@example.com")).toBeInTheDocument();
    expect(utils.getByText("3")).toBeInTheDocument();

    expect(utils.getByText("size-1234")).toBeInTheDocument();
    expect(mockFmtSize).toHaveBeenCalledWith(1234);

    await user.click(utils.getByRole("button", { name: "Действия" }));
    await user.click(screen.getByRole("menuitem", { name: "Открыть хранилище" }));

    expect(navigateMock).toHaveBeenCalledWith("/files?user=1&login=user1");
  });

  it("переключение флага 'Админ' вызывает patchUser(...).unwrap() и refetch()", async () => {
    const user = userEvent.setup();

    const refetchMock = vi.fn();
    const unwrap = vi.fn().mockResolvedValue(undefined);
    const patchUser = vi.fn().mockReturnValue({ unwrap });

    mockUsePatchUserMutation.mockReturnValue([patchUser, { isLoading: false }] as any);

    mockUseListUsersQuery.mockReturnValue({
      data: {
        results: [
          {
            id: 10,
            username: "manager",
            full_name: "Manager",
            email: "m@example.com",
            is_admin: false,
            is_active: true,
            files_count: 0,
            files_total_size: 0,
          },
        ],
        count: 1,
      },
      isLoading: false,
      isFetching: false,
      error: undefined,
      refetch: refetchMock,
    } as any);

    renderAdmin();

    const row = screen.getByText("manager").closest("tr") as HTMLTableRowElement;
    const utils = within(row);

    const checkboxes = utils.getAllByRole("checkbox");
    const adminCheckbox = checkboxes[0];

    await user.click(adminCheckbox);

    expect(patchUser).toHaveBeenCalledWith({ id: 10, patch: { is_admin: true } });
    expect(unwrap).toHaveBeenCalled();
    expect(refetchMock).toHaveBeenCalled();
  });

  it("пагинация: на 1-й странице prev disabled, после клика next → prev enabled и next disabled (при 2 страницах)", async () => {
    const user = userEvent.setup();

    mockUseListUsersQuery.mockImplementation(({ page }: any) => {
      return {
        data: {
          results: [
            {
              id: page,
              username: `u${page}`,
              full_name: `User ${page}`,
              email: `u${page}@example.com`,
              is_admin: false,
              is_active: true,
              files_count: 0,
              files_total_size: 0,
            },
          ],
          count: 20, // PAGE_SIZE=10 => 2 pages
        },
        isLoading: false,
        isFetching: false,
        error: undefined,
        refetch: vi.fn(),
      } as any;
    });

    renderAdmin();

    const prevBtn = screen.getByRole("button", { name: "‹" });
    const nextBtn = screen.getByRole("button", { name: "›" });

    expect(prevBtn).toBeDisabled();
    expect(nextBtn).not.toBeDisabled();

    await user.click(nextBtn);

    expect(prevBtn).not.toBeDisabled();
    expect(nextBtn).toBeDisabled();
  });
});
