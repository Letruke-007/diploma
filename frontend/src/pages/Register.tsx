import { useForm } from "react-hook-form";
import { authApi, useRegisterMutation, useLoginMutation } from "../features/auth/authApi";
import { useNavigate, Link } from "react-router-dom";
import { useState } from "react";
import { useDispatch } from "react-redux";

type Form = {
  username: string;
  full_name: string;
  email: string;
  password: string;
};

const USERNAME_RE = /^[A-Za-z][A-Za-z0-9]{3,19}$/;
const PASSWORD_RE = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/;

export default function Register() {
  const [registerUser] = useRegisterMutation();
  const [login] = useLoginMutation();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ mode: "onSubmit" });

  const [serverError, setServerError] = useState<string | null>(null);

  const onSubmit = async (values: Form) => {
    try {
      setServerError(null);

      await registerUser(values).unwrap();
      await login({ username: values.username, password: values.password }).unwrap();

      dispatch(authApi.util.resetApiState());
      navigate("/files", { replace: true });
    } catch (e: any) {
      setServerError(
        e?.data?.detail || e?.data?.errors || "Не удалось создать аккаунт. Попробуйте ещё раз.",
      );
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

        <h1 className="auth-title">Регистрация</h1>
        <p className="auth-subtitle">Создайте аккаунт, чтобы пользоваться сервисом</p>

        <form className="auth-form" onSubmit={handleSubmit(onSubmit)} noValidate>
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
                pattern: { value: USERNAME_RE, message: "4–20 символов, латиница/цифры, начинается с буквы" },
                onChange: () => serverError && setServerError(null),
              })}
            />
            {errors.username && <div className="field-error">{errors.username.message}</div>}
          </div>

          <div className="field">
            <label htmlFor="full_name">Имя</label>
            <input
              id="full_name"
              type="text"
              disabled={isSubmitting}
              aria-invalid={!!errors.full_name || undefined}
              {...register("full_name", {
                required: "Укажите имя",
                minLength: { value: 2, message: "Минимум 2 символа" },
                onChange: () => serverError && setServerError(null),
              })}
            />
            {errors.full_name && <div className="field-error">{errors.full_name.message}</div>}
          </div>

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              disabled={isSubmitting}
              aria-invalid={!!errors.email || undefined}
              {...register("email", {
                required: "Укажите email",
                onChange: () => serverError && setServerError(null),
              })}
            />
            {errors.email && <div className="field-error">{errors.email.message}</div>}
          </div>

          <div className="field">
            <label htmlFor="password">Пароль</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              disabled={isSubmitting}
              aria-invalid={!!errors.password || undefined}
              {...register("password", {
                required: "Укажите пароль",
                pattern: {
                  value: PASSWORD_RE,
                  message: "Минимум 6 символов, 1 заглавная, 1 цифра и 1 спецсимвол",
                },
                onChange: () => serverError && setServerError(null),
              })}
            />
            {errors.password && <div className="field-error">{errors.password.message}</div>}
          </div>

          {serverError && <div className="error" role="alert">{serverError}</div>}

          <button className="btn btn--primary w-100" disabled={isSubmitting}>
            {isSubmitting ? "Создаём…" : "Создать аккаунт"}
          </button>

          <div className="auth-bottom">
            Уже есть аккаунт? <Link to="/login">Войти</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
