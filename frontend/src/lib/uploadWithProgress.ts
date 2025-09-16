export type ProgressCb = (percent: number) => void;

async function uploadOne(
  file: File,
  onDeltaBytes: (delta: number) => void,
  endpoint = "/api/files",
  fieldName = "file",
) {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint, true);

    let lastLoaded = 0;
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const delta = e.loaded - lastLoaded;
      lastLoaded = e.loaded;
      onDeltaBytes(delta);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Network error"));

    const fd = new FormData();
    fd.append(fieldName, file);
    xhr.send(fd);
  });
}

export async function uploadFilesSequential(
  files: File[],
  onProgress: ProgressCb,
  endpoint?: string,
  fieldName?: string,
) {
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  let uploadedBytes = 0;

  const report = () => {
    const percent = totalBytes === 0 ? 0 : Math.min(100, Math.round((uploadedBytes / totalBytes) * 100));
    onProgress(percent);
  };

  report(); // 0%
  for (const f of files) {
    await uploadOne(
      f,
      (delta) => {
        uploadedBytes += delta;
        report();
      },
      endpoint,
      fieldName
    );
  }
  report(); // 100%
}
