import { authApi as api } from "../auth/authApi";


export interface User {
  id: number;
  username: string;
  full_name: string;
  email: string;
  is_admin: boolean;
  is_active: boolean;
  files_count?: number;
  files_total_size?: number;
}

export type PatchFields = Partial<
  Pick<User, "email" | "full_name" | "is_admin" | "is_active">
>;

export interface PaginatedUsersResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: User[];

  // На случай разных форматов ответа (исторические/альтернативные)
  items?: User[];
  data?: User[];
}

export type ListUsersArgs =
  | {
      q?: string;
      page?: number;
      pageSize?: number;
    }
  | void;

const apiWithUsersTags = api.enhanceEndpoints({ addTagTypes: ["Users"] });

export const usersApi = apiWithUsersTags.injectEndpoints({

  endpoints: (b) => ({
    listUsers: b.query<PaginatedUsersResponse, ListUsersArgs>({
      query: (args) => {
        const page = args?.page ?? 1;
        const pageSize = args?.pageSize ?? 20;

        const params: Record<string, string | number> = {
          page,
          page_size: pageSize,
        };

        if (args?.q) params.q = args.q;

        return { url: "/auth/admin/users", params };
      },
      providesTags: (result) => {
        const base = [{ type: "Users" as const, id: "LIST" }];

        return result?.results
          ? [
              ...result.results.map((u) => ({ type: "Users" as const, id: u.id })),
              ...base,
            ]
          : base;
      },
    }),

    patchUser: b.mutation<User, { id: number; patch: PatchFields }>({
      query: ({ id, patch }) => ({
        url: `/auth/admin/users/${id}`,
        method: "PATCH",
        body: patch,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "Users", id },
        { type: "Users", id: "LIST" },
      ],
    }),

    deleteUser: b.mutation<{ status: string }, number>({
      query: (id) => ({
        url: `/auth/admin/users/${id}/delete`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, id) => [
        { type: "Users", id },
        { type: "Users", id: "LIST" },
      ],
    }),

    purgeUser: b.mutation<{ status: string }, number>({
      query: (id) => ({
        url: `/auth/admin/users/${id}/purge`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, id) => [
        { type: "Users", id },
        { type: "Users", id: "LIST" },
      ],
    }),
  }),
  overrideExisting: true,
});

export const {
  useListUsersQuery,
  usePatchUserMutation,
  useDeleteUserMutation,
  usePurgeUserMutation,
} = usersApi;
