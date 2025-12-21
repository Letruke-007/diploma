import { authApi as api } from "../auth/authApi";

export type FilesView = "my" | "recent" | "trash";

export interface StoredFile {
  id: number;
  original_name: string;
  size: number;
  uploaded_at: string;
  last_downloaded_at?: string | null;
  comment: string;
  has_public_link: boolean;

  is_deleted?: boolean;
  deleted_at?: string | null;

  is_folder?: boolean;
  parent?: number | null;

  deleted_from?: number | null;
  deleted_from_path?: string | null;
}

export interface PaginatedFilesResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: StoredFile[];

  // На случай разных форматов ответа (исторические/альтернативные)
  items?: StoredFile[];
  data?: StoredFile[];
}

export interface StorageUsageResponse {
  used_bytes: number;
  quota_bytes: number;
}

export interface IssuePublicResponse {
  token: string;
}

export interface RevokePublicResponse {
  status: string;
}

export type ListArgs =
  | {
      user?: number;
      page?: number;
      pageSize?: number;
      view?: FilesView;
      parent?: number | null;
    }
  | void;

export const filesApi = api.injectEndpoints({
  endpoints: (b) => ({
    listFiles: b.query<PaginatedFilesResponse, ListArgs>({
      query: (args) => {
        const page = args && "page" in args && args.page ? args.page : 1;
        const pageSize =
          args && "pageSize" in args && args.pageSize ? args.pageSize : 20;
        const view: FilesView =
          args && "view" in args && args.view ? args.view : "my";

        const params: Record<string, string | number> = {
          page,
          page_size: pageSize,
          view,
        };

        if (args && "user" in args && args.user) params.user = args.user;
        if (args && "parent" in args && typeof args.parent === "number") {
          params.parent = args.parent;
        }

        return { url: "/files/", params };
      },

      // LIST — общий тег для обновления любого списка;
      // LIST:<parent> — точечное обновление конкретной папки.
      providesTags: (result, _error, args) => {
        const parentKey = args?.parent ?? "root";

        const base = [
          { type: "Files" as const, id: "LIST" },
          { type: "Files" as const, id: `LIST:${parentKey}` },
        ];

        return result
          ? [
              ...result.results.map((f) => ({
                type: "Files" as const,
                id: f.id,
              })),
              ...base,
            ]
          : base;
      },
    }),

    uploadFile: b.mutation<
      StoredFile,
      { file: File; comment?: string; parent?: number | null; userId?: number }
    >({
      query: ({ file, comment, parent, userId }) => {
        const formData = new FormData();
        formData.append("file", file);
        if (comment) formData.append("comment", comment);

        // Поддержка нескольких возможных имён параметра папки на бэке
        if (typeof parent === "number") {
          const v = String(parent);
          formData.append("parent", v);
          formData.append("folder", v);
          formData.append("folder_id", v);
        }

        const url = userId ? `/files/?user=${encodeURIComponent(String(userId))}` : "/files/";
        return { url, method: "POST", body: formData };

      },
      invalidatesTags: [{ type: "Files", id: "LIST" }, "Usage"],
    }),

    createFolder: b.mutation<
      { id: number; original_name: string; is_folder?: boolean; parent?: number | null },
      { name: string; parent?: number | null; userId?: number }
    >({
      query: ({ name, parent, userId }) => ({
        url: userId ? `/folders/?user=${encodeURIComponent(String(userId))}` : "/folders/",
        method: "POST",
        body: { name, parent: parent ?? null },
      }),
      invalidatesTags: (_res, _err, args) => [
        { type: "Files", id: "LIST" },
        { type: "Files", id: `LIST:${args.parent ?? "root"}` },
      ],
    }),

    bulkMove: b.mutation<{ moved: number }, { ids: number[]; parent: number | null }>({
      query: ({ ids, parent }) => ({
        url: "/files/bulk-move/",
        method: "POST",
        body: { ids, parent },
      }),
      invalidatesTags: (_res, _err, args) => [
        { type: "Files", id: "LIST" },
        { type: "Files", id: `LIST:${args.parent ?? "root"}` },
        { type: "Files", id: "LIST:root" },
      ],
    }),

    deleteFile: b.mutation<{ status: string }, number>({
      query: (id) => ({
        url: `/files/${id}/delete/`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, id) => [
        { type: "Files", id },
        { type: "Files", id: "LIST" },
        "Usage",
      ],
    }),

    restoreFile: b.mutation<StoredFile, number>({
      query: (id) => ({
        url: `/files/${id}/restore/`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, id) => [
        { type: "Files", id },
        { type: "Files", id: "LIST" },
        "Usage",
      ],
    }),

    patchFile: b.mutation<
      StoredFile,
      {
        id: number;
        comment?: string | null;
        original_name?: string;
        name?: string;
        parent?: number | null;
      }
    >({
      query: ({ id, ...body }) => ({
        url: `/files/${id}/`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_res, _err, { id }) => [
        { type: "Files", id },
        { type: "Files", id: "LIST" },
      ],
    }),

    downloadFile: b.query<Blob, number>({
      query: (id) => ({
        url: `/files/${id}/download/`,
        responseHandler: async (response: Response) => await response.blob(),
      }),
    }),

    issuePublic: b.mutation<IssuePublicResponse, number>({
      query: (id) => ({
        url: `/files/${id}/public-link/`,
        method: "POST",
      }),
      invalidatesTags: (_res, _err, id) => [
        { type: "Files", id },
        { type: "Files", id: "LIST" },
      ],
    }),

    revokePublic: b.mutation<RevokePublicResponse, number>({
      query: (id) => ({
        url: `/files/${id}/public-link/delete/`,
        method: "POST",
      }),
      invalidatesTags: (_res, _err, id) => [
        { type: "Files", id },
        { type: "Files", id: "LIST" },
      ],
    }),

    patchFolder: b.mutation<any, { id: number; name: string }>({
      query: ({ id, name }) => ({
        url: `/folders/${id}/`,
        method: "PATCH",
        body: { name },
      }),
      invalidatesTags: (_res, _err, { id }) => [
        { type: "Files", id },
        { type: "Files", id: "LIST" },
      ],
    }),

    storageUsage: b.query<StorageUsageResponse, void>({
      query: () => ({ url: "/files/usage/" }),
      providesTags: ["Usage"],
    }),
  }),
  overrideExisting: true,
});

export const {
  useListFilesQuery,
  useUploadFileMutation,
  useDeleteFileMutation,
  useRestoreFileMutation,
  usePatchFileMutation,
  usePatchFolderMutation,
  useDownloadFileQuery,
  useIssuePublicMutation,
  useCreateFolderMutation,
  useRevokePublicMutation,
  useBulkMoveMutation,
  useStorageUsageQuery,
} = filesApi;