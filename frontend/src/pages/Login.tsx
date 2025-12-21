import { useForm } from "react-hook-form";
import { authApi, useLoginMutation, useMeQuery } from "../features/auth/authApi";
import { Navigate, useNavigate, Link } from "react-router-dom";
import { useState } from "react";
import { useDispatch } from "react-redux";

type Form = { username: string; password: string };

export default function Login() {
  const { data: me } = useMeQuery();
  const [login] = useLoginMutation();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ mode: "onSubmit" });

  const [serverError, setServerError] = useState<string | null>(null);

  if (me) return <Navigate to={me.is_admin ? "/admin" : "/files"} replace />;

  const onSubmit = async (values: Form) => {
    try {
      setServerError(null);
      const user = await login(values).unwrap();
      dispatch(authApi.util.resetApiState());
      navigate(user.is_admin ? "/admin" : "/files", { replace: true });

    } catch (e: any) {
      setServerError(e?.data?.detail || "Ошибка входа");
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-box panel center max-w-480">
        <div className="auth-logo" aria-hidden="true">
          <svg width="180" height="52" viewBox="0 0 240 70" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="mcgrad-left" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3A8DFF" />
                <stop offset="100%" stopColor="#005BFF" />
              </linearGradient>
            </defs>

            <path
              d="M80 35a20 20 0 0 0-38-6 17 17 0 0 0 2 34h34a17 17 0 0 0 2-34z"
              fill="url(#mcgrad-left)"
            />
            <text
              x="100"
              y="50"
              fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
              fontSize="30"
              fontWeight="700"
              fill="#111827"
              dominantBaseline="middle"
            >
              MyCloud
            </text>
          </svg>
        </div>

        <h1 className="auth-title">Вход в аккаунт</h1>
        <p className="auth-subtitle">Войдите в аккаунт, чтобы пользоваться облачным хранилищем</p>

        <form className="auth-form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="field">
            <label htmlFor="username">Логин</label>
            <input
              id="username"
              type="text"
              placeholder="Например: Alex123"
              autoComplete="username"
              disabled={isSubmitting}
              aria-invalid={!!errors.username || undefined}
              {...register("username", {
                required: "Укажите логин",
                minLength: { value: 2, message: "Минимум 2 символа" },
                onChange: () => serverError && setServerError(null),
              })}
            />
            {errors.username && <div className="field-error">{errors.username.message}</div>}
          </div>

          <div className="field">
            <label htmlFor="password">Пароль</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              disabled={isSubmitting}
              aria-invalid={!!errors.password || undefined}
              {...register("password", {
                required: "Укажите пароль",
                minLength: { value: 4, message: "Минимум 4 символа" },
                onChange: () => serverError && setServerError(null),
              })}
            />
            {errors.password && <div className="field-error">{errors.password.message}</div>}
          </div>

          {serverError && <div className="error" role="alert">{serverError}</div>}

          <button className="btn btn--primary w-100" disabled={isSubmitting}>
            {isSubmitting ? "Входим…" : "Войти"}
          </button>

          <div className="auth-bottom">
            Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
