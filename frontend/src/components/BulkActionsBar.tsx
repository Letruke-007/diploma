import React, { useState } from "react";
import { apiFetch as fetchApi } from "../app/api";

function getCookie(name: string): string | undefined {
  const m = document.cookie.match("(^|;)\\s*" + name + "\\s*=\\s*([^;]+)");
  return m ? decodeURIComponent(m.pop()!) : undefined;
}
let csrfTokenCache: string | null = null;
async function ensureCsrf(): Promise<string> {
  if (csrfTokenCache) return csrfTokenCache;
  const fromCookie = getCookie("csrftoken");
  if (fromCookie) return (csrfTokenCache = fromCookie);
  const resp = await fetchApi("/api/auth/csrf", { method: "GET" });
  if (!resp.ok) throw new Error(`Failed to init CSRF: ${resp.status}`);
  const after = getCookie("csrftoken");
  if (!after) throw new Error("CSRF cookie not found after /api/auth/csrf");
  return (csrfTokenCache = after);
}

type Props = {
  selectedIds: number[];
  onDeleted: (deletedIds: number[]) => void;
  clearSelection: () => void;
};

const BulkActionsBar: React.FC<Props> = ({ selectedIds, onDeleted, clearSelection }) => {
  const [busy, setBusy] = useState(false);
  const canDelete = selectedIds.length > 1;

  const handleDeleteSelected = async () => {
    if (!canDelete || busy) return;
    if (!confirm(`Удалить выбранные файлы (${selectedIds.length} шт.)?`)) return;

    setBusy(true);
    try {
      await ensureCsrf();
      const deletedIds: number[] = [];
      for (const id of selectedIds) {
        const resp = await fetchApi(`/api/files/${id}/delete`, {
          method: "DELETE",
          headers: { "X-Requested-With": "XMLHttpRequest" },
        });
        if (resp.ok) deletedIds.push(id);
      }
      if (deletedIds.length === 0) {
        alert("Не удалось удалить выбранные файлы.");
        return;
      }
      onDeleted(deletedIds);
      clearSelection();
    } catch {
      alert("Ошибка при удалении выбранных файлов.");
    } finally {
      setBusy(false);
    }
  };

  if (!canDelete) return null;

  return (
    <div className="bulk-actions" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
      <button
        type="button"
        className="btn btn--danger"
        onClick={handleDeleteSelected}
        disabled={busy}
        title="Удалить выбранные"
      >
        🗑️ Удалить выбранные ({selectedIds.length})
      </button>
    </div>
  );
};

export default BulkActionsBar;
