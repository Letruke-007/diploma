/**
 * @vitest-environment jsdom
 */

import React from "react";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import Login from "./Login";
import { useLoginMutation, useMeQuery } from "../features/auth/authApi";
import { useDispatch } from "react-redux";

/* -------------------- mocks -------------------- */

vi.mock("../features/auth/authApi", () => ({
  useLoginMutation: vi.fn(),
  useMeQuery: vi.fn(),
  authApi: {
    util: {
      resetApiState: vi.fn(() => ({ type: "auth/reset" })),
    },
  },
}));

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<any>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("react-redux", () => ({
  useDispatch: vi.fn(),
}));

/* -------------------- helpers -------------------- */

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Login />
    </MemoryRouter>,
  );
}

function mockLoginMutation(impl: () => Promise<any>) {
  const unwrap = vi.fn(impl);
  const trigger = vi.fn(() => ({ unwrap }));
  vi.mocked(useLoginMutation).mockReturnValue([trigger as any, {} as any]);
  return { trigger, unwrap };
}

/* -------------------- tests -------------------- */

describe("Login page", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // по умолчанию пользователь не залогинен
    vi.mocked(useMeQuery).mockReturnValue({ data: null } as any);

    // mock dispatch
    vi.mocked(useDispatch).mockReturnValue(vi.fn());

    // дефолтная мутация
    mockLoginMutation(() => Promise.resolve({ is_admin: false }));
  });

  test("если пользователь уже залогинен — редиректит (форма не рендерится)", () => {
    vi.mocked(useMeQuery).mockReturnValue({
      data: { is_admin: false },
    } as any);

    renderLogin();

    // при Navigate форма не должна появляться
    expect(screen.queryByRole("heading", { name: "Вход в аккаунт" })).toBeNull();
  });

  test("рендерит заголовок и форму", () => {
    renderLogin();

    expect(screen.getByRole("heading", { name: "Вход в аккаунт" })).toBeTruthy();

    screen.getByLabelText("Логин");
    screen.getByLabelText("Пароль");

    const btn = screen.getByRole("button", { name: "Войти" });
    expect(btn).toBeTruthy();

    const registerLink = screen.getByRole("link", {
      name: "Зарегистрироваться",
    });
    expect(registerLink.getAttribute("href")).toBe("/register");
  });

  test("валидация: показывает ошибки при пустых полях", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole("button", { name: "Войти" }));

    expect(screen.getByText("Укажите логин")).toBeTruthy();
    expect(screen.getByText("Укажите пароль")).toBeTruthy();
  });

  test("валидация: проверяет минимальную длину", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText("Логин"), "a");
    await user.type(screen.getByLabelText("Пароль"), "123");

    await user.click(screen.getByRole("button", { name: "Войти" }));

    expect(screen.getByText("Минимум 2 символа")).toBeTruthy();
    expect(screen.getByText("Минимум 4 символа")).toBeTruthy();
  });

  test("успешный логин (не админ) — вызывает mutation и navigate('/files')", async () => {
    const user = userEvent.setup();
    const dispatchMock = vi.fn();
    vi.mocked(useDispatch).mockReturnValue(dispatchMock);

    const { trigger, unwrap } = mockLoginMutation(() =>
      Promise.resolve({ is_admin: false }),
    );

    renderLogin();

    await user.type(screen.getByLabelText("Логин"), "anton");
    await user.type(screen.getByLabelText("Пароль"), "123456");
    await user.click(screen.getByRole("button", { name: "Войти" }));

    expect(trigger).toHaveBeenCalledWith({
      username: "anton",
      password: "123456",
    });
    expect(unwrap).toHaveBeenCalled();

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/files", { replace: true });
    });
  });

  test("успешный логин (админ) — navigate('/admin')", async () => {
    const user = userEvent.setup();
    const dispatchMock = vi.fn();
    vi.mocked(useDispatch).mockReturnValue(dispatchMock);

    mockLoginMutation(() => Promise.resolve({ is_admin: true }));

    renderLogin();

    await user.type(screen.getByLabelText("Логин"), "admin");
    await user.type(screen.getByLabelText("Пароль"), "123456");
    await user.click(screen.getByRole("button", { name: "Войти" }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/admin", { replace: true });
    });
  });

  test("если сервер вернул ошибку с detail — отображается detail", async () => {
    const user = userEvent.setup();

    mockLoginMutation(() =>
      Promise.reject({ data: { detail: "Неверные учетные данные" } }),
    );

    renderLogin();

    await user.type(screen.getByLabelText("Логин"), "anton");
    await user.type(screen.getByLabelText("Пароль"), "wrong");
    await user.click(screen.getByRole("button", { name: "Войти" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Неверные учетные данные");
  });

  test("если в ошибке нет detail — показывается 'Ошибка входа'", async () => {
    const user = userEvent.setup();

    mockLoginMutation(() => Promise.reject({}));

    renderLogin();

    await user.type(screen.getByLabelText("Логин"), "anton");
    await user.type(screen.getByLabelText("Пароль"), "oops");
    await user.click(screen.getByRole("button", { name: "Войти" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Ошибка входа");
  });

  test('кнопка дизейблится и меняет текст на "Входим…" при isSubmitting', async () => {
    const user = userEvent.setup();

    let resolve!: (v?: unknown) => void;

    mockLoginMutation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );

    renderLogin();

    await user.type(screen.getByLabelText("Логин"), "anton");
    await user.type(screen.getByLabelText("Пароль"), "12345");

    const btn = screen.getByRole("button", { name: "Войти" });
    const clickPromise = user.click(btn);

    await waitFor(() => {
      // Без jest-dom: проверяем через нативные свойства/атрибуты
      expect((btn as HTMLButtonElement).disabled).toBe(true);
      expect(btn.textContent).toBe("Входим…");
    });

    resolve();
    await clickPromise;

    await waitFor(() => {
      expect((btn as HTMLButtonElement).disabled).toBe(false);
      expect(btn.textContent).toBe("Войти");
    });
  });
});
