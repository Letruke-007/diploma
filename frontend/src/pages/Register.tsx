import { useForm } from "react-hook-form";
import { useRegisterMutation } from "../features/auth/authApi";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

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
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>();
  const [serverError, setServerError] = useState<string | null>(null);

  const onSubmit = async (values: Form) => {
    try {
      setServerError(null);
      await registerUser(values).unwrap();
      navigate("/login", { replace: true });
    } catch (e: any) {
      setServerError(e?.data?.detail || "Не удалось создать аккаунт");
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-box">
        <h1 className="auth-title">Регистрация</h1>
        <p className="auth-subtitle">Создайте аккаунт, чтобы начать пользоваться</p>

        <form className="panel" onSubmit={handleSubmit(onSubmit)} noValidate>
          {serverError && (
            <div className="error" role="alert" style={{ marginBottom: 8 }}>
              {serverError}
            </div>
          )}

          <div className="field">
            <label htmlFor="username">Логин</label>
            <input
              id="username"
              type="text"
              placeholder="Латиница и цифры (4–20)"
              autoComplete="username"
              aria-invalid={!!errors.username || undefined}
              {...register("username", {
                required: "Укажите логин",
                pattern: {
                  value: USERNAME_RE,
                  message: "Допустимы буквы и цифры, начинается с буквы (4–20)",
                },
              })}
            />
            {errors.username && <div className="error">{errors.username.message}</div>}
          </div>

          <div className="field">
            <label htmlFor="full_name">Имя</label>
            <input
              id="full_name"
              type="text"
              placeholder="Как к вам обращаться"
              autoComplete="name"
              aria-invalid={!!errors.full_name || undefined}
              {...register("full_name", { required: "Укажите имя" })}
            />
            {errors.full_name && <div className="error">{errors.full_name.message}</div>}
          </div>

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              aria-invalid={!!errors.email || undefined}
              {...register("email", { required: "Укажите email" })}
            />
            {errors.email && <div className="error">{errors.email.message}</div>}
          </div>

          <div className="field">
            <label htmlFor="password">Пароль</label>
            <input
              id="password"
              type="password"
              placeholder="Минимум 6 символов, A-Z, цифра и символ"
              autoComplete="new-password"
              aria-invalid={!!errors.password || undefined}
              {...register("password", {
                required: "Придумайте пароль",
                pattern: {
                  value: PASSWORD_RE,
                  message: "≥6 символов, заглавная буква, цифра и спецсимвол",
                },
              })}
            />
            {errors.password && <div className="error">{errors.password.message}</div>}
          </div>

          <button className="btn w-full" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Создаём…" : "Создать аккаунт"}
          </button>
        </form>

        <div className="auth-help">
          Уже есть аккаунт? <a href="/login">Войдите</a>
        </div>
      </div>
    </div>
  );
}
