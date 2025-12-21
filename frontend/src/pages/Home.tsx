import { Link, Navigate } from "react-router-dom";
import { useMeQuery } from "../features/auth/authApi";

export default function Home() {
  const { data: me, isLoading } = useMeQuery();

  // Пока проверяем сессию — не мигаем
  if (isLoading) return null;

  // Если пользователь уже авторизован — сразу уводим в "Мой диск", кроме админа - его в Admin.tsx
  if (me) return <Navigate to={me.is_admin ? "/admin" : "/files"} replace />;

  return (
    <div className="home-page">
      <div className="panel home-card center max-w-480">
        <div className="home-logo" aria-hidden="true">
          {/* Логотип как на /login */}
          <svg
            width="180"
            height="52"
            viewBox="0 0 240 70"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient
                id="mcgrad-left"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
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

        <h2 className="home-title">Облачное хранилище файлов</h2>
        <p className="home-subtitle">
          Личное облако для файлов: загрузка, скачивание, переименование,
          комментарии и публичные ссылки для доступа извне.
        </p>

        <div className="home-actions">
          <Link to="/login" className="btn">
            Войти
          </Link>
          <Link to="/register" className="btn btn--secondary">
            Регистрация
          </Link>
        </div>
      </div>
    </div>
  );
}
