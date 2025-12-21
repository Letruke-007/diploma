import type { FC } from "react";

import DocIcon from "./DocIcon";
import PdfIcon from "./PdfIcon";
import SheetIcon from "./SheetIcon";
import ImageIcon from "./ImageIcon";
import ArchiveIcon from "./ArchiveIcon";
import OtherIcon from "./OtherIcon";

export type FileKind =
  | "doc"
  | "pdf"
  | "sheet"
  | "image"
  | "archive"
  | "other";

/**
 * Централизованная таблица соответствия:
 *   тип → React-компонент.
 *
 * Легко расширяется, минимум изменений в коде.
 */
const ICON_MAP: Record<FileKind, FC> = {
  doc: DocIcon,
  pdf: PdfIcon,
  sheet: SheetIcon,
  image: ImageIcon,
  archive: ArchiveIcon,
  other: OtherIcon,
};

interface Props {
  kind: FileKind;
  title?: string;
}

/**
 * Универсальный компонент иконки типа файла.
 *
 * Позволяет:
 * - единообразно отображать иконки;
 * - прикреплять tooltip через title;
 * - применять глобальный CSS через класс `file-type-icon`.
 */
const FileTypeIcon: FC<Props> = ({ kind, title }) => {
  const IconComponent = ICON_MAP[kind] ?? OtherIcon;

  return (
    <span
      className="file-type-icon"
      title={title}
      style={{
        display: "inline-flex",
        width: "20px",
        height: "20px",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <IconComponent />
    </span>
  );
};

export default FileTypeIcon;
