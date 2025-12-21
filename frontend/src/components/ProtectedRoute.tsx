import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useMeQuery } from "../features/auth/authApi";

type Props = {
  children: ReactNode;
  adminOnly?: boolean;
};

export default function ProtectedRoute({
  children,
  adminOnly = false,
}: Props) {
  const location = useLocation();
  const { data: me, isLoading, isError } = useMeQuery();

  if (isError || (!isLoading && !me)) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="panel" style={{ padding: 16 }}>
        Загрузка…
      </div>
    );
  }

  if (adminOnly && !me!.is_admin) {
    return <Navigate to="/files" replace />;
  }

  return <>{children}</>;
}
