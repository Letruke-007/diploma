import { Link } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";
import { useMeQuery } from "../features/auth/authApi";
import {
  useDeleteUserMutation,
  useListUsersQuery,
  usePatchUserMutation,
} from "../features/users/usersApi";
import { fmtSize } from "../utils/format";
import { useEffect, useState } from "react";

export default function Admin() {
  const { data: me } = useMeQuery();

  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 300);

  const { data, isLoading, refetch } = useListUsersQuery(
    debouncedQ ? { q: debouncedQ } : undefined
  );

  const [patch] = usePatchUserMutation();

  if (!me?.is_admin) {
    return (
      <ProtectedRoute>
        <div className="panel" style={{ padding: 16 }}>Доступ запрещён</div>
      </ProtectedRoute>
    );
  }

  const items = (data as any)?.results ?? [];

  return (
    <ProtectedRoute>
      <div className="container admin-page">
        <h2>Администрирование</h2>

        <div
          className="panel admin-toolbar"
          style={{ marginTop: 12, marginBottom: 12, padding: "12px 12px" }}
        >
          <input
            type="text"
            placeholder="Поиск (логин, имя, email)…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="input admin-search"
          />
          <button className="btn" onClick={() => refetch()}>
            Обновить
          </button>
        </div>

        <div className="panel">
          {isLoading ? (
            <div style={{ padding: 12 }}>Загрузка…</div>
          ) : (
            <table className="table table-admin">
              <colgroup>
                <col className="col-id" />
                <col className="col-login" />
                <col className="col-name" />
                <col className="col-email" />
                <col className="col-admin" />
                <col className="col-active" />
                <col className="col-files" />
                <col className="col-size" />
                <col className="col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Логин</th>
                  <th>Имя</th>
                  <th>Email</th>
                  <th>Админ</th>
                  <th>Активен</th>
                  <th>Файлов</th>
                  <th>Размер</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {items.map((u: any) => (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td>{u.username}</td>
                    <td>{u.full_name}</td>
                    <td>{u.email}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!u.is_admin}
                        onChange={() =>
                          patch({ id: u.id, patch: { is_admin: !u.is_admin } })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!u.is_active}
                        onChange={() =>
                          patch({ id: u.id, patch: { is_active: !u.is_active } })
                        }
                      />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {u.files_count ?? 0}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {fmtSize(u.files_total_size ?? 0)}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <Link
                        className="btn"
                        to={{ pathname: "/files", search: `?user=${u.id}` }}
                      >
                        Открыть хранилище
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

function useDebouncedValue<T>(value: T, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
