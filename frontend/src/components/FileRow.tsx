import React, { useCallback, useEffect, useRef, useState } from "react";
import { fmtSize } from "../utils/format";
import DocIcon from "./icons/filetypes/DocIcon";
import FileTypeIcon from "./icons/filetypes/FileTypeIcon";

import { usePatchFileMutation } from "../features/files/filesApi";

import {
  ArrowDownTrayIcon,
  PencilSquareIcon,
  FolderArrowDownIcon,
  ShareIcon,
  TrashIcon,
  ArrowPathIcon,
  EllipsisVerticalIcon,
} from "@heroicons/react/24/outline";

type FileItem = {
  id: number;
  original_name: string;
  size: number;
  uploaded_at: string;
  last_downloaded_at: string | null;
  comment: string;
  has_public_link?: boolean;
  public_token?: string | null;
  is_deleted?: boolean;
  deleted_at?: string | null;
  is_folder?: boolean;
  parent?: number | null;
  deleted_from?: number | null;
  deleted_from_path?: string | null;
};

type FileActions = {
  download: (ids: number[]) => void;
  trash: (ids: number[]) => Promise<void>;
  restore: (ids: number[]) => Promise<void>;
  hardDelete: (ids: number[]) => Promise<void>;
  move: (ids: number[]) => void;
  copyLinks: (ids: number[]) => Promise<void>;
  rename: (id: number) => void;
};

interface Props {
  file: FileItem;
  view: "my" | "recent" | "trash";
  actions: FileActions;
  onFileUpdated: (updated: FileItem) => void;
  onFileDeleted: (id: number) => void;
  selected: boolean;
  onRowClick: (id: number, isCtrlOrMeta: boolean) => void;
  onOpenFolder?: (folderId: number) => void;
}

type FileKind = "doc" | "sheet" | "pdf" | "image" | "archive" | "other";

function getFileTypeMeta(name: string): { kind: FileKind; title: string } {
  const dot = name.lastIndexOf(".");
  const ext = dot !== -1 ? name.slice(dot + 1).toLowerCase() : "";

  if (["doc", "docx", "rtf", "odt"].includes(ext)) {
    return { kind: "doc", title: "Текстовый документ" };
  }
  if (["xls", "xlsx", "csv", "ods"].includes(ext)) {
    return { kind: "sheet", title: "Таблица" };
  }
  if (ext === "pdf") return { kind: "pdf", title: "PDF-документ" };
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) {
    return { kind: "image", title: "Изображение" };
  }
  if (["zip", "rar", "7z", "tgz", "tar", "gz"].includes(ext)) {
    return { kind: "archive", title: "Архив" };
  }
  return { kind: "other", title: "Файл" };
}

const FileRow: React.FC<Props> = ({
  file,
  view,
  actions,
  onFileUpdated,
  onFileDeleted,
  selected,
  onRowClick,
  onOpenFolder,
}) => {
  const [busy, setBusy] = useState(false);

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(file.original_name);

  const [isEditingComment, setIsEditingComment] = useState(false);
  const [commentDraft, setCommentDraft] = useState(file.comment || "");

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const clickTimerRef = useRef<number | null>(null);

  // Счётчик "пропуска" ближайших blank-click событий (строго число).
  const ignoreNextBlankClickRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (clickTimerRef.current !== null) {
        window.clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
    };
  }, []);

  const uploadedDate = new Date(file.uploaded_at);
  const uploadedDateStr = uploadedDate.toLocaleDateString();
  const uploadedTimeStr = uploadedDate.toLocaleTimeString();

  const lastDownload = file.last_downloaded_at ? new Date(file.last_downloaded_at) : null;
  const lastDownloadDateStr = lastDownload?.toLocaleDateString() ?? "";
  const lastDownloadTimeStr = lastDownload?.toLocaleTimeString() ?? "";

  const fileType = getFileTypeMeta(file.original_name);

  const [patchFile] = usePatchFileMutation();

  const isTrashView = view === "trash";

  const deletedAt = file.deleted_at ? new Date(file.deleted_at) : null;
  const deletedDateStr = deletedAt?.toLocaleDateString() ?? "";
  const deletedTimeStr = deletedAt?.toLocaleTimeString() ?? "";

  // Закрытие меню при клике вне (как было), но НЕ трогаем тут комментарии.
  useEffect(() => {
    if (!menuOpen) return;

    const handler = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (target && menuRef.current && menuRef.current.contains(target)) return;
      setMenuOpen(false);
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // Сохранение расширения
  const keepExtension = (value: string, original: string) => {
    const trimmed = value.trim();
    if (!trimmed) return trimmed;

    const dot = trimmed.lastIndexOf(".");
    if (dot > 0 && dot < trimmed.length - 1) return trimmed;

    const oldDot = original.lastIndexOf(".");
    return oldDot > 0 ? trimmed + original.slice(oldDot) : trimmed;
  };

  /* ========================
        PATCH name
     ======================== */
  const saveName = async () => {
    const raw = nameDraft.trim();
    const finalName = file.is_folder ? raw : keepExtension(raw, file.original_name);

    if (!finalName || finalName === file.original_name) {
      setIsEditingName(false);
      setNameDraft(file.original_name);
      return;
    }

    setBusy(true);
    try {
      // На разных бэках папка может ожидать "name", а файл — "original_name".
      // Отправляем оба — лишнее будет проигнорировано.
      const payload: any = {
        id: file.id,
        name: finalName,
        original_name: finalName,
      };

      const updatedAny = (await patchFile(payload).unwrap()) as any;

      // Подстрахуемся: UI в таблице завязан на original_name
      const nextOriginalName = updatedAny?.original_name ?? updatedAny?.name ?? finalName;

      onFileUpdated({
        ...file,
        ...updatedAny,
        original_name: nextOriginalName,
      } as FileItem);

      setIsEditingName(false);
    } catch (e) {
      console.error(e);
      alert("Не удалось сохранить имя");
    } finally {
      setBusy(false);
    }
  };

  const promptRename = async () => {
    setMenuOpen(false);

    const currentName = file.original_name;

    const nextRaw = window.prompt(
      `Новое имя ${file.is_folder ? "папки" : "файла"}:`,
      currentName,
    );

    // Cancel
    if (nextRaw === null) return;

    const raw = nextRaw.trim();

    // Пустое имя
    if (!raw) {
      alert("Имя не может быть пустым");
      return;
    }

    // Если не изменили
    if (raw === currentName) return;

    const finalName = file.is_folder ? raw : keepExtension(raw, currentName);

    setBusy(true);
    try {
      const updatedAny = (await patchFile({
        id: file.id,
        name: finalName,
        original_name: finalName,
      } as any).unwrap()) as any;

      const nextOriginalName = updatedAny?.original_name ?? updatedAny?.name ?? finalName;

      onFileUpdated({
        ...file,
        ...updatedAny,
        original_name: nextOriginalName,
      } as any);
    } catch (e) {
      console.error(e);
      alert("Не удалось переименовать");
    } finally {
      setBusy(false);
    }
  };

  /* ========================
        PATCH comment
     ======================== */
  const saveComment = useCallback(async () => {
    const current = file.comment || "";
    if (commentDraft === current) {
      setIsEditingComment(false);
      return;
    }

    setBusy(true);
    try {
      const updated = await patchFile({
        id: file.id,
        comment: commentDraft,
      }).unwrap();

      onFileUpdated(updated as FileItem);
      setIsEditingComment(false);
    } catch {
      alert("Не удалось сохранить комментарий");
    } finally {
      setBusy(false);
    }
  }, [commentDraft, file.comment, file.id, onFileUpdated, patchFile]);

  const handleMenuDownload = () => {
    actions.download([file.id]);
    setMenuOpen(false);
  };

  const handleOpenFile = (e: React.MouseEvent) => {
    e.stopPropagation();

    if (file.is_folder) {
      onOpenFolder?.(file.id);
      return;
    }

    const url = `/api/files/${file.id}/view`;
    window.open(url, "_blank", "noopener,noreferrer");

    onFileUpdated({
      ...file,
      last_downloaded_at: new Date().toISOString(),
    });
  };

  // Закрытие редактирования комментария по клику на "пустое место" рабочей области (с сохранением)
  useEffect(() => {
    if (!isEditingComment) return;

    const handler = () => {
      if (ignoreNextBlankClickRef.current > 0) {
        ignoreNextBlankClickRef.current -= 1;
        return;
      }
      if (busy) return;
      void saveComment();
    };

    window.addEventListener("files:blank-click", handler as EventListener);
    return () => window.removeEventListener("files:blank-click", handler as EventListener);
  }, [isEditingComment, busy, saveComment]);

  const originFullPath = file.deleted_from_path ? `Мой диск/${file.deleted_from_path}` : "Мой диск";

  return (
    <tr
      className={selected ? "row-selected" : undefined}
      onClick={(e) => {
        const isCtrlOrMeta = e.ctrlKey || e.metaKey;

        if (clickTimerRef.current !== null) {
          window.clearTimeout(clickTimerRef.current);
        }

        clickTimerRef.current = window.setTimeout(() => {
          onRowClick(file.id, isCtrlOrMeta);
          clickTimerRef.current = null;
        }, 250);
      }}
      onDoubleClick={(e) => {
        if (clickTimerRef.current !== null) {
          window.clearTimeout(clickTimerRef.current);
          clickTimerRef.current = null;
        }

        e.stopPropagation();
        handleOpenFile(e);
      }}
    >
      {/* имя файла + иконка */}
      <td className="col-name">
        <div className="file-name-wrapper" title={file.original_name}>
          {file.is_folder ? (
            <FileTypeIcon kind="other" title="Папка" />
          ) : fileType.kind === "doc" ? (
            <DocIcon />
          ) : (
            <FileTypeIcon kind={fileType.kind} title={fileType.title} />
          )}

          <div className="file-name-main">
            {isEditingName ? (
              <div className="edit-wrap">
                <input
                  className="edit-input"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  disabled={busy}
                  autoFocus
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.stopPropagation();
                      void saveName();
                    }
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      setIsEditingName(false);
                      setNameDraft(file.original_name);
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void saveName();
                  }}
                  disabled={busy}
                >
                  OK
                </button>

                <button
                  className="btn btn--ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditingName(false);
                    setNameDraft(file.original_name);
                  }}
                  disabled={busy}
                >
                  Отмена
                </button>
              </div>
            ) : (
              <span className="name-text" title="Открыть файл">
                {file.original_name}
              </span>
            )}
          </div>
        </div>
      </td>

      {isTrashView ? (
        <>
          {/* дата удаления */}
          <td className="col-deleted">
            {deletedAt ? (
              <div className="dt">
                <span className="dt-date">{deletedDateStr}</span>
                <span className="dt-time">{deletedTimeStr}</span>
              </div>
            ) : (
              "—"
            )}
          </td>

          {/* размер */}
          <td className="col-size">{fmtSize(file.size)}</td>

          {/* исходное местоположение */}
          <td className="col-origin">
            <span title={originFullPath}>{originFullPath}</span>
          </td>
        </>
      ) : (
        <>
          {/* комментарий */}
          <td className="col-comment">
            {isEditingComment ? (
              <div className="edit-wrap">
                <input
                  className="edit-input"
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  disabled={busy}
                  autoFocus
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void saveComment();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setIsEditingComment(false);
                      setCommentDraft(file.comment || "");
                    }
                  }}
                />
                <button
                  className="btn btn--secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    void saveComment();
                  }}
                  disabled={busy}
                >
                  OK
                </button>
                <button
                  className="btn btn--ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditingComment(false);
                    setCommentDraft(file.comment || "");
                  }}
                  disabled={busy}
                >
                  Отмена
                </button>
              </div>
            ) : (
              <span
                className="comment-text"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  // Пропускаем ближайшие "blank click" события, которые могли быть инициированы этим же взаимодействием.
                  ignoreNextBlankClickRef.current = 2;
                  setIsEditingComment(true);
                  setCommentDraft(file.comment || "");
                }}
              >
                {file.comment || "Добавить комментарий"}
              </span>
            )}
          </td>

          {/* размер */}
          <td className="col-size">{fmtSize(file.size)}</td>

          {/* дата загрузки */}
          <td className="col-up">
            <div className="dt">
              <span className="dt-date">{uploadedDateStr}</span>
              <span className="dt-time">{uploadedTimeStr}</span>
            </div>
          </td>

          {/* дата последнего скачивания */}
          <td className="col-down">
            {lastDownload ? (
              <div className="dt">
                <span className="dt-date">{lastDownloadDateStr}</span>
                <span className="dt-time">{lastDownloadTimeStr}</span>
              </div>
            ) : (
              "—"
            )}
          </td>
        </>
      )}

      {/* действия */}
      <td className="col-actions">
        <div className="actions-menu-wrapper" ref={menuRef} onClick={(e) => e.stopPropagation()}>
          {/* меню (⋮) */}
          <button
            className="icon-button actions-menu-trigger"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((x) => !x);
            }}
            aria-label="Дополнительные действия"
            disabled={busy}
            type="button"
          >
            <EllipsisVerticalIcon className="actions-menu-trigger-icon" />
          </button>

          {menuOpen && (
            <div className="actions-menu">
              {!isTrashView ? (
                <>
                  <button className="actions-menu-item" onClick={handleMenuDownload} disabled={busy}>
                    <ArrowDownTrayIcon className="actions-menu-item-icon" />
                    Скачать
                  </button>

                  <button
                    className="actions-menu-item"
                    type="button"
                    onClick={() => {
                      void promptRename();
                    }}
                    disabled={busy}
                  >
                    <PencilSquareIcon className="actions-menu-item-icon" />
                    Переименовать
                  </button>

                  <button
                    className="actions-menu-item"
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      actions.move([file.id]);
                    }}
                    disabled={busy}
                  >
                    <FolderArrowDownIcon className="actions-menu-item-icon" />
                    Переместить
                  </button>

                  {!file.is_folder && (
                    <button
                      className="actions-menu-item"
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        void actions.copyLinks([file.id]);
                      }}
                      disabled={busy}
                    >
                      <ShareIcon className="actions-menu-item-icon" />
                      Копировать ссылку
                    </button>
                  )}

                  <button
                    className="actions-menu-item actions-menu-item--danger"
                    onClick={() => {
                      setMenuOpen(false);
                      void actions.trash([file.id]);
                    }}
                    disabled={busy}
                  >
                    <TrashIcon className="actions-menu-item-icon" />
                    Отправить в корзину
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="actions-menu-item"
                    onClick={() => {
                      setMenuOpen(false);
                      void actions.restore([file.id]);
                    }}
                    disabled={busy}
                  >
                    <ArrowPathIcon className="actions-menu-item-icon" />
                    Восстановить
                  </button>

                  <button
                    className="actions-menu-item actions-menu-item--danger"
                    onClick={() => {
                      setMenuOpen(false);
                      void actions.hardDelete([file.id]);
                    }}
                    disabled={busy}
                  >
                    <TrashIcon className="actions-menu-item-icon" />
                    Удалить навсегда
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
};

export default FileRow;
