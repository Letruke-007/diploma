import type React from "react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";

import { useLocation, useNavigate } from "react-router-dom";
import { useMeQuery, useLogoutMutation } from "../features/auth/authApi";

import {
  useListFilesQuery,
  useUploadFileMutation,
  useDeleteFileMutation,
  useRestoreFileMutation,
  useCreateFolderMutation,
  useIssuePublicMutation,
  useBulkMoveMutation,
  useStorageUsageQuery,
  type StoredFile,
  type FilesView,
} from "../features/files/filesApi";

import { filesApi } from "../features/files/filesApi";

import FileRow from "../components/FileRow";
import { fmtSize } from "../utils/format";

import FileTypeIcon, { type FileKind } from "../components/icons/filetypes/FileTypeIcon";

import {
  ArrowDownTrayIcon,
  FolderArrowDownIcon,
  TrashIcon,
  LinkIcon,
  XMarkIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  FolderPlusIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";

const PAGE_SIZE = 10;

// ------------------------------
// Helpers (stable, outside component)
// ------------------------------

// Хук извлечения query params
function useQuery() {
  return new URLSearchParams(useLocation().search);
}

// Простое склонение «объект»
function formatSelectionLabel(count: number): string {
  if (count === 1) return "Выбран 1 объект";
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `Выбрано ${count} объектов`;
  if (last === 1) return `Выбран ${count} объект`;
  if (last >= 2 && last <= 4) return `Выбрано ${count} объекта`;
  return `Выбрано ${count} объектов`;
}

// Создание / получение публичной ссылки для файла.
async function ensurePublicLink(
  file: StoredFile,
  issuePublicFn: (id: number) => Promise<{ token?: string }>,
): Promise<string> {
  let token: string | null | undefined =
    (file as any).public_token ?? (file as any).token ?? null;

  if (!token) {
    const data = await issuePublicFn(file.id);
    token = data.token;
    if (!token) throw new Error("no-token-in-response");
  }

  // Правильный публичный маршрут: /d/<token>/
  return `${window.location.origin}/d/${token}`;
}

function getTypeKey(name: string) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (["doc", "docx", "rtf"].includes(ext)) return "doc";
  if (["xls", "xlsx", "csv"].includes(ext)) return "sheet";
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext)) return "image";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "archive";
  return "other";
}

// -----------------------------------------
// Small UI building blocks (local components)
// -----------------------------------------

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

type TypeFilter = "all" | "doc" | "sheet" | "pdf" | "image" | "archive" | "other";

function typeFilterLabel(v: TypeFilter) {
  switch (v) {
    case "all":
      return "Все типы";
    case "doc":
      return "Документы";
    case "sheet":
      return "Таблицы";
    case "pdf":
      return "PDF";
    case "image":
      return "Изображения";
    case "archive":
      return "Архивы";
    case "other":
      return "Прочее";
  }
}

// ------------------------------
// Main component
// ------------------------------

export default function Files() {
  const location = useLocation();
  const buildFilesUrl = (folderId: number | null) => {
    const params = new URLSearchParams(location.search);

    if (folderId === null) {
      params.delete("folder");
    } else {
      params.set("folder", String(folderId));
    }

    const qs = params.toString();
    return qs ? `/files?${qs}` : "/files";
  };

  const navigate = useNavigate();
  const query = useQuery();
  const dispatch = useDispatch();

  const folderParam = query.get("folder");
  const currentFolderId = folderParam && /^\d+$/.test(folderParam) ? Number(folderParam) : null;

  type BreadcrumbItem = { id: number | null; name: string };
  const BREADCRUMB_KEY = "mycloud_breadcrumb_my";

  const pathname = location.pathname;
  const currentView: FilesView =
    pathname.startsWith("/recent")
      ? "recent"
      : pathname.startsWith("/trash")
      ? "trash"
      : "my";

  const { data: me } = useMeQuery();
  const [logout] = useLogoutMutation();

  const targetUserParam = query.get("user");
  const targetUserId = targetUserParam ? Number(targetUserParam) : undefined;
  const targetUserLogin = query.get("login");

  const adminContext = Number.isFinite(targetUserId);

  const adminQuery = useMemo(() => {
    if (!adminContext || !targetUserId) return "";
    const params = new URLSearchParams();
    params.set("user", String(targetUserId));
    if (targetUserLogin) params.set("login", targetUserLogin);
    return `?${params.toString()}`;
  }, [adminContext, targetUserId, targetUserLogin]);

  const viewingForeign =
    typeof targetUserId === "number" && targetUserId && me && me.id !== targetUserId;

  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // ===== state для модалки перемещения =====
  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const [moveParent, setMoveParent] = useState<number | null>(null);
  const [moveBrowseParent, setMoveBrowseParent] = useState<number | null>(null);
  const [moveStack, setMoveStack] = useState<Array<{ id: number | null; title: string }>>([
    { id: null, title: "Мой диск" },
  ]);
  const [moveSearch, setMoveSearch] = useState("");
  const moveBtnRef = useRef<HTMLSpanElement | null>(null);
  const [movePopoverPos, setMovePopoverPos] = useState<{ top: number; left: number } | null>(null);

  // ===== основной список (не зависит от модалки) =====
  const mainListArgs = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      view: currentView,
      parent: currentView === "my" ? (currentFolderId ?? undefined) : undefined,
      user: adminContext ? targetUserId : undefined,
    }),
    [page, currentView, currentFolderId, adminContext, targetUserId],
  );

  // ===== список для модалки перемещения (только когда модалка открыта) =====
  const moveListArgs = useMemo(
    () => ({
      page: 1,
      pageSize: PAGE_SIZE,
      view: "my" as const,
      parent: moveBrowseParent ?? undefined,
      user: adminContext ? targetUserId : undefined,
    }),
    [moveBrowseParent, adminContext, targetUserId],
  );

  const { data: usage } = useStorageUsageQuery();

 // ===== список файлов (основной) =====
  const {
    data,
    error,
    isLoading,
    isFetching,
    refetch: refetchFiles,
  } = useListFilesQuery(mainListArgs, {
    refetchOnMountOrArgChange: true,
  });

  // ===== список для модалки перемещения =====
  const {
    data: moveDataRaw,
    isFetching: isMoveFetching,
    refetch: refetchMoveFolders,
  } = useListFilesQuery(moveListArgs, {
    skip: !isMoveOpen,
    refetchOnMountOrArgChange: true,
  });

  // данные для модалки перемещения
  const moveData = moveDataRaw ?? { results: [] as StoredFile[] };

  const [uploadFile, { isLoading: isUploading }] = useUploadFileMutation();
  const [deleteFile] = useDeleteFileMutation();
  const [restoreFile] = useRestoreFileMutation();
  const [issuePublic] = useIssuePublicMutation();
  const [bulkMove] = useBulkMoveMutation();

  const [filesToUpload, setFilesToUpload] = useState<File[]>([]);
  const [uploadComment, setUploadComment] = useState("");
  const [uploadIndex, setUploadIndex] = useState(0);

  const [isPreparingArchive, setIsPreparingArchive] = useState(false);
  const [isBulkBusy, setIsBulkBusy] = useState(false);
  const [isCopyingLinks, setIsCopyingLinks] = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  }, []);

  // состояние выпадающего меню "+ Создать" в сайдбаре
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const [createFolder, { isLoading: isCreatingFolder }] = useCreateFolderMutation();
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [folderNameDraft, setFolderNameDraft] = useState("Новая папка");
  const [folderNameError, setFolderNameError] = useState<string | null>(null);
  const createMenuRef = useRef<HTMLDivElement | null>(null);
  const createFolderRef = useRef<HTMLDivElement | null>(null);

  // фильтрация по типу файла
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const typeMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!typeMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (typeMenuRef.current && !typeMenuRef.current.contains(t)) {
        setTypeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [typeMenuOpen]);

  const files: StoredFile[] = data?.results ?? [];

  const baseBreadcrumb: BreadcrumbItem[] = useMemo(() => [{ id: null, name: "Мой диск" }], []);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>(baseBreadcrumb);

  const persistBreadcrumb = useCallback((items: BreadcrumbItem[]) => {
    try {
      sessionStorage.setItem(BREADCRUMB_KEY, JSON.stringify(items));
    } catch {
      // ignore
    }
  }, []);

  const readPersistedBreadcrumb = useCallback((): BreadcrumbItem[] | null => {
    try {
      const raw = sessionStorage.getItem(BREADCRUMB_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as BreadcrumbItem[];
      if (!Array.isArray(parsed) || parsed.length === 0) return null;
      return parsed;
    } catch {
      return null;
    }
  }, []);

  // Инициализация/синхронизация breadcrumb при смене folder/view
  useEffect(() => {
    if (currentView !== "my") return;

    // 1) Если пришли state breadcrumbs — это источник истины
    const stateTrail = (location.state as any)?.breadcrumb as BreadcrumbItem[] | undefined;
    if (stateTrail && Array.isArray(stateTrail) && stateTrail.length) {
      setBreadcrumb(stateTrail);
      persistBreadcrumb(stateTrail);
      return;
    }

    // 2) Если мы в корне — всегда сбрасываем
    if (currentFolderId === null) {
      setBreadcrumb(baseBreadcrumb);
      persistBreadcrumb(baseBreadcrumb);
      return;
    }

    // 3) Иначе пытаемся восстановить из sessionStorage
    const persisted = readPersistedBreadcrumb();
    if (persisted) {
      setBreadcrumb(persisted);
      return;
    }

    // fallback: неизвестное имя папки, но id показываем
    const fallback = [...baseBreadcrumb, { id: currentFolderId, name: `Папка ${currentFolderId}` }];
    setBreadcrumb(fallback);
    persistBreadcrumb(fallback);
  }, [
    currentView,
    currentFolderId,
    location.state,
    baseBreadcrumb,
    persistBreadcrumb,
    readPersistedBreadcrumb,
  ]);

  const visibleFiles = useMemo(() => {
    if (typeFilter === "all") return files;
    return files.filter((f) => (f.is_folder ? true : getTypeKey(f.original_name) === typeFilter));
  }, [files, typeFilter]);

  type SortKey =
    | "name"
    | "size"
    | "uploaded_at"
    | "last_downloaded_at"
    | "deleted_at"
    | "origin";

  type SortDir = "asc" | "desc";

  const [sortKey, setSortKey] = useState<SortKey>(
    currentView === "recent" ? "uploaded_at" : "name",
  );
  const [sortDir, setSortDir] = useState<SortDir>(
    currentView === "recent" ? "desc" : "asc",
  );

  const toggleSort = useCallback((key: SortKey) => {
    setSortKey((prevKey) => {
      if (prevKey !== key) {
        setSortDir("asc");
        return key;
      }
      setSortDir((prevDir: SortDir) => (prevDir === "asc" ? "desc" : "asc"));
      return prevKey;
    });
  }, []);

  const sortedFiles = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const isTrash = currentView === "trash";
    const arr = [...visibleFiles];

    const getTime = (iso?: string | null) => (iso ? new Date(iso).getTime() : 0);

    arr.sort((a, b) => {
      if (!isTrash) {
        const af = a.is_folder ? 0 : 1;
        const bf = b.is_folder ? 0 : 1;
        if (af !== bf) return af - bf; // 0 (folder) раньше 1 (file)
      }

      switch (sortKey) {
        case "name":
          return dir * a.original_name.localeCompare(b.original_name, "ru");
        case "size":
          return dir * ((a.size || 0) - (b.size || 0));
        case "uploaded_at":
          return dir * (getTime(a.uploaded_at) - getTime(b.uploaded_at));
        case "last_downloaded_at":
          return dir * (getTime(a.last_downloaded_at) - getTime(b.last_downloaded_at));
        case "deleted_at":
          // актуально только для корзины; вне корзины не влияет
          return dir * (getTime((a as any).deleted_at) - getTime((b as any).deleted_at));
        case "origin": {
          const ap = (a.deleted_from_path ? `Мой диск/${a.deleted_from_path}` : "Мой диск").toLowerCase();
          const bp = (b.deleted_from_path ? `Мой диск/${b.deleted_from_path}` : "Мой диск").toLowerCase();
          return dir * ap.localeCompare(bp, "ru");
        }
      }
    });

    // защитно: если не корзина — не даём сортировать по deleted_at/origin
    if (!isTrash && (sortKey === "deleted_at" || sortKey === "origin")) return [...visibleFiles];
    return arr;
  }, [visibleFiles, sortKey, sortDir, currentView]);

  const totalCount = data?.count ?? files.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const selectedFiles: StoredFile[] = useMemo(
    () => files.filter((f) => selectedIds.includes(f.id)),
    [files, selectedIds],
  );

  // ===== папки для модалки перемещения (нельзя выбрать папку, которую переносим) =====
  const selectedFolderIds = new Set(selectedFiles.filter((x) => x.is_folder).map((x) => x.id));

  const moveFolders = (moveData?.results ?? [])
    .filter((f) => f.is_folder && !f.is_deleted)
    .filter((f) => !selectedFolderIds.has(f.id)); // запрет "в саму себя"

  const moveFoldersFiltered = moveSearch.trim()
    ? moveFolders.filter((f) =>
        f.original_name.toLowerCase().includes(moveSearch.trim().toLowerCase()),
      )
    : moveFolders;

  const usedBytes = usage?.used_bytes ?? 0;
  const quotaBytes = usage?.quota_bytes ?? 0;
  const usedPercent = Math.min(100, quotaBytes > 0 ? Math.round((usedBytes / quotaBytes) * 100) : 0);

  const onSubmitUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!filesToUpload.length) return;

    setUploadIndex(0);

    try {
      for (let i = 0; i < filesToUpload.length; i++) {
        const f = filesToUpload[i];

        await uploadFile({
          file: f,
          comment: uploadComment,
          parent: currentView === "my" ? currentFolderId : null,
          userId: adminContext ? targetUserId : undefined,
        }).unwrap();

        setUploadIndex((prev) => prev + 1);
      }

      setFilesToUpload([]);
      setUploadComment("");
      setUploadIndex(0);

      const input = document.getElementById("fileInput") as HTMLInputElement | null;
      if (input) input.value = "";

      await refetchFiles();
    } catch {
      notify("Не удалось загрузить файл(ы). Проверьте соединение и попробуйте ещё раз.");
    }
  };

  const handleLogout = async () => {
    try {
      await logout().unwrap();
    } catch (e: any) {
      if (e?.status !== 401) throw e;
    } finally {
      dispatch(filesApi.util.resetApiState());
      navigate("/login", { replace: true });
    }
  };

  const handleFileUpdated = () => {
    refetchFiles();
  };

  const handleFileDeleted = (id: number) => {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
    refetchFiles();
  };

  const titleMap: Record<FilesView, string> = {
    my: "Мой диск",
    recent: "Недавние",
    trash: "Корзина",
  };

  const subtitleMap: Record<FilesView, string> = {
    my: totalCount > 0 ? `${totalCount} файл(ов), занято ${fmtSize(usedBytes)} из 5 ГБ` : "",
    recent: "Последние загруженные файлы",
    trash: "Файлы в корзине хранятся 30 дней, после чего удаляются навсегда.",
  };

  const pageTitle = titleMap[currentView];
  const pageSubtitle = subtitleMap[currentView];

  const iconDrive = (
    <svg viewBox="0 0 24 24" className="sidebar-nav-icon">
      <path
        d="M4 6a2 2 0 0 1 2-2h4.2a2 2 0 0 1 1.4.58L13.6 6H18a2 2 0 0 1 2 2v1H4V6Z"
        fill="currentColor"
        opacity="0.9"
      />
      <rect x="4" y="9" width="16" height="9" rx="1.5" fill="currentColor" opacity="0.75" />
    </svg>
  );

  const iconRecent = (
    <svg viewBox="0 0 24 24" className="sidebar-nav-icon">
      <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 9v3.2l2.1 2.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const iconTrash = (
    <svg viewBox="0 0 24 24" className="sidebar-nav-icon">
      <path
        d="M9 4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1h3a1 1 0 1 1 0 2h-1v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7H5a1 1 0 1 1 0-2h3V4Z"
        fill="currentColor"
      />
      <path
        d="M10 9v7M14 9v7"
        fill="none"
        stroke="#f9fafb"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );

  const handleRowClick = (id: number, isCtrlOrMeta: boolean) => {
    setSelectedIds((prev) => {
      if (isCtrlOrMeta) {
        if (prev.includes(id)) return prev.filter((x) => x !== id);
        return [...prev, id];
      }
      return [id];
    });
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
  };

  useEffect(() => {
    setSelectedIds([]);
  }, [currentView, page]);

  useEffect(() => {
    if (currentView === "recent") {
      setSortKey("uploaded_at");
      setSortDir("desc");
      return;
    }
    setSortKey("name");
    setSortDir("asc");
  }, [currentView]);

  const handleMainAreaClick = (e: React.MouseEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return;
    if (selectedIds.length) setSelectedIds([]);
  };

  // закрытие меню "+ Создать" при клике вне него
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const t = event.target as Node;

      if (createMenuRef.current && !createMenuRef.current.contains(t)) {
        setIsCreateMenuOpen(false);
      }

      if (createFolderRef.current && !createFolderRef.current.contains(t)) {
        setIsCreateFolderOpen(false);
        setFolderNameError(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isMoveOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMoveOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMoveOpen]);

  useEffect(() => {
    setPage(1);
  }, [currentFolderId]);

  const handleConfirmMove = async () => {
    setIsBulkBusy(true);

    const sourceParent: number | null = currentFolderId;

    const targetParent: number | null = moveParent;

    const keyOf = (p: number | null) => (typeof p === "number" ? String(p) : "root");

    try {
      await bulkMove({
        ids: selectedIds,
        parent: targetParent,
      }).unwrap();

      setSelectedIds([]);

      setIsMoveOpen(false);
      setMoveBrowseParent(null);

      dispatch(
        filesApi.util.invalidateTags([
          { type: "Files", id: "LIST" },
          { type: "Files", id: `LIST:${keyOf(sourceParent)}` },
          { type: "Files", id: `LIST:${keyOf(targetParent)}` },
          { type: "Files", id: "LIST:root" },
        ]),
      );
      await refetchFiles();
    } catch (e: any) {
      notify(e?.data?.detail || "Не удалось переместить выбранные объекты");
    } finally {
      setIsBulkBusy(false);
    }
  };

  // ---- helpers для "+ Создать" ----

  const triggerFileInputClick = () => {
    const input = document.getElementById("fileInput") as HTMLInputElement | null;
    if (input) {
      input.click();
    }
  };

  const validateFolderName = (raw: string) => {
    const name = raw.trim();
    if (!name) return "Введите имя папки";
    // минимальный набор запрещённых символов (Windows-подобно)
    if (/[\\/:*?"<>|]/.test(name)) return 'Недопустимые символы: \\ / : * ? " < > |';
    if (name.length > 120) return "Слишком длинное имя (макс. 120 символов)";
    return null;
  };

  const handleSidebarCreateClick = () => {
    setIsCreateMenuOpen((prev) => !prev);
  };

  const handleCreateFolderClick = () => {
    setIsCreateMenuOpen(false);
    setFolderNameError(null);
    setFolderNameDraft("Новая папка");
    setIsCreateFolderOpen(true);
  };

  const submitCreateFolder = async () => {
    const err = validateFolderName(folderNameDraft);
    if (err) {
      setFolderNameError(err);
      return;
    }

    try {
      await createFolder({
        name: folderNameDraft.trim(),
        parent: currentFolderId,
        userId: adminContext ? targetUserId : undefined,
      }).unwrap();

      setIsCreateFolderOpen(false);
      await refetchFiles();
    } catch {
      setFolderNameError("Не удалось создать папку");
    }
  };

  const handleSidebarUploadClickFromMenu = () => {
    setIsCreateMenuOpen(false);
    triggerFileInputClick();
  };

    const goToBreadcrumbIndex = (idx: number) => {
    const nextTrail = breadcrumb.slice(0, idx + 1);

    setPage(1);
    setSelectedIds([]);

    setBreadcrumb(nextTrail);
    persistBreadcrumb(nextTrail);

    const target = nextTrail[idx]?.id ?? null;

    navigate(buildFilesUrl(target), {
      state: { breadcrumb: nextTrail },
    });
  };

  const parentFolderId: number | null =
    currentView === "my" && currentFolderId !== null && breadcrumb.length >= 2
      ? (breadcrumb[breadcrumb.length - 2].id ?? null)
      : null;

  const goUpOneLevel = () => {
    setPage(1);
    setSelectedIds([]);

    const nextTrail = breadcrumb.length > 1 ? breadcrumb.slice(0, -1) : breadcrumb;

    setBreadcrumb(nextTrail);
    persistBreadcrumb(nextTrail);

    navigate(buildFilesUrl(parentFolderId), {
      state: { breadcrumb: nextTrail },
    });
  };

  const openMoveDialog = () => {
    // Позиционируем popover рядом с кнопкой
    const rect = moveBtnRef.current?.getBoundingClientRect();
    if (rect) {
      const top = rect.bottom + 8; // чуть ниже кнопки
      const left = Math.min(rect.left, window.innerWidth - 360); // 360 — ширина поповера, чтобы не улетал за край
      setMovePopoverPos({ top, left });
    } else {
      setMovePopoverPos({ top: 120, left: 120 });
    }

    setIsMoveOpen(true);
    setMoveParent(null);
    setMoveBrowseParent(null);
    setMoveStack([{ id: null, title: "Мой диск" }]);
    setMoveSearch("");
  };

  // ---------------------------------------------------------
  //   Unified file actions (single source of truth)
  // ---------------------------------------------------------

  type FileActions = {
    download: (ids: number[]) => void;
    trash: (ids: number[]) => Promise<void>;
    restore: (ids: number[]) => Promise<void>;
    hardDelete: (ids: number[]) => Promise<void>;
    move: (ids: number[]) => void;
    copyLinks: (ids: number[]) => Promise<void>;
    rename: (id: number) => void;
  };

  const filesById = useMemo(() => {
    const m = new Map<number, StoredFile>();
    for (const f of files) m.set(f.id, f);
    return m;
  }, [files]);

  const pickFilesByIds = useCallback(
    (ids: number[]): StoredFile[] => {
      const out: StoredFile[] = [];
      for (const id of ids) {
        const f = filesById.get(id);
        if (f) out.push(f);
      }
      return out;
    },
    [filesById],
  );

  const downloadByIds = useCallback(
    (ids: number[]) => {
      const picked = pickFilesByIds(ids);
      if (!picked.length) return;

      if (picked.length === 1) {
        const file = picked[0];
        const url = `/api/files/${file.id}/download`;
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }

      setIsPreparingArchive(true);
      try {
        const params = new URLSearchParams();
        ids.forEach((id) => params.append("ids", String(id)));
        const url = `/api/files/archive?${params.toString()}`;
        window.open(url, "_blank", "noopener,noreferrer");
      } finally {
        setTimeout(() => setIsPreparingArchive(false), 3000);
      }
    },
    [pickFilesByIds],
  );

  const trashByIds = useCallback(
    async (ids: number[]) => {
      const picked = pickFilesByIds(ids);
      if (!picked.length) return;

      const ok = confirm(`Переместить в корзину ${picked.length} выбранный(е) файл(ы)?`);
      if (!ok) return;

      setIsBulkBusy(true);
      try {
        await Promise.all(picked.map((f) => deleteFile(f.id).unwrap()));
        setSelectedIds((prev) => prev.filter((x) => !ids.includes(x)));
        await refetchFiles();
      } catch {
        notify("Не удалось переместить файлы в корзину");
      } finally {
        setIsBulkBusy(false);
      }
    },
    [pickFilesByIds, deleteFile, refetchFiles, notify],
  );

  const restoreByIds = useCallback(
    async (ids: number[]) => {
      const picked = pickFilesByIds(ids);
      if (!picked.length) return;

      const ok = confirm(`Восстановить ${picked.length} файл(ов) из корзины?`);
      if (!ok) return;

      setIsBulkBusy(true);
      try {
        await Promise.all(picked.map((f) => restoreFile(f.id).unwrap()));
        setSelectedIds((prev) => prev.filter((x) => !ids.includes(x)));
        await refetchFiles();
      } catch {
        notify("Не удалось восстановить файлы");
      } finally {
        setIsBulkBusy(false);
      }
    },
    [pickFilesByIds, restoreFile, refetchFiles, notify],
  );

  const hardDeleteByIds = useCallback(
    async (ids: number[]) => {
      const picked = pickFilesByIds(ids);
      if (!picked.length) return;

      const ok = confirm(`Удалить навсегда ${picked.length} файл(ов)? Это действие необратимо.`);
      if (!ok) return;

      setIsBulkBusy(true);
      try {
        await Promise.all(picked.map((f) => deleteFile(f.id).unwrap()));
        setSelectedIds((prev) => prev.filter((x) => !ids.includes(x)));
        await refetchFiles();
      } catch {
        notify("Не удалось удалить файлы навсегда");
      } finally {
        setIsBulkBusy(false);
      }
    },
    [pickFilesByIds, deleteFile, refetchFiles, notify],
  );

  const copyLinksByIds = useCallback(
    async (ids: number[]) => {
      const picked = pickFilesByIds(ids);
      if (!picked.length) return;

      setIsCopyingLinks(true);
      try {
        const links: string[] = [];
        for (const f of picked) {
          if (f.is_folder) continue;
          const link = await ensurePublicLink(f, (id) => issuePublic(id).unwrap());
          links.push(link);
        }

        if (!links.length) {
          notify("Публичные ссылки можно создать только для файлов");
          return;
        }

        await navigator.clipboard.writeText(links.join("\n"));
        setToast(
          `Ссылка${links.length > 1 ? "и" : ""} скопирован${links.length > 1 ? "ы" : "а"} в буфер`,
        );
        setTimeout(() => setToast(null), 2500);
      } catch {
        notify("Не удалось скопировать ссылки");
      } finally {
        setIsCopyingLinks(false);
      }
    },
    [pickFilesByIds, issuePublic, notify],
  );

  const moveByIds = useCallback(
    (ids: number[]) => {
      if (!ids.length) return;
      setSelectedIds(ids);
      openMoveDialog();
    },
    [openMoveDialog],
  );

  const renameById = useCallback((id: number) => {
    // В Files.tsx нет UI-редактирования имени; это действие делегируем FileRow.
    setSelectedIds([id]);
  }, []);

  const fileActions: FileActions = useMemo(
    () => ({
      download: downloadByIds,
      trash: trashByIds,
      restore: restoreByIds,
      hardDelete: hardDeleteByIds,
      move: moveByIds,
      copyLinks: copyLinksByIds,
      rename: renameById,
    }),
    [
      downloadByIds,
      trashByIds,
      restoreByIds,
      hardDeleteByIds,
      moveByIds,
      copyLinksByIds,
      renameById,
    ],
  );

  // ---------------------------------------------------------
  // UI subcomponents (defined inside Files for access to props)
  // ---------------------------------------------------------

  const Sidebar = () => {
    const navItem = (label: string, icon: JSX.Element, target: string, view: FilesView) => {
      const active = currentView === view;
      return (
        <button
          type="button"
          className={"sidebar-nav-item" + (active ? " sidebar-nav-item--active" : "")}
          onClick={() => {
            setPage(1);
            setSelectedIds([]);
            navigate(target);
          }}
        >
          <span className="sidebar-nav-icon-wrapper">{icon}</span>
          <span className="sidebar-nav-label">{label}</span>
        </button>
      );
    };

    return (
      <aside className="files-sidebar">
        <div className="sidebar-main">
          {/* ЛОГО */}
          <div className="sidebar-logo">
            <svg width="240" height="70" viewBox="0 0 240 70" xmlns="http://www.w3.org/2000/svg">
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

          {/* + СОЗДАТЬ (выпадающее меню) */}
          {currentView !== "trash" && (
            <div className="sidebar-create-wrapper" ref={createMenuRef}>
              <button
                type="button"
                className="sidebar-create-btn"
                onClick={handleSidebarCreateClick}
              >
                <span className="sidebar-create-btn-icon">
                  <PlusIcon className="sidebar-create-btn-icon-svg" aria-hidden="true" />
                </span>
                <span className="sidebar-upload-label">Создать</span>
              </button>

              {isCreateMenuOpen && (
                <div className="sidebar-create-menu">
                  <button
                    type="button"
                    className="sidebar-create-menu-item"
                    onClick={handleCreateFolderClick}
                  >
                    <FolderPlusIcon className="sidebar-create-menu-icon" aria-hidden="true" />
                    <span>Создать папку</span>
                  </button>

                  <button
                    type="button"
                    className="sidebar-create-menu-item"
                    onClick={handleSidebarUploadClickFromMenu}
                  >
                    <ArrowUpTrayIcon className="sidebar-create-menu-icon" aria-hidden="true" />
                    <span>Загрузить файлы</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {isCreateFolderOpen && currentView !== "trash" && (
            <div
              className="create-folder-popover"
              ref={createFolderRef}
              role="dialog"
              aria-label="Создание папки"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="create-folder-title">Новая папка</div>
              <input
                className="create-folder-input"
                value={folderNameDraft}
                onChange={(e) => {
                  setFolderNameDraft(e.target.value);
                  if (folderNameError) setFolderNameError(null);
                }}
                autoFocus
                disabled={isCreatingFolder}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setIsCreateFolderOpen(false);
                    setFolderNameError(null);
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void submitCreateFolder();
                  }
                }}
              />

              {folderNameError && <div className="create-folder-error">{folderNameError}</div>}

              <div className="create-folder-actions">
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => void submitCreateFolder()}
                  disabled={isCreatingFolder}
                >
                  Создать
                </button>

                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setIsCreateFolderOpen(false)}
                  disabled={isCreatingFolder}
                >
                  Отмена
                </button>
              </div>
            </div>
          )}

          <nav className="sidebar-nav" aria-label="Основная навигация">
            {navItem("Мой диск", iconDrive, `/files${adminQuery}`, "my")}
            {navItem("Недавние", iconRecent, `/recent${adminQuery}`, "recent")}
            {navItem("Корзина", iconTrash, `/trash${adminQuery}`, "trash")}

            {me?.is_admin && (
              <button
                type="button"
                className="sidebar-nav-item"
                onClick={() => {
                  setPage(1);
                  setSelectedIds([]);
                  navigate("/admin");
                }}
              >
                <span className="sidebar-nav-icon-wrapper">
                  {/* простая иконка "панель" без новых импортов */}
                  <svg viewBox="0 0 24 24" className="sidebar-nav-icon" aria-hidden="true">
                    <path
                      d="M4 4h7v7H4V4Zm9 0h7v4h-7V4ZM13 10h7v10h-7V10ZM4 13h7v7H4v-7Z"
                      fill="currentColor"
                    />
                  </svg>
                </span>
                <span className="sidebar-nav-label">Панель администратора</span>
              </button>
            )}
          </nav>
        </div>

        {/* КВОТА */}
        <div className="sidebar-quota" aria-label="Использование диска">
          <div className="sidebar-quota-text">Использовано {fmtSize(usedBytes)} из 5 ГБ</div>
          <div className="sidebar-quota-bar">
            <div className="sidebar-quota-bar-fill" style={{ width: `${usedPercent}%` }} />
          </div>
        </div>
      </aside>
    );
  };

  const Topbar = () => (
    <div className="files-topbar">
      <div className="files-topbar-left">
        <span className="files-topbar-tab files-topbar-tab--active">Файлы</span>
      </div>
      <div className="files-topbar-right">
        <button type="button" className="files-topbar-logout-btn" onClick={handleLogout}>
          Выход
        </button>
      </div>
    </div>
  );

  const Header = () => (
    <div className="files-main-header">
      <div className="files-main-title-block">
        {/* Всегда есть "первая строка" одинаковой высоты */}
        {currentView === "my" ? (
          <nav className="files-breadcrumbs files-breadcrumbs--title" aria-label="Навигация по папкам">
            {breadcrumb.map((bc, idx) => {
              const isLast = idx === breadcrumb.length - 1;

              return (
                <span key={`${bc.id ?? "root"}-${idx}`} className="files-breadcrumb-item">
                  {idx > 0 && <span className="files-breadcrumb-sep">›</span>}

                  {isLast ? (
                    <span className="files-breadcrumb-current" title={bc.name}>
                      {bc.name}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="files-breadcrumb-link"
                      title={bc.name}
                      onClick={() => goToBreadcrumbIndex(idx)}
                    >
                      {bc.name}
                    </button>
                  )}
                </span>
              );
            })}
          </nav>
        ) : (
          // Для recent/trash — заголовок вместо breadcrumbs, но та же "первая строка"
          <div className="files-breadcrumbs files-breadcrumbs--title" aria-label="Раздел">
            <span className="files-breadcrumb-current">{pageTitle}</span>
          </div>
        )}

        {/* Всегда резервируем "вторую строку", чтобы таблица не прыгала */}
        <div className="files-main-subtitle">{pageSubtitle || "\u00A0"}</div>
      </div>

      <div
        className="files-main-actions"
        style={currentView === "trash" ? { visibility: "hidden" } : undefined}
        aria-hidden={currentView === "trash"}
      >
        {/* PRIMARY: Upload */}
        <button
          className="icon-circle-btn icon-circle-btn--primary"
          type="button"
          title={isUploading ? "Файл загружается" : "Загрузить файлы"}
          onClick={triggerFileInputClick}
          disabled={isUploading || currentView === "trash"}
        >
          <span className="icon-circle-symbol icon-circle-symbol--plus">+</span>
        </button>

        <button
          className="icon-circle-btn icon-circle-btn--secondary"
          type="button"
          title={isFetching ? "Обновляется…" : "Обновить список"}
          onClick={() => refetchFiles()}
          disabled={isFetching}
        >
          <svg
            className={"icon-circle-svg" + (isFetching ? " icon-circle-svg--spin" : "")}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              d="M20 12a8 8 0 0 1-13.66 5.66"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <path
              d="M4 12a8 8 0 0 1 13.66-5.66"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <path
              d="M7.2 18.2H6a.8.8 0 0 1-.8-.8v-1.2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M16.8 5.8H18a.8.8 0 0 1 .8.8v1.2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );

  const uploadInline = useMemo(() => {
    if (currentView === "trash") return null;
    if (!(filesToUpload.length > 0 || isUploading)) return null;

    return (
      <form className="files-upload-inline" onSubmit={onSubmitUpload}>
        <div className="files-upload-left">
          <div className="files-upload-selected">
            {filesToUpload.length > 0 ? (
              <ul className="files-upload-list">
                {filesToUpload.map((f, idx) => (
                  <li key={f.name + idx} className="files-upload-item">
                    <span className="files-upload-item-name" title={f.name}>
                      {f.name}
                    </span>

                    {!isUploading && (
                      <button
                        type="button"
                        className="files-upload-remove"
                        title="Убрать из загрузки"
                        onClick={() => {
                          setFilesToUpload((prev) => prev.filter((_, i) => i !== idx));
                        }}
                      >
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="files-upload-empty">Нет выбранных файлов</div>
            )}

            {filesToUpload.length > 0 && (
              <div className="files-upload-progress">
                <div className="files-upload-progress-bar">
                  <div
                    className="files-upload-progress-fill"
                    style={{
                      width: `${Math.round((uploadIndex / filesToUpload.length) * 100)}%`,
                    }}
                  />
                </div>

                <div className="files-upload-progress-text">
                  {isUploading
                    ? `Загружается ${uploadIndex} из ${filesToUpload.length}`
                    : `Готово к загрузке: ${filesToUpload.length}`}
                </div>
              </div>
            )}
          </div>
        </div>

        <input
          type="text"
          className="files-upload-comment"
          placeholder="Комментарий (опционально)"
          value={uploadComment}
          onChange={(e) => setUploadComment(e.target.value)}
          disabled={isUploading}
        />

        <button
          className="btn btn--secondary files-upload-submit"
          type="submit"
          disabled={isUploading || filesToUpload.length === 0}
        >
          {isUploading ? "Загрузка…" : "Загрузить"}
        </button>
      </form>
    );
  }, [currentView, filesToUpload, isUploading, uploadIndex, uploadComment, onSubmitUpload]);

  const SelectionBar = () => (
    <div
      className={
        "files-selection-bar " +
        (selectedIds.length > 0 ? "files-selection-bar--selected" : "files-selection-bar--idle")
      }
    >
      {selectedIds.length > 0 ? (
        <>
          <div className="files-selection-left">
            <SelectionActionButton
              icon={XMarkIcon}
              title="Отменить выделение"
              onClick={handleClearSelection}
              disabled={isBulkBusy || isCopyingLinks}
            />
            <div className="files-selection-summary">{formatSelectionLabel(selectedIds.length)}</div>
          </div>

          <div className="files-selection-actions files-selection-actions--icons">
            {currentView !== "trash" && (
              <>
                <SelectionActionButton
                  icon={ArrowDownTrayIcon}
                  title="Скачать"
                  onClick={() => fileActions.download(selectedIds)}
                  disabled={isBulkBusy}
                />

                <span ref={moveBtnRef} className="selection-action-wrap">
                  <SelectionActionButton
                    icon={FolderArrowDownIcon}
                    title="Переместить"
                    onClick={() => fileActions.move(selectedIds)}
                    disabled={isBulkBusy || isCopyingLinks}
                  />
                </span>
              </>
            )}

            {currentView === "trash" ? (
              <>
                <SelectionActionButton
                  icon={ArrowPathIcon}
                  title="Восстановить"
                  onClick={() => void fileActions.restore(selectedIds)}
                  disabled={isBulkBusy}
                />

                <SelectionActionButton
                  icon={TrashIcon}
                  title="Удалить навсегда"
                  onClick={() => void fileActions.hardDelete(selectedIds)}
                  disabled={isBulkBusy}
                  variant="danger"
                />
              </>
            ) : (
              <SelectionActionButton
                icon={TrashIcon}
                title="Отправить в корзину"
                onClick={() => void fileActions.trash(selectedIds)}
                disabled={isBulkBusy}
                variant="danger"
              />
            )}

            {currentView !== "trash" && (
              <SelectionActionButton
                icon={LinkIcon}
                title="Копировать ссылку"
                onClick={() => void fileActions.copyLinks(selectedIds)}
                disabled={isCopyingLinks || isBulkBusy}
              />
            )}
          </div>
        </>
      ) : currentView !== "trash" ? (
        <div className="files-type-filter" ref={typeMenuRef}>
          <button
            type="button"
            className="files-type-filter-btn"
            onClick={(e) => {
              e.stopPropagation();
              setTypeMenuOpen((v) => !v);
            }}
            aria-haspopup="menu"
            aria-expanded={typeMenuOpen}
            title="Фильтр по типу"
          >
            <span className="files-type-filter-title">Тип</span>
            <span className="files-type-filter-value">{typeFilterLabel(typeFilter)}</span>
            <span className="files-type-filter-caret">▾</span>
          </button>

          {typeMenuOpen && (
            <div className="files-type-filter-menu" role="menu">
              {(
                [
                  ["all", "Все типы"],
                  ["doc", "Документы"],
                  ["sheet", "Таблицы"],
                  ["pdf", "PDF"],
                  ["image", "Изображения"],
                  ["archive", "Архивы"],
                  ["other", "Прочее"],
                ] as Array<[TypeFilter, string]>
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={"files-type-filter-item" + (typeFilter === value ? " is-active" : "")}
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTypeFilter(value);
                    setTypeMenuOpen(false);
                  }}
                >
                  {value !== "all" && (
                    <span className="files-type-filter-icon">
                      <FileTypeIcon kind={value as FileKind} />
                    </span>
                  )}
                  <span className="files-type-filter-label">{label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );

  const FilesTable = () => {
    if (isLoading) return <div>Загрузка…</div>;
    if (error) return <div className="error">Ошибка загрузки списка файлов</div>;

    if (files.length === 0) {
      return (
        <div className="files-empty-state">
          <div className="files-empty-title">Файлов нет</div>
          <div className="files-empty-subtitle">
            {currentView === "trash"
              ? "Файлы, удалённые в корзину, появятся здесь."
              : currentView === "recent"
              ? "Недавних файлов пока нет."
              : "Нажмите «Загрузить», чтобы добавить первый файл."}
          </div>
        </div>
      );
    }

    if (visibleFiles.length === 0) {
      return (
        <div className="files-empty-state">
          <div className="files-empty-title">Ничего не найдено</div>
          <div className="files-empty-subtitle">Выберите другой тип файлов или очистите фильтр.</div>
          <button
            type="button"
            className="files-empty-action"
            onClick={() => setTypeFilter("all")}
          >
            Очистить фильтр
          </button>
        </div>
      );
    }

    return (
      <>
        <table className="table-files">
          <thead>
            <tr>
              {currentView === "trash" ? (
                <>
                  <th className={"col-name is-sortable"} onClick={() => toggleSort("name")}>
                    Имя файла
                    <span className="sort-indicator">
                      {sortKey === "name" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </span>
                  </th>
                  <th className={"col-deleted is-sortable"} onClick={() => toggleSort("deleted_at")}>
                    Дата удаления
                    <span className="sort-indicator">
                      {sortKey === "deleted_at" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </span>
                  </th>
                  <th className={"col-size is-sortable"} onClick={() => toggleSort("size")}>
                    Размер
                    <span className="sort-indicator">
                      {sortKey === "size" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </span>
                  </th>
                  <th className={"col-origin is-sortable"} onClick={() => toggleSort("origin")}>
                    Исходное местоположение
                    <span className="sort-indicator">
                      {sortKey === "origin" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </span>
                  </th>
                  <th className="col-actions">Действия</th>
                </>
              ) : (
                <>
                  <th className={"col-name is-sortable"} onClick={() => toggleSort("name")}>
                    Имя файла
                    <span className="sort-indicator">
                      {sortKey === "name" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </span>
                  </th>
                  <th className="col-comment">Комментарий</th>
                  <th className={"col-size is-sortable"} onClick={() => toggleSort("size")}>
                    Размер
                    <span className="sort-indicator">
                      {sortKey === "size" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </span>
                  </th>
                  <th className={"col-up is-sortable"} onClick={() => toggleSort("uploaded_at")}>
                    Дата загрузки
                    <span className="sort-indicator">
                      {sortKey === "uploaded_at" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </span>
                  </th>
                  <th
                    className={"col-down is-sortable"}
                    onClick={() => toggleSort("last_downloaded_at")}
                  >
                    Дата последнего скачивания
                    <span className="sort-indicator">
                      {sortKey === "last_downloaded_at" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </span>
                  </th>
                  <th className="col-actions">Действия</th>
                </>
              )}
            </tr>
          </thead>

          <tbody>
            {currentView === "my" && currentFolderId !== null && (
              <tr
                className="row-up"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  goUpOneLevel();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  goUpOneLevel();
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter") goUpOneLevel();
                }}
                aria-label="Перейти на уровень выше"
              >
                <td className="col-name" colSpan={6}>
                  <div className="file-name-wrapper">
                    <span className="row-up-icon" aria-hidden="true">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M3 7a2 2 0 0 1 2-2h4.2a2 2 0 0 1 1.4.58L12.6 7H19a2 2 0 0 1 2 2v1H3V7Z"
                          fill="currentColor"
                          opacity="0.9"
                        />
                        <rect
                          x="3"
                          y="10"
                          width="18"
                          height="10"
                          rx="2"
                          fill="currentColor"
                          opacity="0.75"
                        />
                        <path
                          d="M12 16V11M12 11l-2 2M12 11l2 2"
                          stroke="#ffffff"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span className="row-up-text">..</span>
                  </div>
                </td>
              </tr>
            )}

            {sortedFiles.map((f) => (
              <FileRow
                key={f.id}
                file={{ ...f, last_downloaded_at: f.last_downloaded_at ?? null }}
                view={currentView}
                actions={fileActions}
                onFileUpdated={handleFileUpdated}
                onFileDeleted={handleFileDeleted}
                selected={selectedIds.includes(f.id)}
                onRowClick={handleRowClick}
                onOpenFolder={(id) => {
                  setSelectedIds([]);

                  const folder = files.find((x) => x.is_folder && x.id === id);
                  const folderName = folder?.original_name ?? `Папка ${id}`;

                  const nextTrail =
                    currentView === "my"
                      ? [...breadcrumb, { id, name: folderName }]
                      : [{ id: null, name: "Мой диск" }, { id, name: folderName }];

                  setBreadcrumb(nextTrail);
                  persistBreadcrumb(nextTrail);

                  // ❗ СБРОС СТРАНИЦЫ ЧЕРЕЗ NAVIGATION STATE
                  navigate(buildFilesUrl(id), {
                    state: { breadcrumb: nextTrail },
                  });
                }}
              />
            ))}
          </tbody>
        </table>

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
            Страница {page} из {totalPages} {totalCount ? `(всего файлов: ${totalCount})` : null}
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
        </div>
      </>
    );
  };

  const MovePopover = () => {
    if (!isMoveOpen || !movePopoverPos) return null;

    return (
      <div className="mc-popover-overlay" onMouseDown={() => setIsMoveOpen(false)}>
        <div
          className="mc-popover"
          style={{ top: movePopoverPos.top, left: movePopoverPos.left }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="mc-popover__header">
            <div className="mc-popover__title">Переместить в…</div>
            <button className="mc-popover__close" onClick={() => setIsMoveOpen(false)} type="button">
              ×
            </button>
          </div>

          <div className="mc-popover__path">
            <button
              className="mc-btn mc-btn--ghost"
              disabled={moveStack.length <= 1}
              onClick={() => {
                if (moveStack.length > 1) {
                  const next = moveStack.slice(0, -1);
                  setMoveStack(next);
                  setMoveBrowseParent(next[next.length - 1].id);
                }
              }}
              type="button"
            >
              Назад
            </button>

            <div className="mc-popover__crumbs">
              {moveStack.map((s, idx) => (
                <span key={`${s.id ?? "root"}-${idx}`}>
                  <button
                    className="mc-link"
                    onClick={() => {
                      const next = moveStack.slice(0, idx + 1);
                      setMoveStack(next);
                      setMoveBrowseParent(s.id);
                    }}
                    type="button"
                  >
                    {s.title}
                  </button>
                  {idx < moveStack.length - 1 ? " / " : ""}
                </span>
              ))}
            </div>
          </div>

          <div className="mc-popover__body">
            <div className="mc-popover__search">
              <input
                className="mc-popover__searchInput"
                value={moveSearch}
                onChange={(e) => setMoveSearch(e.target.value)}
                placeholder="Поиск папок…"
              />
            </div>

            {isMoveFetching ? (
              <div className="mc-muted">Загрузка…</div>
            ) : (
              <div className="mc-popover__list">
                {/* ROOT */}
                <div className="mc-popover__row" onClick={() => setMoveParent(null)}>
                  <button className="mc-popover__open" type="button" disabled>
                    🏠
                  </button>

                  <button
                    className={`mc-popover__name ${moveParent === null ? "is-selected" : ""}`}
                    type="button"
                  >
                    Мой диск
                  </button>
                </div>

                {/* SUBFOLDERS */}
                {moveFoldersFiltered.length ? (
                  moveFoldersFiltered.map((f) => (
                    <div
                      key={f.id}
                      className="mc-popover__row"
                      onDoubleClick={() => {
                        setMoveBrowseParent(f.id);
                        setMoveStack((prev) => [...prev, { id: f.id, title: f.original_name }]);
                      }}
                    >
                      <button
                        className="mc-popover__open"
                        onClick={() => {
                          setMoveBrowseParent(f.id);
                          setMoveStack((prev) => [...prev, { id: f.id, title: f.original_name }]);
                        }}
                        title="Открыть папку"
                        type="button"
                      >
                        📁
                      </button>

                      <button
                        className={`mc-popover__name ${moveParent === f.id ? "is-selected" : ""}`}
                        onClick={() => setMoveParent(f.id)}
                        type="button"
                      >
                        {f.original_name}
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="mc-muted">В этой папке нет подпапок</div>
                )}
              </div>
            )}
          </div>

          <div className="mc-popover__footer">
            <button
              className="mc-btn mc-btn--ghost"
              onClick={() => setMoveParent(moveBrowseParent)}
              type="button"
            >
              Выбрать эту папку
            </button>

            <div className="mc-popover__spacer" />

            <button
              className="mc-btn mc-btn--primary"
              onClick={handleConfirmMove}
              disabled={isBulkBusy}
              type="button"
            >
              Переместить
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ------------------------------
  // Render
  // ------------------------------

   return (
    <div className="files-page container">
      <div className="files-layout">
        <Sidebar />

        <section className="files-main" onClick={handleMainAreaClick}>
          <Topbar />
          <Header />

          {viewingForeign && (
            <div className="panel files-foreign">
              Просмотр хранилища пользователя{" "}
              {targetUserLogin ? (
                <>
                  <strong>{targetUserLogin}</strong>{" "}
                  <span style={{ opacity: 0.7 }}>(ID {targetUserId})</span>
                </>
              ) : (
                <>ID {targetUserId}</>
              )}
            </div>
          )}

          {currentView !== "trash" && (
            <input
              id="fileInput"
              type="file"
              multiple
              style={{ display: "none" }}
              onChange={(e) => {
                const list = Array.from(e.target.files ?? []);
                setFilesToUpload(list);
              }}
              disabled={isUploading}
            />
          )}

          {uploadInline}

          <SelectionBar />

          <div className="panel files-list-panel">
            <FilesTable />
          </div>

          {isPreparingArchive && (
            <div className="files-toast files-toast--info">
              Подготовка архива для скачивания, пожалуйста, подождите...
            </div>
          )}
          {toast && <div className="files-toast files-toast--info">{toast}</div>}

          <MovePopover />
        </section>
      </div>
    </div>
  );
}


