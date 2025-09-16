import { useRef, useState } from "react";
import { useUploadFileMutation } from "../features/files/filesApi";

export default function UploadForm() {
  const [upload, { isLoading }] = useUploadFileMutation();
  const [comment, setComment] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await upload({ file, comment }).unwrap();
    setComment("");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="upload-box">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        <input
          type="file"
          onChange={onChange}
          ref={inputRef}
          disabled={isLoading}
        />
        <input
          placeholder="Комментарий"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <button
          className="btn"
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isLoading}
        >
          {isLoading ? "Загрузка…" : "Выбрать файл"}
        </button>
      </div>
      <div className="help" style={{ marginTop: 8 }}>
        Можно добавить комментарий перед загрузкой
      </div>
    </div>
  );
}
