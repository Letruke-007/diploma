import { useForm } from "react-hook-form";
import { useLoginMutation, useMeQuery } from "../features/auth/authApi";
import { Navigate, useNavigate } from "react-router-dom";
import { useState } from "react";

type Form = { username: string; password: string };

export default function Login() {
  const { data: me } = useMeQuery();
  const [login] = useLoginMutation();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ mode: "onSubmit" });
  const [serverError, setServerError] = useState<string | null>(null);

  if (me) return <Navigate to="/files" replace />;

  const onSubmit = async (values: Form) => {
    try {
      setServerError(null);
      await login(values).unwrap();
      navigate("/files", { replace: true });
    } catch (e: any) {
      setServerError(e?.data?.detail || "Ошибка входа");
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-box">
        <h1 className="auth-title">Вход в аккаунт</h1>
        <p className="auth-subtitle">Добро пожаловать! Авторизуйтесь, чтобы продолжить</p>

        <form className="panel" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="field">
            <label htmlFor="username">Логин</label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              disabled={isSubmitting}
              aria-invalid={!!errors.username || undefined}
              {...register("username", {
                required: "Укажите логин",
                minLength: { value: 2, message: "Минимум 2 символа" },
              })}
            />
            {errors.username && <div className="error">{errors.username.message}</div>}
          </div>

          <div className="field">
            <label htmlFor="password">Пароль</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              disabled={isSubmitting}
              aria-invalid={!!errors.password || undefined}
              {...register("password", {
                required: "Укажите пароль",
                minLength: { value: 4, message: "Минимум 4 символа" },
              })}
            />
            {errors.password && <div className="error">{errors.password.message}</div>}
          </div>

          {serverError && (
            <div className="error" role="alert" style={{ marginTop: 8 }}>
              {serverError}
            </div>
          )}

          <button className="btn w-full" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Входим…" : "Войти"}
          </button>
        </form>

        <div className="auth-help">
          Нет аккаунта? <a href="/register">Зарегистрируйтесь</a>
        </div>
      </div>
    </div>
  );
}
