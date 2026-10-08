import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

// Define the User type based on your schema
export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'recruiter' | 'candidate'
  hasRecruiterProfile?: boolean
}

// Define the Auth State
interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean

  // Actions
  login: (user: User, token: string) => void
  logout: () => void
  updateUser: (user: Partial<User>) => void
  setLoading: (isLoading: boolean) => void
}

// Create the store with devtools middleware
export const useAuthStore = create<AuthState>()(
  devtools(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: true, // Start in loading state until Amplify checks session

      login: (user, token) =>
        set(
          {
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
          },
          false,
          'auth/login',
        ),

      logout: () =>
        set(
          {
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
          },
          false,
          'auth/logout',
        ),

      updateUser: (updatedUser) =>
        set(
          (state) => ({
            user: state.user ? { ...state.user, ...updatedUser } : null,
          }),
          false,
          'auth/updateUser',
        ),

      setLoading: (isLoading) => set({ isLoading }, false, 'auth/setLoading'),
    }),
    { name: 'AuthStore' }, // Name for Redux DevTools
  ),
)
