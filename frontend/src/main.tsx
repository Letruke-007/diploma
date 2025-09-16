import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { store } from './app/store'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import Files from './pages/Files'
import Admin from './pages/Admin'
import Navbar from './components/Navbar'
import './styles.css'

const router = createBrowserRouter([
  { path: '/', element: <><Navbar/><Home/></> },
  { path: '/login', element: <><Navbar/><Login/></> },
  { path: '/register', element: <><Navbar/><Register/></> },
  { path: '/files', element: <><Navbar/><Files/></> },
  { path: '/admin', element: <><Navbar/><Admin/></> },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  </React.StrictMode>
)