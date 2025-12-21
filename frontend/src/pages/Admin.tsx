import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";

import { authApi, useMeQuery, useLogoutMutation } from "../features/auth/authApi";
import { useDispatch } from "react-redux";

import {
  useDeleteUserMutation,
  usePurgeUserMutation,
  useListUsersQuery,
  usePatchUserMutation,
  type User,
} from "../features/users/usersApi";

import { fmtSize } from "../utils/format";

import {
  EllipsisVerticalIcon,
  FolderArrowDownIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

const PAGE_SIZE = 10;

// ---- small UI blocks (like in Files.tsx) ----
type SelectionActionButtonProps = {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "danger";
};

const SelectionActionButton: React.FC<SelectionActionButtonProps> = ({
  icon: Icon,
  title,
  onClick,
  disabled,
  variant = "default",
}) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    disabled={disabled}
    className={
      "icon-circle-btn icon-circle-btn--selection" +
      (variant === "danger" ? " icon-circle-btn--danger" : "")
    }
  >
    <Icon className="selection-icon-svg" aria-hidden="true" />
    <span className="sr-only">{title}</span>
  </button>
);

export default function Admin() {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { data: me, isLoading: isMeLoading } = useMeQuery();
  const [logout] = useLogoutMutation();

  const [page, setPage] = useState(1);

  const { data, isFetching, isLoading, error, refetch } = useListUsersQuery({
    page,
    pageSize: PAGE_SIZE,
  });

  const [patchUser, { isLoading: isPatching }] = usePatchUserMutation();
  const [deleteUser, { isLoading: isDeleting }] = useDeleteUserMutation();
  const [purgeUser, { isLoading: isPurging }] = usePurgeUserMutation();

  const users: User[] = data?.results ?? [];
  const totalCount = data?.count ?? users.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  // ---- selection like Files (no checkboxes) ----
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  useEffect(() => {
    setSelectedIds([]);
  }, [page]);

  const handleRowClick = (id: number, isCtrlOrMeta: boolean) => {
    setSelectedIds((prev) => {
      if (isCtrlOrMeta) {
        if (prev.includes(id)) return prev.filter((x) => x !== id);
        return [...prev, id];
      }
      return [id];
    });
  };

  const clearSelection = () => setSelectedIds([]);

  const selectedCount = selectedIds.length;
  const selectedUsers = useMemo(
    () => users.filter((u) => selectedIds.includes(u.id)),
    [users, selectedIds],
  );

  const busy = isDeleting || isPurging || isPatching || isFetching;

  const openSelectedStorage = () => {
    if (selectedIds.length !== 1) return;
    const u = users.find((x) => x.id === selectedIds[0]);
    navigate(
      `/files?user=${selectedIds[0]}${u?.username ? `&login=${encodeURIComponent(u.username)}` : ""}`,
    );
  };

  const deactivateSelectedUsers = async () => {
    if (selectedIds.length === 0) return;

    const ok = confirm(
      `Деактивировать выбранных пользователей (${selectedIds.length} шт.)? Их можно будет удалить навсегда отдельно.`,
    );
    if (!ok) return;

    try {
      for (const id of selectedIds) {
        await deleteUser(id).unwrap();
      }
      clearSelection();
      await refetch();
    } catch {
    }
  };

  const purgeSelectedUsers = async () => {
    if (selectedIds.length === 0) return;

    const picked = users.filter((u) => selectedIds.includes(u.id));
    if (picked.some((u) => u.is_active)) {
      alert("Удаление навсегда доступно только для деактивированных пользователей.");
      return;
    }

    const ok = confirm(
      `Удалить НАВСЕГДА выбранных пользователей (${selectedIds.length} шт.)?\n\nЭто необратимо: будут удалены их файлы и записи.`,
    );
    if (!ok) return;

    try {
      for (const id of selectedIds) {
        await purgeUser(id).unwrap();
      }
      clearSelection();
      await refetch();
    } catch {
      alert("Не удалось удалить пользователей навсегда.");
    }
  };

  const setAdminFlag = async (user: User, isAdmin: boolean) => {
    try {
      await patchUser({ id: user.id, patch: { is_admin: isAdmin } }).unwrap();
      await refetch();
    } catch {
      alert("Не удалось обновить пользователя.");
    }
  };

  // ---- Sidebar:  ----
  const Sidebar = () => {
    const iconDrive = (
      <svg viewBox="0 0 24 24" className="sidebar-nav-icon" aria-hidden="true">
        <path
          d="M4 6a2 2 0 0 1 2-2h4.2a2 2 0 0 1 1.4.58L13.6 6H18a2 2 0 0 1 2 2v1H4V6Z"
          fill="currentColor"
          opacity="0.9"
        />
        <rect x="4" y="9" width="16" height="9" rx="1.5" fill="currentColor" opacity="0.75" />
      </svg>
    );

    return (
      <aside className="files-sidebar">
        <div className="sidebar-main">
          <div className="sidebar-logo">
            <svg width="240" height="70" viewBox="0 0 240 70" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="mcgrad-admin" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#3A8DFF" />
                  <stop offset="100%" stopColor="#005BFF" />
                </linearGradient>
              </defs>
              <path
                d="M80 35a20 20 0 0 0-38-6 17 17 0 0 0 2 34h34a17 17 0 0 0 2-34z"
                fill="url(#mcgrad-admin)"
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

          <nav className="sidebar-nav" aria-label="Навигация админа">
            <button
              type="button"
              className="sidebar-nav-item sidebar-nav-item--active"
              onClick={() => navigate("/files")}
            >
              <span className="sidebar-nav-icon-wrapper">{iconDrive}</span>
              <span className="sidebar-nav-label">Мой диск (Админ)</span>
            </button>
          </nav>
        </div>
      </aside>
    );
  };

  const Topbar = () => (
    <div className="files-topbar">
      <div className="files-topbar-left">
        <span className="files-topbar-tab files-topbar-tab--active">Администрирование</span>
      </div>
      <div className="files-topbar-right">
        <button
          type="button"
          className="files-topbar-logout-btn"
          onClick={async () => {
            try {
              await logout().unwrap();
            } catch (e: any) {
              if (e?.status !== 401) throw e;
            } finally {
              dispatch(authApi.util.resetApiState());
              navigate("/login", { replace: true });
            }
          }}
        >
          Выход
        </button>
      </div>
    </div>
  );

  // Header block
  const Header = () => (
    <div className="files-header">
      <div className="files-header-left">
        <h1 className="files-title">Пользователи</h1>
        <div className="files-subtitle">Всего пользователей: {totalCount}</div>
      </div>
    </div>
  );

  if (!me) return <Navigate to="/login" replace />;

  return (
    <div className="files-page container admin-page">
      <div className="files-layout">
        <Sidebar />

        <section
          className="files-main"
          onClick={() => {
            if (selectedIds.length > 0) {
              clearSelection();
            }
          }}
        >

          <Topbar />
          <Header />

          {/* Selection bar */}
          <div
            className={
              "files-selection-bar " +
              (selectedCount > 0 ? "files-selection-bar--selected" : "files-selection-bar--idle")
            }
          >
            {selectedCount > 0 ? (
              <>
                <div className="files-selection-count">Выбрано пользователей: {selectedCount}</div>

                <div className="files-selection-actions files-selection-actions--icons">
                  <SelectionActionButton
                    icon={FolderArrowDownIcon}
                    title={
                      selectedCount === 1
                        ? "Открыть хранилище пользователя"
                        : "Открыть хранилище (доступно при выборе 1 пользователя)"
                    }
                    onClick={openSelectedStorage}
                    disabled={busy || selectedCount !== 1}
                  />

                  <SelectionActionButton
                    icon={TrashIcon}
                    title="Деактивировать (или удалить навсегда, если уже деактивирован)"
                    onClick={() => {
                      const picked = users.filter((u) => selectedIds.includes(u.id));
                      const allDeactivated = picked.length > 0 && picked.every((u) => !u.is_active);
                      if (allDeactivated) {
                        void purgeSelectedUsers();
                      } else {
                        void deactivateSelectedUsers();
                      }
                    }}
                    disabled={busy}
                    variant="danger"
                  />
                </div>
              </>
            ) : (
              <div style={{ padding: "8px 0" }} />
            )}
          </div>

          <div
            className="panel files-list-panel"
            onClick={(e) => e.stopPropagation()}
          >

            {isLoading ? (
              <div style={{ padding: 12 }}>Загрузка…</div>
            ) : error ? (
              <div className="error" style={{ padding: 12 }}>
                Ошибка загрузки списка пользователей
              </div>
            ) : users.length === 0 ? (
              <div style={{ padding: 12 }}>Пользователей нет</div>
            ) : (
              <div className="table-wrap">
                <table className="table table-files table-users">
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
                      <th style={{ textAlign: "right" }}>Файлов</th>
                      <th style={{ textAlign: "right" }}>Размер</th>
                      <th>Действия</th>
                    </tr>
                  </thead>

                  <tbody>
                    {users.map((u) => (
                      <UserRow
                        key={u.id}
                        meId={me.id}
                        user={u}
                        selected={selectedIds.includes(u.id)}
                        busy={busy || isFetching}
                        onRowClick={handleRowClick}
                        onToggleAdmin={(isAdmin) => void setAdminFlag(u, isAdmin)}
                        onOpenStorage={() => navigate(`/files?user=${u.id}${u.username ? `&login=${encodeURIComponent(u.username)}` : ""}`)}
                        onDeactivate={async () => {
                          const ok = confirm(
                            `Деактивировать пользователя "${u.username}" (ID ${u.id})? Пользователь не сможет входить. Позже его можно удалить навсегда.`,
                          );
                          if (!ok) return;

                          try {
                            await deleteUser(u.id).unwrap(); // деактивация
                            setSelectedIds((prev) => prev.filter((x) => x !== u.id));
                            await refetch();
                          } catch {
                            // как у вас
                          }
                        }}
                        onPurge={async () => {
                          const ok = confirm(
                            `Удалить пользователя "${u.username}" (ID ${u.id}) НАВСЕГДА?\n\nЭто необратимо: будут удалены его файлы и записи.`,
                          );
                          if (!ok) return;

                          try {
                            await purgeUser(u.id).unwrap(); // удаление навсегда
                            setSelectedIds((prev) => prev.filter((x) => x !== u.id));
                            await refetch();
                          } catch {
                            // как у вас
                          }
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            <div className="pagination">
              <button
                className="pagination-btn"
                type="button"
                disabled={!canPrev || isFetching}
                onClick={() => canPrev && setPage((p) => p - 1)}
                title="Предыдущая страница"
              >
                ‹
              </button>

              <span className="pagination-info">
                Страница {page} из {totalPages} {totalCount ? `(всего пользователей: ${totalCount})` : null}
              </span>

              <button
                className="pagination-btn"
                type="button"
                disabled={!canNext || isFetching}
                onClick={() => canNext && setPage((p) => p + 1)}
                title="Следующая страница"
              >
                ›
              </button>

              {selectedCount > 0 && (
                <button className="pagination-btn" type="button" onClick={clearSelection} title="Снять выделение">
                  ×
                </button>
              )}
            </div>
          </div>

          {selectedUsers.length > 0 ? (
            <div style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>
              Выбрано: {selectedUsers.map((x) => x.username).join(", ")}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

// ---- Row with kebab menu ----
function UserRow(props: {
  meId: number;
  user: User;
  selected: boolean;
  busy: boolean;
  onRowClick: (id: number, isCtrlOrMeta: boolean) => void;
  onToggleAdmin: (isAdmin: boolean) => void;
  onOpenStorage: () => void;
  onDeactivate: () => Promise<void> | void;
  onPurge: () => Promise<void> | void;

}) {
  const {
  meId,
  user,
  selected,
  busy,
  onRowClick,
  onToggleAdmin,
  onOpenStorage,
  onDeactivate,
  onPurge,
} = props;

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const handler = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) {
      setMenuPos(null);
      return;
    }

    const compute = () => {
      const btn = triggerRef.current;
      const menu = menuRef.current;
      if (!btn || !menu) return;

      const r = btn.getBoundingClientRect();

      const mw = menu.offsetWidth || 220;
      const mh = menu.offsetHeight || 160;

      const GAP = 6;
      const PAD = 8;

      const fitsDown = r.bottom + GAP + mh <= window.innerHeight - PAD;
      const top = fitsDown ? r.bottom + GAP : r.top - GAP - mh;

      let left = r.right - mw;
      left = Math.max(PAD, Math.min(left, window.innerWidth - PAD - mw));

      setMenuPos({ top: Math.max(PAD, top), left });
    };

    const raf = requestAnimationFrame(compute);
    window.addEventListener("resize", compute);

    const onScroll = () => setMenuOpen(false);
    window.addEventListener("scroll", onScroll, true);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [menuOpen]);

  return (
    <tr
      className={selected ? "row-selected" : undefined}
      onClick={(e) => onRowClick(user.id, e.ctrlKey || e.metaKey)}
    >
      <td className="cell-id">{user.id}</td>
      <td className="cell-clip" title={user.username}>
        {user.username}
      </td>
      <td className="cell-clip" title={user.full_name || ""}>
        {user.full_name || "—"}
      </td>
      <td className="cell-clip" title={user.email || ""}>
        {user.email || "—"}
      </td>

      <td className="cell-center" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={user.is_admin}
          disabled={busy || user.id === meId}
          onChange={() => onToggleAdmin(!user.is_admin)}
          title={
            user.id === meId
              ? "Нельзя снять права администратора с самого себя"
              : "Переключить флаг администратора"
          }
        />
      </td>

      <td className="cell-center">
        <input type="checkbox" checked={user.is_active} disabled />
      </td>

      <td className="cell-num">{user.files_count ?? 0}</td>
      <td className="cell-num">{fmtSize(user.files_total_size ?? 0)}</td>

      <td className="col-actions" onClick={(e) => e.stopPropagation()}>
        {menuOpen && (
          <div
            className="mc-popover-overlay"
            onMouseDown={() => setMenuOpen(false)}
            aria-hidden="true"
          />
        )}

        <div className="actions-menu-wrapper">
          <button
            ref={triggerRef}
            className="icon-button actions-menu-trigger"
            type="button"
            aria-label="Действия"
            disabled={busy}
            onClick={() => setMenuOpen((x) => !x)}
          >
            <EllipsisVerticalIcon className="actions-menu-trigger-icon" />
          </button>

          {menuOpen && (
            <div
              ref={menuRef}
              className="actions-menu actions-menu--fixed"
              style={menuPos ? { top: menuPos.top, left: menuPos.left } : { top: -9999, left: -9999 }}
              onMouseDown={(e) => e.stopPropagation()}
              role="menu"
            >
              <button
                className="actions-menu-item"
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenStorage();
                }}
                disabled={busy}
                role="menuitem"
              >
                <FolderArrowDownIcon className="actions-menu-item-icon" />
                Открыть хранилище
              </button>

              {user.is_active ? (
                <button
                  className="actions-menu-item actions-menu-item--danger"
                  type="button"
                  onClick={async () => {
                    setMenuOpen(false);
                    await onDeactivate();
                  }}
                  disabled={busy}
                  role="menuitem"
                >
                  <TrashIcon className="actions-menu-item-icon" />
                  Деактивировать пользователя
                </button>
              ) : (
                <button
                  className="actions-menu-item actions-menu-item--danger"
                  type="button"
                  onClick={async () => {
                    setMenuOpen(false);
                    await onPurge();
                  }}
                  disabled={busy}
                  role="menuitem"
                >
                  <TrashIcon className="actions-menu-item-icon" />
                  Удалить навсегда
                </button>
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}
