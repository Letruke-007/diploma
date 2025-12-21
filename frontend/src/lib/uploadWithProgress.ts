export type ProgressCb = (percent: number) => void;

function getCookie(name: string): string | undefined {
  const cookies = document.cookie ? document.cookie.split("; ") : [];
  for (const c of cookies) {
    const eq = c.indexOf("=");
    if (eq === -1) continue;

    const k = c.slice(0, eq);
    const v = c.slice(eq + 1);
    if (k === name) return decodeURIComponent(v);
  }
  return undefined;
}

function uploadOne(
  file: File,
  onDeltaBytes: (delta: number) => void,
  endpoint = "/api/files/",
  fieldName = "file",
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint, true);
    xhr.withCredentials = true;

    const csrf = getCookie("csrftoken");
    if (csrf) xhr.setRequestHeader("X-CSRFToken", csrf);
    xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");

    let lastLoaded = 0;
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;

      const delta = e.loaded - lastLoaded;
      lastLoaded = e.loaded;
      onDeltaBytes(delta);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new Error(`Upload failed: ${xhr.status}`));
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
): Promise<void> {
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  let uploadedBytes = 0;

  const report = () => {
    const percent =
      totalBytes === 0
        ? 0
        : Math.min(100, Math.round((uploadedBytes / totalBytes) * 100));
    onProgress(percent);
  };

  report();
  for (const f of files) {
    await uploadOne(
      f,
      (delta) => {
        uploadedBytes += delta;
        report();
      },
      endpoint,
      fieldName,
    );
  }
  report();
}
