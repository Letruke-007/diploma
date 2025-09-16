import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import FileRow from "../components/FileRow";
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

export default function Files() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [commentBeforeUpload, setCommentBeforeUpload] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [inflightUploads, setInflightUploads] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const location = useLocation();
  const userParam = useMemo(() => {
    const sp = new URLSearchParams(location.search);
    const id = sp.get("user");
    return id && /^\d+$/.test(id) ? id : null;
  }, [location.search]);

  function normalizeList(data: unknown): FileItem[] {
    if (Array.isArray(data)) return data as FileItem[];
    if (data && typeof data === "object") {
      const anyData = data as Record<string, unknown>;
      return (anyData.items ?? anyData.results ?? anyData.data ?? []) as FileItem[];
    }
    return [];
  }

  const fetchFiles = async () => {
    const url = userParam ? `/api/files?user=${userParam}` : `/api/files`;
    const resp = await fetchApi(url);
    if (!resp.ok) throw new Error(String(resp.status));
    const data = await resp.json();
    setFiles(normalizeList(data));
  };

  useEffect(() => {
    fetchFiles().catch(() => setFiles([]));
  }, [userParam]);

  const onFileUpdated = (updated: FileItem) => {
    setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
  };

  const onFileDeleted = (id: number) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setSelectedIds((s) => {
      const ns = new Set(s);
      ns.delete(id);
      return ns;
    });
  };

  const handleUploadMany = async (picked: File[]) => {
    if (!picked.length) return;
    setBusy(true);
    setInflightUploads((n) => n + picked.length);
    try {
      await Promise.all(
        picked.map(async (file) => {
          const fd = new FormData();
          fd.append("file", file);
          const c = commentBeforeUpload.trim();
          if (c) fd.append("comment", c);
          const resp = await fetchApi("/api/files", { method: "POST", body: fd });
          if (!resp.ok) throw new Error(String(resp.status));
          setInflightUploads((n) => Math.max(0, n - 1));
        })
      );
      await fetchFiles();
      setCommentBeforeUpload("");
    } finally {
      setBusy(false);
      setInflightUploads(0);
    }
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    void handleUploadMany(list);
    e.currentTarget.value = "";
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const list = Array.from(e.dataTransfer.files || []);
    void handleUploadMany(list);
  };

  const toggleSelect = (id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const s = new Set(prev);
      checked ? s.add(id) : s.delete(id);
      return s;
    });
  };

  const selectAll = () => setSelectedIds(new Set(files.map((f) => f.id)));

  const downloadSelectedZip = async () => {
    if (selectedIds.size < 2) return;
    setBusy(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();

      const ids = Array.from(selectedIds);
      for (const id of ids) {
        const meta = files.find((f) => f.id === id);
        if (!meta) continue;
        const resp = await fetchApi(`/api/files/${id}/download`);
        if (!resp.ok) continue;
        const blob = await resp.blob();

        const base = meta.original_name || `file_${id}`;
        let candidate = base;
        let idx = 1;
        while (zip.file(candidate) != null) {
          const dot = base.lastIndexOf(".");
          candidate = dot > 0 ? `${base.slice(0, dot)}(${idx})${base.slice(dot)}` : `${base}(${idx})`;
          idx += 1;
        }
        zip.file(candidate, blob);
      }

      const content = await zip.generateAsync({ type: "blob" });
      const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(content);
      a.download = `mycloud_${stamp}.zip`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(a.href);
      a.remove();
    } finally {
      setBusy(false);
    }
  };

  const deleteSelected = async () => {
    if (selectedIds.size < 1) return;
    if (!confirm(`Удалить выбранные файлы (${selectedIds.size} шт.)?`)) return;
    setBusy(true);
    try {
      const ids = Array.from(selectedIds);
      const deleted: number[] = [];
      for (const id of ids) {
        const resp = await fetchApi(`/api/files/${id}/delete`, {
          method: "DELETE",
          headers: { "X-Requested-With": "XMLHttpRequest" },
        });
        if (resp.ok) deleted.push(id);
      }
      if (deleted.length > 0) {
        setFiles((prev) => prev.filter((f) => !deleted.includes(f.id)));
        setSelectedIds(new Set());
      } else {
        alert("Не удалось удалить выбранные файлы");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      {inflightUploads > 0 && (
        <aside className="upload-sidebar">
          <div className="title">Загрузка файлов</div>
          <div className="row">
            <span className="upload-spinner" /> Идёт загрузка…
          </div>
          <div className="row">В очереди: {inflightUploads}</div>
        </aside>
      )}

      <h2>Мои файлы</h2>

      <div className="card upload-card">
        <input
          id="upload-input"
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={onInputChange}
          disabled={busy}
        />
        <div
          className={`dropzone${dragOver ? " dragover" : ""}`}
          onClick={() => fileInputRef.current?.click()}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          role="button"
          aria-label="Загрузить файлы"
          tabIndex={0}
        >
          <div className="dz-title">Перетащите файлы сюда или нажмите, чтобы выбрать</div>
          <div className="dz-controls">
            <div className="input-wrap">
              <input
                placeholder="Комментарий (добавится ко всем загруженным)"
                value={commentBeforeUpload}
                onChange={(e) => setCommentBeforeUpload(e.target.value)}
                className="input input--comment"
                disabled={busy}
                maxLength={200}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              />
              <div className="input-hint">Можно оставить пустым. До 200 символов.</div>
            </div>
          </div>
          <div className="dz-hint">Можно выбрать сразу несколько файлов</div>
        </div>
      </div>

      {files.length > 0 && (
        <>
          {selectedIds.size > 0 && (
            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
                margin: "8px 0",
              }}
            >
              <button className="btn btn--secondary" onClick={selectAll} disabled={busy}>
                Выбрать все
              </button>
              {selectedIds.size >= 2 && (
                <button className="btn" onClick={downloadSelectedZip} disabled={busy}>
                  Скачать архив
                </button>
              )}
              {selectedIds.size >= 2 && (
                <button className="btn btn--danger" onClick={deleteSelected} disabled={busy}>
                  Удалить выбранные
                </button>
              )}
            </div>
          )}

          <div className="table-wrap">
            <table className="table table-files">
              <colgroup>
                <col className="col-check" />
                <col className="col-name" />
                <col className="col-size" />
                <col className="col-up" />
                <col className="col-down" />
                <col className="col-comment" />
                <col className="col-link" />
                <col className="col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th className="col-select" />
                  <th className="col-name">Имя файла</th>
                  <th>Размер</th>
                  <th>Загружен</th>
                  <th>Скачан</th>
                  <th>Комментарий</th>
                  <th>Ссылка</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <FileRow
                    key={f.id}
                    file={f}
                    selected={selectedIds.has(f.id)}
                    onToggleSelect={toggleSelect}
                    onFileUpdated={onFileUpdated}
                    onFileDeleted={onFileDeleted}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
