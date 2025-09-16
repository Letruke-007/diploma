import { api } from '../../app/api'

export interface User {
  id: number
  username: string
  full_name: string
  email: string
  is_admin: boolean
  is_active: boolean
  files_count?: number
  files_total_size?: number
}

type PatchFields = Partial<Pick<User, 'email' | 'full_name' | 'is_admin' | 'is_active'>>

export const usersApi = api.injectEndpoints({
  endpoints: (b) => ({
    listUsers: b.query<{ results: User[] }, { q?: string } | void>({
      query: (args) => {
        const params: Record<string, any> = {}
        if (args && typeof args === 'object' && 'q' in args && args.q) params.q = args.q
        return { url: '/auth/admin/users', params }
      },
      providesTags: ['Users'],
    }),

    patchUser: b.mutation<User, { id: number; patch: PatchFields }>({
      query: ({ id, patch }) => ({
        url: `/auth/admin/users/${id}`,
        method: 'PATCH',
        body: patch,
      }),
      invalidatesTags: ['Users'],
    }),

    deleteUser: b.mutation<{ status: string }, number>({
      query: (id) => ({
        url: `/auth/admin/users/${id}/delete`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Users'],
    }),
  }),
})

export const { useListUsersQuery, usePatchUserMutation, useDeleteUserMutation } = usersApi
