/* @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { uploadFilesSequential } from "./uploadWithProgress";

type ProgressHandler = (e: { lengthComputable: boolean; loaded: number }) => void;

class XhrMock {
  static instances: XhrMock[] = [];

  method: string | null = null;
  url: string | null = null;
  async: boolean | null = null;

  withCredentials = false;

  requestHeaders: Record<string, string> = {};
  sentBody: unknown = undefined;

  status = 200;

  upload: { onprogress: ProgressHandler | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  open(method: string, url: string, async: boolean) {
    this.method = method;
    this.url = url;
    this.async = async;
  }

  setRequestHeader(name: string, value: string) {
    this.requestHeaders[name] = value;
  }

  send(body: unknown) {
    this.sentBody = body;
  }

  // helpers for tests
  emitProgress(loaded: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded });
  }

  emitLoad(status = this.status) {
    this.status = status;
    this.onload?.();
  }

  emitError() {
    this.onerror?.();
  }

  constructor() {
    XhrMock.instances.push(this);
  }
}

describe("uploadFilesSequential", () => {
  const realXhr = globalThis.XMLHttpRequest;

  beforeEach(() => {
    XhrMock.instances = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).XMLHttpRequest = XhrMock as any;
    document.cookie = "";
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.XMLHttpRequest = realXhr;
  });

  it("последовательно загружает файлы, выставляет headers/withCredentials и репортит прогресс до 100%", async () => {
    // csrftoken должен попадать в X-CSRFToken
    document.cookie = "csrftoken=abc%20123";

    const onProgress = vi.fn();

    const f1 = new File([new Uint8Array(10)], "a.txt"); // size=10
    const f2 = new File([new Uint8Array(30)], "b.txt"); // size=30
    const total = f1.size + f2.size; // 40

    const promise = uploadFilesSequential(
      [f1, f2],
      onProgress,
      "/api/custom/",
      "upload",
    );

    // Сразу создаётся первый XHR и вызывается начальный report()
    expect(XhrMock.instances).toHaveLength(1);
    const xhr1 = XhrMock.instances[0];

    expect(xhr1.method).toBe("POST");
    expect(xhr1.url).toBe("/api/custom/");
    expect(xhr1.async).toBe(true);
    expect(xhr1.withCredentials).toBe(true);

    expect(xhr1.requestHeaders["X-Requested-With"]).toBe("XMLHttpRequest");
    expect(xhr1.requestHeaders["X-CSRFToken"]).toBe("abc 123");

    // Начальный прогресс: 0%
    expect(onProgress).toHaveBeenCalled();
    expect(onProgress.mock.calls[0][0]).toBe(0);

    // Прогресс по первому файлу (loaded растёт, в коде считается delta)
    xhr1.emitProgress(2); // uploadedBytes=2 => 5%
    xhr1.emitProgress(10); // delta=8, uploadedBytes=10 => 25%
    expect(onProgress).toHaveBeenLastCalledWith(
      Math.min(100, Math.round((10 / total) * 100)),
    );

    // Завершаем первый файл успешно
    xhr1.emitLoad(201);

    // После resolve первого должен стартовать второй
    await Promise.resolve();
    expect(XhrMock.instances).toHaveLength(2);
    const xhr2 = XhrMock.instances[1];

    expect(xhr2.url).toBe("/api/custom/");
    expect(xhr2.requestHeaders["X-Requested-With"]).toBe("XMLHttpRequest");
    expect(xhr2.requestHeaders["X-CSRFToken"]).toBe("abc 123");

    // Прогресс второго файла
    xhr2.emitProgress(15); // uploadedBytes=25 => 63%
    expect(onProgress).toHaveBeenLastCalledWith(
      Math.min(100, Math.round((25 / total) * 100)),
    );

    xhr2.emitProgress(30); // uploadedBytes=40 => 100%
    expect(onProgress).toHaveBeenLastCalledWith(100);

    // Завершаем второй файл
    xhr2.emitLoad(200);

    await promise;

    // Финальный report() после цикла должен дать 100
    expect(onProgress).toHaveBeenLastCalledWith(100);
  });

  it("не стартует следующий файл, пока текущий не завершён (строго sequential)", async () => {
    const onProgress = vi.fn();
    const f1 = new File([new Uint8Array(5)], "a.txt");
    const f2 = new File([new Uint8Array(5)], "b.txt");

    const p = uploadFilesSequential([f1, f2], onProgress);

    expect(XhrMock.instances).toHaveLength(1);

    // пока не завершили первый — второго XHR нет
    await Promise.resolve();
    expect(XhrMock.instances).toHaveLength(1);

    // завершаем первый
    XhrMock.instances[0].emitLoad(200);
    await Promise.resolve();

    // теперь появляется второй
    expect(XhrMock.instances).toHaveLength(2);

    // завершаем второй
    XhrMock.instances[1].emitLoad(200);

    await p;
  });

  it("reject если сервер вернул не-2xx статус", async () => {
    const onProgress = vi.fn();
    const f1 = new File([new Uint8Array(1)], "a.txt");

    const p = uploadFilesSequential([f1], onProgress);

    expect(XhrMock.instances).toHaveLength(1);
    XhrMock.instances[0].emitLoad(500);

    await expect(p).rejects.toThrow("Upload failed: 500");
  });

  it("reject при сетевой ошибке (onerror)", async () => {
    const onProgress = vi.fn();
    const f1 = new File([new Uint8Array(1)], "a.txt");

    const p = uploadFilesSequential([f1], onProgress);

    expect(XhrMock.instances).toHaveLength(1);
    XhrMock.instances[0].emitError();

    await expect(p).rejects.toThrow("Network error");
  });
});
