import { createSlice } from '@reduxjs/toolkit'
import type { User } from './authApi'

interface AuthState {
  user?: User
}

const initialState: AuthState = {}

const slice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser(state, action: { payload?: User }) {
      state.user = action.payload
    },
    clearUser(state) {
      state.user = undefined
    }
  }
})

export const { setUser, clearUser } = slice.actions
export default slice.reducer