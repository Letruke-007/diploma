import React, { useState } from "react";
import { apiFetch as fetchApi } from "../app/api";

type FileItem = {
  id: number;
  original_name: string;
  size: number;
  uploaded_at: string;
  last_downloaded_at: string | null;
  comment: string;
  has_public_link: boolean;
  public_token?: string | null;
};

interface Props {
  file: FileItem;
  selected?: boolean;
  onToggleSelect?: (id: number, checked: boolean) => void;
  onFileUpdated: (updated: FileItem) => void;
  onFileDeleted: (id: number) => void;
}

const iconBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 24,
  height: 24,
  padding: 0,
  boxSizing: "border-box",
  borderRadius: 6,
  border: "1px solid #d0d5dd",
  background: "#fff",
  textDecoration: "none",
  whiteSpace: "nowrap",
  lineHeight: 1,
  fontSize: 14,
};

const iconBtnDangerStyle: React.CSSProperties = {
  ...iconBtnStyle,
  borderColor: "#fda4a4",
  background: "#fff0f0",
};

const iconGhostStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 16,
  height: 16,
  padding: 0,
  boxSizing: "border-box",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontSize: 14,
  lineHeight: 1,
  whiteSpace: "nowrap",
};

function getCookie(name: string): string | undefined {
  const m = document.cookie.match("(^|;)\\s*" + name + "\\s*=\\s*([^;]+)");
  return m ? decodeURIComponent(m.pop()!) : undefined;
}

let csrfTokenCache: string | null = null;
async function ensureCsrf(): Promise<string> {
  if (csrfTokenCache) return csrfTokenCache;
  const fromCookie = getCookie("csrftoken");
  if (fromCookie) {
    csrfTokenCache = fromCookie;
    return csrfTokenCache;
  }
  const resp = await fetchApi("/api/auth/csrf", { method: "GET" });
  if (!resp.ok) throw new Error(`Failed to init CSRF: ${resp.status}`);
  const after = getCookie("csrftoken");
  if (!after) throw new Error("CSRF cookie not found after /api/auth/csrf");
  csrfTokenCache = after;
  return csrfTokenCache;
}

async function smartDetailFetch(id: number | string, init: RequestInit): Promise<Response> {
  const primary = `/api/files/${id}`.replace(/\/+$/, "");
  let resp = await fetchApi(primary, init);
  if (resp.status === 404) resp = await fetchApi(`${primary}/`, init);
  return resp;
}

async function smartActionFetch(id: number | string, action: string, init: RequestInit): Promise<Response> {
  const base = `/api/files/${id}`.replace(/\/+$/, "");
  const variants = [`${base}/${action}`, `${base}/${action}/`];
  let last: Response | null = null;
  for (const url of variants) {
    const r = await fetchApi(url, init);
    if (r.status !== 404) return r;
    last = r;
  }
  return last as Response;
}

const FileRow: React.FC<Props> = ({
  file,
  selected = false,
  onToggleSelect,
  onFileUpdated,
  onFileDeleted,
}) => {
  if (!file) return null;

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(file.original_name);
  const [isEditingComment, setIsEditingComment] = useState(false);
  const [commentDraft, setCommentDraft] = useState(file.comment || "");
  const [busy, setBusy] = useState(false);

  const keepExtension = (input: string, fromName: string) => {
    const trimmed = input.trim();
    if (!trimmed) return trimmed;
    const dot = trimmed.lastIndexOf(".");
    if (dot > 0 && dot < trimmed.length - 1) return trimmed;
    const oldDot = fromName.lastIndexOf(".");
    return oldDot > 0 && oldDot < fromName.length - 1 ? `${trimmed}${fromName.slice(oldDot)}` : trimmed;
  };

  const patchFile = async (payload: Partial<FileItem>) => {
    await ensureCsrf();
    const resp = await smartDetailFetch(file.id, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error(`PATCH failed: ${resp.status}`);
    return (await resp.json()) as FileItem;
  };

  const handleRenameSave = async (draft?: string) => {
    const candidate = draft ?? nameDraft;
    const finalName = keepExtension(candidate, file.original_name);
    if (!finalName || finalName === file.original_name) {
      setIsEditingName(false);
      setNameDraft(file.original_name);
      return;
    }
    setBusy(true);
    try {
      const updated = await patchFile({ original_name: finalName });
      onFileUpdated(updated);
      setIsEditingName(false);
    } catch {
      alert("Не удалось переименовать файл");
    } finally {
      setBusy(false);
    }
  };

  const handleCommentSave = async (draft?: string) => {
    const candidate = draft ?? commentDraft;
    setBusy(true);
    try {
      const updated = await patchFile({ comment: candidate });
      onFileUpdated(updated);
      setIsEditingComment(false);
    } catch {
      alert("Не удалось сохранить комментарий");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Удалить файл «${file.original_name}»?`)) return;
    setBusy(true);
    try {
      await ensureCsrf();
      const resp = await smartActionFetch(file.id, "delete", {
        method: "DELETE",
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      if (!resp.ok) throw new Error(`DELETE failed: ${resp.status}`);
      onFileDeleted(file.id);
    } catch {
      alert("Не удалось удалить файл");
    } finally {
      setBusy(false);
    }
  };

  const issuePublicLink = async (): Promise<{ url: string; token: string }> => {
    await ensureCsrf();
    const resp = await smartActionFetch(file.id, "public-link", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
    });
    if (!resp.ok) throw new Error(`Issue link failed: ${resp.status}`);
    const data = await resp.json();
    const token = (data.token ?? data.public_token) as string | undefined;
    if (!token) throw new Error("Сервер не вернул токен публичной ссылки");
    const url = (data.url as string | undefined) ?? `${location.origin}/d/${token}`;
    return { url, token };
  };

  const revokePublicLink = async () => {
    await ensureCsrf();
    const resp = await smartActionFetch(file.id, "public-link/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
    });
    if (!resp.ok) throw new Error(`Revoke link failed: ${resp.status}`);
  };

  const handleCreateOrCopyLink = async () => {
    try {
      const isCreating = !file.has_public_link || !file.public_token;
      if (isCreating) {
        const { url, token } = await issuePublicLink();
        onFileUpdated({ ...file, has_public_link: true, public_token: token });
        try {
          await navigator.clipboard.writeText(url);
          alert("Ссылка создана и скопирована: " + url);
        } catch {
          alert("Ссылка создана: " + url);
        }
        return;
      }
      const url = `${location.origin}/d/${file.public_token}`;
      try {
        await navigator.clipboard.writeText(url);
        alert("Ссылка скопирована: " + url);
      } catch {
        alert("Ссылка: " + url);
      }
    } catch {
      alert("Не удалось создать/скопировать ссылку");
    }
  };

  const handleOpenPublicInline = () => {
    if (!file.public_token) return;
    const inlineUrl = `/d/${file.public_token}?inline=1`;
    window.open(inlineUrl, "_blank", "noopener,noreferrer");
  };

  const handleRevokeLink = async () => {
    if (!confirm("Удалить публичную ссылку?")) return;
    setBusy(true);
    try {
      await revokePublicLink();
      onFileUpdated({ ...file, has_public_link: false, public_token: null });
    } catch {
      alert("Не удалось удалить ссылку");
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadMark = () => {
    onFileUpdated({ ...file, last_downloaded_at: new Date().toISOString() });
  };

  const openRenamePrompt = async () => {
    const current = nameDraft ?? file.original_name;
    const input = window.prompt("Новое имя файла", current);
    if (input === null) return;
    setNameDraft(input);
    await handleRenameSave(input);
  };

  const openCommentPrompt = async () => {
    const current = (commentDraft ?? file.comment ?? "").toString();
    const input = window.prompt("Комментарий к файлу", current);
    if (input === null) return;
    setCommentDraft(input);
    await handleCommentSave(input);
  };

  return (
    <tr>
      <td className="col-select">
        <input
          type="checkbox"
          checked={!!selected}
          aria-checked={!!selected}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect?.(file.id, !selected);
          }}
          aria-label="Выбрать файл"
        />
      </td>

      <td className="col-name" style={{ width: "100%", minWidth: 420 }}>
        {isEditingName ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", width: "100%" }}>
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameSave();
                if (e.key === "Escape") {
                  setIsEditingName(false);
                  setNameDraft(file.original_name);
                }
              }}
              autoFocus
              disabled={busy}
              placeholder="Новое имя файла"
              style={{ flex: 1, minWidth: 360, padding: "6px 10px" }}
            />
            <button className="btn" type="button" onClick={() => handleRenameSave()} disabled={busy}>
              Сохранить
            </button>
            <button
              className="btn btn--secondary"
              onClick={() => {
                setIsEditingName(false);
                setNameDraft(file.original_name);
              }}
              disabled={busy}
            >
              Отмена
            </button>
          </div>
        ) : (
          <div style={{ position: "relative", width: "100%" }}>
            <span
              className="name-text"
              title={file.original_name}
              onDoubleClick={() => setIsEditingName(true)}
            >
              {file.original_name}
            </span>
            <button
              type="button"
              className="rename-btn"
              onClick={() => setIsEditingName(true)}
              disabled={busy}
              title="Переименовать"
              aria-label="Переименовать"
              style={iconGhostStyle}
            >
              ✏️
            </button>
          </div>
        )}
      </td>

      <td>{(file.size / 1024).toFixed(1)} KB</td>
      <td>{new Date(file.uploaded_at).toLocaleString()}</td>
      <td>{file.last_downloaded_at ? new Date(file.last_downloaded_at).toLocaleString() : "—"}</td>

      <td>
        {isEditingComment ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCommentSave();
                if (e.key === "Escape") {
                  setIsEditingComment(false);
                  setCommentDraft(file.comment || "");
                }
              }}
              autoFocus
              disabled={busy}
              placeholder="Комментарий"
              style={{ minWidth: 280, padding: "6px 10px" }}
            />
            <button className="btn" type="button" onClick={() => handleCommentSave()} disabled={busy}>
              Сохранить
            </button>
            <button
              className="btn btn--secondary"
              type="button"
              onClick={() => {
                setIsEditingComment(false);
                setCommentDraft(file.comment || "");
              }}
              disabled={busy}
            >
              Отмена
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span>{file.comment || "—"}</span>
            <button
              type="button"
              onClick={openCommentPrompt}
              disabled={busy}
              title="Изменить комментарий"
              aria-label="Изменить комментарий"
              style={iconGhostStyle}
            >
              ✏️
            </button>
          </div>
        )}
      </td>

      <td>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "nowrap", justifyContent: "center" }}>
          {!file.has_public_link || !file.public_token ? (
            <button
              type="button"
              onClick={handleCreateOrCopyLink}
              disabled={busy}
              title="Создать ссылку"
              aria-label="Создать ссылку"
              style={iconBtnStyle}
            >
              🔗
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleCreateOrCopyLink}
                disabled={busy}
                title="Скопировать ссылку"
                aria-label="Скопировать ссылку"
                style={iconBtnStyle}
              >
                📋
              </button>
              <button
                type="button"
                onClick={handleOpenPublicInline}
                disabled={busy}
                title="Открыть"
                aria-label="Открыть"
                style={iconBtnStyle}
              >
                ↗️
              </button>
              <button
                type="button"
                onClick={handleRevokeLink}
                disabled={busy}
                title="Удалить ссылку"
                aria-label="Удалить ссылку"
                style={iconBtnDangerStyle}
              >
                🗑️
              </button>
            </>
          )}
        </div>
      </td>

      <td>
        <div style={{ display: "flex", gap: 8 }}>
          <a
            href={`/api/files/${file.id}/download`}
            title="Скачать"
            aria-label="Скачать"
            rel="noopener noreferrer"
            style={iconBtnStyle}
            onClick={handleDownloadMark}
          >
            ⬇️
          </a>
          <button
            onClick={handleDelete}
            disabled={busy}
            title="Удалить"
            aria-label="Удалить"
            type="button"
            style={iconBtnDangerStyle}
          >
            🗑️
          </button>
        </div>
      </td>
    </tr>
  );
};

export default FileRow;
