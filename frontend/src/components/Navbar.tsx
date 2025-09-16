import { Link, useNavigate } from "react-router-dom";
import { useMeQuery, useLogoutMutation } from "../features/auth/authApi";

export default function Navbar() {
  const { data: me, refetch } = useMeQuery();
  const [logout] = useLogoutMutation();
  const navigate = useNavigate();

  async function onLogout() {
    try {
      await logout().unwrap();
      await refetch();
      navigate("/");
    } catch {
      // мягкая деградация: просто уводим на /login
      navigate("/login", { replace: true });
    }
  }

  return (
    <header className="header">
      <div className="header__inner">
        <Link to="/" className="brand">
          <span className="brand__dot" />
          My Cloud
        </Link>

        <nav style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {!me ? (
            <>
              <Link to="/login" className="btn btn--secondary">Вход</Link>
              <Link to="/register" className="btn">Регистрация</Link>
            </>
          ) : (
            <>
              <Link to="/files">Файлы</Link>
              {me.is_admin && <Link to="/admin">Админ</Link>}
              <button className="btn" onClick={onLogout}>Выход</button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
