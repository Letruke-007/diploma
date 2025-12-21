// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
  MemoryRouter,
  Routes,
  Route,
} from "react-router-dom";

import ProtectedRoute from "./ProtectedRoute";
import { useMeQuery } from "../features/auth/authApi";

vi.mock("../features/auth/authApi", () => ({
  useMeQuery: vi.fn(),
}));

const mockUseMeQuery = vi.mocked(useMeQuery);

function renderWithRouter(ui: React.ReactNode, initialPath = "/private") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>login-page</div>} />
        <Route path="/files" element={<div>files-page</div>} />
        <Route
          path="/private"
          element={ui}
        />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProtectedRoute", () => {
  it("показывает индикатор загрузки, пока isLoading = true", () => {
    mockUseMeQuery.mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
    } as any);

    renderWithRouter(
      <ProtectedRoute>
        <div>private</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText("Загрузка…")).toBeInTheDocument();
    expect(screen.queryByText("private")).not.toBeInTheDocument();
  });

  it("редиректит на /login, если пользователь не авторизован", () => {
    mockUseMeQuery.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
    } as any);

    renderWithRouter(
      <ProtectedRoute>
        <div>private</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText("login-page")).toBeInTheDocument();
    expect(screen.queryByText("private")).not.toBeInTheDocument();
  });

  it("рендерит children, если пользователь авторизован", () => {
    mockUseMeQuery.mockReturnValue({
      data: { id: 1, is_admin: false },
      isLoading: false,
      isError: false,
    } as any);

    renderWithRouter(
      <ProtectedRoute>
        <div>private</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText("private")).toBeInTheDocument();
  });

  it("редиректит на /files, если adminOnly=true и пользователь не админ", () => {
    mockUseMeQuery.mockReturnValue({
      data: { id: 1, is_admin: false },
      isLoading: false,
      isError: false,
    } as any);

    renderWithRouter(
      <ProtectedRoute adminOnly>
        <div>admin</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText("files-page")).toBeInTheDocument();
    expect(screen.queryByText("admin")).not.toBeInTheDocument();
  });

  it("рендерит children, если adminOnly=true и пользователь админ", () => {
    mockUseMeQuery.mockReturnValue({
      data: { id: 1, is_admin: true },
      isLoading: false,
      isError: false,
    } as any);

    renderWithRouter(
      <ProtectedRoute adminOnly>
        <div>admin</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText("admin")).toBeInTheDocument();
  });
});
