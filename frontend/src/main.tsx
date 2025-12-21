import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import { store } from "./app/store";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Files from "./pages/Files";
import Admin from "./pages/Admin";
import MainLayout from "./layouts/MainLayout";
import ProtectedRoute from "./components/ProtectedRoute";

import "./styles/base.css";
import "./styles/components.css";
import "./styles/files-page.css";
import "./styles/auth.css";
import "./styles/admin.css";
import "./styles/home.css";

const router = createBrowserRouter([
  {
    element: <MainLayout />,
    children: [
      // Главная страница (лендинг). Авторизованных Home сам уводит в /files
      { path: "/", element: <Home /> },

      { path: "/login", element: <Login /> },
      { path: "/register", element: <Register /> },

      // Мой диск
      {
        path: "/files",
        element: (
          <ProtectedRoute>
            <Files />
          </ProtectedRoute>
        ),
      },

      // Недавние
      {
        path: "/recent",
        element: (
          <ProtectedRoute>
            <Files />
          </ProtectedRoute>
        ),
      },

      // Корзина
      {
        path: "/trash",
        element: (
          <ProtectedRoute>
            <Files />
          </ProtectedRoute>
        ),
      },

      // Админка
      {
        path: "/admin",
        element: (
          <ProtectedRoute adminOnly>
            <Admin />
          </ProtectedRoute>
        ),
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <Provider store={store}>
    <RouterProvider router={router} />
  </Provider>,
);
