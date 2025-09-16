import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useMeQuery } from "../features/auth/authApi";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMeQuery();

  if (isLoading) {
    return <div className="panel" style={{ padding: 16 }}>Загрузка…</div>;
  }
  if (!me) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
