import { api } from '../../app/api'

export interface User {
  id: number
  username: string
  full_name: string
  email: string
  is_admin: boolean
}

export const authApi = api.injectEndpoints({
  endpoints: (build) => ({
    me: build.query<User, void>({
      query: () => ({ url: '/auth/me' }),
      providesTags: ['Me']
    }),
    login: build.mutation<User, { username: string; password: string }>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
      invalidatesTags: ['Me']
    }),
    logout: build.mutation<{ detail: string }, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
      invalidatesTags: ['Me']
    }),
    register: build.mutation<User, { username: string; full_name: string; email: string; password: string }>({
      query: (body) => ({ url: '/auth/register', method: 'POST', body })
    })
  })
})

export const { useMeQuery, useLoginMutation, useLogoutMutation, useRegisterMutation } = authApi