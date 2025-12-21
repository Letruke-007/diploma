import { useState } from "react";
import { useDeleteFileMutation } from "../features/files/filesApi";

type Props = {
  selectedIds: number[];
  onDeleted: (deletedIds: number[]) => void;
  clearSelection: () => void;
};

export default function BulkActionsBar({
  selectedIds,
  onDeleted,
  clearSelection,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [deleteFile] = useDeleteFileMutation();

  const canDelete = selectedIds.length > 1;

  const handleDeleteSelected = async () => {
    if (!canDelete || busy) return;
    if (!confirm(`Удалить выбранные файлы (${selectedIds.length} шт.)?`)) {
      return;
    }

    setBusy(true);
    try {
      const deletedIds: number[] = [];

      for (const id of selectedIds) {
        try {
          await deleteFile(id).unwrap();
          deletedIds.push(id);
        } catch {
          // пропускаем частичные ошибки, чтобы удалить максимум возможного
        }
      }

      if (deletedIds.length === 0) {
        alert("Не удалось удалить выбранные файлы.");
        return;
      }

      onDeleted(deletedIds);
      clearSelection();
    } finally {
      setBusy(false);
    }
  };

  if (!canDelete) return null;

  return (
    <div className="bulk-actions">
      <button
        type="button"
        className="btn btn--danger"
        onClick={handleDeleteSelected}
        disabled={busy}
        title="Удалить выбранные"
      >
        Удалить выбранные ({selectedIds.length})
      </button>
    </div>
  );
}
