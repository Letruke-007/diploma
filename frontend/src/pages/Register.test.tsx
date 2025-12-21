// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Register from "./Register";

afterEach(() => {
  cleanup();
});

const mocks = vi.hoisted(() => {
  const navigateMock = vi.fn();
  const dispatchMock = vi.fn();

  type Unwrapable<T = unknown> = { unwrap: () => Promise<T> };

  const registerUnwrapMock = vi.fn<() => Promise<unknown>>();
  const loginUnwrapMock = vi.fn<() => Promise<unknown>>();

  const registerCallMock = vi.fn<(values: unknown) => Unwrapable>(() => ({ unwrap: registerUnwrapMock }));
  const loginCallMock = vi.fn<(values: unknown) => Unwrapable>(() => ({ unwrap: loginUnwrapMock }));

  const resetApiStateAction = { type: "authApi/reset" };
  const resetApiStateMock = vi.fn(() => resetApiStateAction);

  return {
    navigateMock,
    dispatchMock,
    registerUnwrapMock,
    loginUnwrapMock,
    registerCallMock,
    loginCallMock,
    resetApiStateMock,
    resetApiStateAction,
  };
});

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mocks.navigateMock,
  };
});

vi.mock("react-redux", () => {
  return {
    useDispatch: () => mocks.dispatchMock,
  };
});

vi.mock("../features/auth/authApi", () => {
  return {
    useRegisterMutation: () => [mocks.registerCallMock] as const,
    useLoginMutation: () => [mocks.loginCallMock] as const,
    authApi: {
      util: {
        resetApiState: mocks.resetApiStateMock,
      },
    },
  };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>,
  );
}

function getForm() {
  const form = document.querySelector("form.auth-form");
  if (!form) throw new Error("Register form (.auth-form) not found");
  return form as HTMLFormElement;
}

function getSubmitButton() {
  return within(getForm()).getByRole("button", { name: /создать аккаунт/i });
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Логин"), "User123");
  await user.type(screen.getByLabelText("Имя"), "Антон");
  await user.type(screen.getByLabelText("Email"), "anton@example.com");
  await user.type(screen.getByLabelText("Пароль"), "Abc1!x");
}

describe("Register page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.registerUnwrapMock.mockResolvedValue({});
    mocks.loginUnwrapMock.mockResolvedValue({});
  });

  it("рендерит форму регистрации и основные поля", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Регистрация" })).toBeInTheDocument();
    expect(screen.getByLabelText("Логин")).toBeInTheDocument();
    expect(screen.getByLabelText("Имя")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Пароль")).toBeInTheDocument();
    expect(getSubmitButton()).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Войти" })).toBeInTheDocument();
  });

  it("показывает клиентские ошибки валидации при пустой отправке", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(getSubmitButton());

    expect(await screen.findByText("Укажите логин")).toBeInTheDocument();
    expect(screen.getByText("Укажите имя")).toBeInTheDocument();
    expect(screen.getByText("Укажите email")).toBeInTheDocument();
    expect(screen.getByText("Укажите пароль")).toBeInTheDocument();

    expect(mocks.registerCallMock).not.toHaveBeenCalled();
    expect(mocks.loginCallMock).not.toHaveBeenCalled();
    expect(mocks.navigateMock).not.toHaveBeenCalled();
  });

  it("успешно регистрирует, логинит, сбрасывает api state и редиректит на /files", async () => {
    const user = userEvent.setup();
    renderPage();

    await fillValidForm(user);
    await user.click(getSubmitButton());

    await waitFor(() => expect(mocks.registerCallMock).toHaveBeenCalledTimes(1));
    expect(mocks.registerCallMock).toHaveBeenCalledWith({
      username: "User123",
      full_name: "Антон",
      email: "anton@example.com",
      password: "Abc1!x",
    });

    await waitFor(() => expect(mocks.loginCallMock).toHaveBeenCalledTimes(1));
    expect(mocks.loginCallMock).toHaveBeenCalledWith({
      username: "User123",
      password: "Abc1!x",
    });

    await waitFor(() => {
      expect(mocks.resetApiStateMock).toHaveBeenCalledTimes(1);
      expect(mocks.dispatchMock).toHaveBeenCalledWith(mocks.resetApiStateAction);
      expect(mocks.navigateMock).toHaveBeenCalledWith("/files", { replace: true });
    });
  });

  it("показывает serverError из e.data.detail и не редиректит", async () => {
    const user = userEvent.setup();
    mocks.registerUnwrapMock.mockRejectedValueOnce({ data: { detail: "Аккаунт уже существует" } });

    renderPage();

    await fillValidForm(user);
    await user.click(getSubmitButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Аккаунт уже существует");

    expect(mocks.registerCallMock).toHaveBeenCalledTimes(1);
    expect(mocks.loginCallMock).not.toHaveBeenCalled();
    expect(mocks.navigateMock).not.toHaveBeenCalled();
  });

  it("очищает serverError при изменении любого поля", async () => {
    const user = userEvent.setup();
    mocks.registerUnwrapMock.mockRejectedValueOnce({ data: { detail: "Ошибка сервера" } });

    renderPage();

    await fillValidForm(user);
    await user.click(getSubmitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("Ошибка сервера");

    await user.type(screen.getByLabelText("Логин"), "x");

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
