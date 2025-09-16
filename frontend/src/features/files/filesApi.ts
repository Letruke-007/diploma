import { api } from '../../app/api'

export interface StoredFile {
  id: number
  original_name: string
  size: number
  uploaded_at: string
  last_downloaded_at?: string | null
  comment: string
  has_public_link: boolean
}

type ListArgs = { user?: number } | void

export const filesApi = api.injectEndpoints({
  endpoints: (b) => ({

    listFiles: b.query<{ count?: number; results?: StoredFile[]; items?: StoredFile[]; data?: StoredFile[] }, ListArgs>({
      query: (args) => {
        const params: Record<string, any> = {}
        if (args && typeof args === 'object' && 'user' in args && args.user != null) {
          params.user = args.user
        }
        return { url: '/files', params }
      },
      providesTags: ['Files'],
    }),

    uploadFile: b.mutation<StoredFile, { file: File; comment?: string }>({
      query: ({ file, comment }) => {
        const form = new FormData()
        form.append('file', file)
        if (comment) form.append('comment', comment)
        return { url: '/files', method: 'POST', body: form }
      },
      invalidatesTags: ['Files'],
    }),

    deleteFile: b.mutation<{ status: string }, number>({
      query: (id) => ({ url: `/files/${id}/delete`, method: 'DELETE' }),
      invalidatesTags: ['Files'],
    }),

    patchFile: b.mutation<
      StoredFile,
      { id: number; patch: Partial<Pick<StoredFile, 'original_name' | 'comment'>> }
    >({
      query: ({ id, patch }) => ({ url: `/files/${id}`, method: 'PATCH', body: patch }),
      invalidatesTags: ['Files'],
    }),

    downloadFile: b.query<Blob, number>({
      query: (id) => ({
        url: `/files/${id}/download`,
        responseHandler: (response) => response.blob(),
      }),
    }),

    issuePublic: b.mutation<{ token: string }, number>({
      query: (id) => ({ url: `/files/${id}/public-link`, method: 'POST' }),
      invalidatesTags: ['Files'],
    }),

    revokePublic: b.mutation<{ status: string }, number>({
      query: (id) => ({ url: `/files/${id}/public-link/delete`, method: 'POST' }),
      invalidatesTags: ['Files'],
    }),
  }),
})

export const {
  useListFilesQuery,
  useUploadFileMutation,
  useDeleteFileMutation,
  usePatchFileMutation,
  useDownloadFileQuery,
  useIssuePublicMutation,
  useRevokePublicMutation,
} = filesApi
