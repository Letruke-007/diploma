/**
 * @vitest-environment jsdom
 */

import React from "react";
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import Home from "./Home";

// Home использует только useMeQuery()
vi.mock("../features/auth/authApi", () => ({
  useMeQuery: vi.fn(),
}));

import { useMeQuery } from "../features/auth/authApi";

type Me = { is_admin: boolean };

function setMeQueryState(state: { data: Me | null; isLoading: boolean }) {
  vi.mocked(useMeQuery).mockReturnValue(state as any);
}

function renderHome(initialEntries: string[] = ["/"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/" element={<Home />} />

        {/* Заглушки для проверки Navigate */}
        <Route path="/login" element={<h1>Login page</h1>} />
        <Route path="/register" element={<h1>Register page</h1>} />
        <Route path="/files" element={<h1>Files page</h1>} />
        <Route path="/admin" element={<h1>Admin page</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Home page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("пока идёт проверка сессии (isLoading=true) — ничего не рендерит", () => {
    setMeQueryState({ data: null, isLoading: true });

    const { container } = renderHome();
    // Без jest-dom: проверяем отсутствие DOM-узлов
    expect(container.innerHTML).toBe("");
  });

  test("если пользователь авторизован и не админ — редиректит на /files", async () => {
    setMeQueryState({ data: { is_admin: false }, isLoading: false });

    renderHome();

    // findBy* уже гарантирует ожидание и выбросит, если не найдено
    const h = await screen.findByRole("heading", { name: "Files page" });
    expect(h).toBeTruthy();
  });

  test("если пользователь авторизован и админ — редиректит на /admin", async () => {
    setMeQueryState({ data: { is_admin: true }, isLoading: false });

    renderHome();

    const h = await screen.findByRole("heading", { name: "Admin page" });
    expect(h).toBeTruthy();
  });

  test("если пользователь не авторизован — показывает лендинг и ссылки на вход/регистрацию", () => {
    setMeQueryState({ data: null, isLoading: false });

    renderHome();

    expect(screen.getByText("MyCloud")).toBeTruthy();

    expect(
      screen.getByRole("heading", { name: "Облачное хранилище файлов" }),
    ).toBeTruthy();

    // Устойчивые проверки по смыслу
    expect(screen.getByText(/Личное облако для файлов/i)).toBeTruthy();
    expect(screen.getByText(/публичные ссылки/i)).toBeTruthy();

    const loginLink = screen.getByRole("link", { name: "Войти" });
    expect(loginLink.getAttribute("href")).toBe("/login");

    const registerLink = screen.getByRole("link", { name: "Регистрация" });
    expect(registerLink.getAttribute("href")).toBe("/register");
  });
});
