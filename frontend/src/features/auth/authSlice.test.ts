import { describe, it, expect } from "vitest";
import authReducer, { setUser, clearUser } from "./authSlice";

describe("authSlice reducer", () => {
  it("возвращает initialState при неизвестном action", () => {
    const nextState = authReducer(undefined, { type: "unknown" });
    expect(nextState).toEqual({});
  });

  it("setUser устанавливает пользователя в state", () => {
    const prevState = {};
    const user = { id: 1, email: "test@example.com" } as any;

    const nextState = authReducer(prevState as any, setUser(user));

    expect(nextState.user).toBe(user);
  });

  it("clearUser очищает пользователя из state", () => {
    const user = { id: 1, email: "test@example.com" } as any;
    const prevState = { user };

    const nextState = authReducer(prevState as any, clearUser());

    expect(nextState.user).toBeUndefined();
  });

  it("setUser(undefined) тоже очищает пользователя", () => {
    const user = { id: 1, email: "test@example.com" } as any;
    const prevState = { user };

    const nextState = authReducer(prevState as any, setUser(undefined));

    expect(nextState.user).toBeUndefined();
  });
});
