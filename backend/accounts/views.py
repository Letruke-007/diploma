import logging

from django.contrib.auth import authenticate, login, logout
from django.core.exceptions import ValidationError
from django.db.models import Q
from django.db import IntegrityError
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie


from rest_framework import status
from rest_framework.authentication import SessionAuthentication
from rest_framework.decorators import (
    api_view,
    permission_classes,
    authentication_classes,
)
from rest_framework.permissions import AllowAny, BasePermission
from rest_framework.response import Response

from .models import User
from .serializers import (
    UserPublicSerializer,
    RegisterSerializer,
    LoginSerializer,
)

logger = logging.getLogger(__name__)


# ---- CSRF-exempt Session auth ----
class CsrfExemptSessionAuthentication(SessionAuthentication):
    """
    SessionAuthentication без CSRF-проверки, чтобы не получать 403 из-за CSRF.
    """

    def enforce_csrf(self, request):
        return


# ---- Permissions (используются только в тестах напрямую) ----
class AdminOnly(BasePermission):
    """Доступ только пользователям с флагом is_admin=True."""

    def has_permission(self, request, view):
        u = getattr(request, "user", None)
        return bool(
            u
            and getattr(u, "is_authenticated", False)
            and getattr(u, "is_admin", False)
        )


# ---- Вспомогательные функции аутентификации ----
def _require_auth(request):
    """
    Явная проверка аутентификации.

    Если пользователь не аутентифицирован — Response(401),
    иначе None.
    """
    user = getattr(request, "user", None)
    if not user or not getattr(user, "is_authenticated", False):
        return Response(
            {"detail": "Authentication credentials were not provided."},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    return None


def _require_admin(request):
    """
    Проверка: пользователь аутентифицирован и is_admin=True.

    Возвращает:
    - 401, если не аутентифицирован
    - 403, если не админ
    - None, если всё ок
    """
    unauth = _require_auth(request)
    if unauth:
        return unauth

    if not getattr(request.user, "is_admin", False):
        return Response(
            {"detail": "You do not have permission to perform this action."},
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


# ---- CSRF helper ----
@api_view(["GET"])
@permission_classes([AllowAny])
@ensure_csrf_cookie
def csrf(request):
    return Response({"detail": "ok"})


# ---- Auth ----
@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    """
    POST /api/auth/register
    body: { username, full_name, email, password }
    """
    ser = RegisterSerializer(data=request.data)
    if not ser.is_valid():
        return Response(
            {"errors": ser.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        user = User.objects.create_user(
            username=ser.validated_data["username"],
            email=ser.validated_data["email"],
            full_name=ser.validated_data["full_name"],
            password=ser.validated_data["password"],
        )
    except ValidationError as e:
        errors = getattr(e, "message_dict", None)
        if not errors:
            errors = {"non_field_errors": getattr(e, "messages", ["Некорректные данные"])}
        return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)

    except IntegrityError:
        errors = {}
        if User.objects.filter(username=ser.validated_data["username"]).exists():
            errors["username"] = ["Пользователь с таким логином уже существует"]
        if User.objects.filter(email=ser.validated_data["email"]).exists():
            errors["email"] = ["Пользователь с таким email уже существует"]
        if not errors:
            errors["non_field_errors"] = ["Пользователь с такими данными уже существует"]
        return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)

    except Exception:
        logger.exception("register failed")
        return Response(
            {"detail": "Registration failed"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    login(request, user)
    return Response(
        UserPublicSerializer(user).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    """
    POST /api/auth/login
    body: { username, password }
    """
    ser = LoginSerializer(data=request.data)
    if not ser.is_valid():
        return Response(
            {"errors": ser.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = authenticate(
        request,
        username=ser.validated_data["username"],
        password=ser.validated_data["password"],
    )
    if not user:
        return Response(
            {"detail": "Пользователь с таким именем не существует"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not user.is_active:
        return Response(
            {"detail": "Пользователь деактивирован, вход невозможен"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    login(request, user)
    return Response(
        UserPublicSerializer(user).data,
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
@authentication_classes([CsrfExemptSessionAuthentication])
def logout_view(request):
    """
    POST /api/auth/logout
    """
    unauth = _require_auth(request)
    if unauth:
        return unauth

    logout(request)
    return Response(
        {"detail": "Logged out"},
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([AllowAny])
@authentication_classes([CsrfExemptSessionAuthentication])
def me(request):
    """
    GET /api/auth/me
    """
    unauth = _require_auth(request)
    if unauth:
        return unauth

    return Response(UserPublicSerializer(request.user).data)


# ---- Admin API (legacy / tests) ----
@api_view(["GET"])
@permission_classes([AllowAny])
@authentication_classes([CsrfExemptSessionAuthentication])
def admin_users(request):
    perm = _require_admin(request)
    if perm:
        return perm

    try:
        qs = User.objects.all().order_by("id")

        q = request.query_params.get("q")
        if q:
            qs = qs.filter(
                Q(username__icontains=q)
                | Q(email__icontains=q)
                | Q(full_name__icontains=q)
            )

        rows = list(
            qs.values(
                "id",
                "username",
                "full_name",
                "email",
                "is_admin",
                "is_active",
                "date_joined",
            )
        )

        for r in rows:
            dj = r.get("date_joined")
            if dj is not None and hasattr(dj, "isoformat"):
                r["date_joined"] = dj.isoformat()

        return Response({"results": rows}, status=status.HTTP_200_OK)

    except Exception as e:
        logger.exception("admin_users failed")
        return Response(
            {"detail": "internal error", "error": str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["PATCH"])
@permission_classes([AllowAny])
@authentication_classes([CsrfExemptSessionAuthentication])
def admin_patch_user(request, pk: int):
    perm = _require_admin(request)
    if perm:
        return perm

    try:
        user = User.objects.get(pk=pk)
    except User.DoesNotExist:
        return Response(
            {"detail": "User not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    if user.pk == request.user.pk and "is_active" in request.data:
        val = str(request.data["is_active"]).lower()
        if val in ("0", "false", "no"):
            return Response(
                {"detail": "You cannot deactivate yourself"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    allowed = {
        "email",
        "full_name",
        "is_admin",
        "is_active",
        "is_staff",
        "is_superuser",
    }
    payload = {k: v for k, v in request.data.items() if k in allowed}

    def _to_bool(x):
        if isinstance(x, bool):
            return x
        if isinstance(x, (int, float)):
            return bool(x)
        if isinstance(x, str):
            return x.strip().lower() not in ("0", "false", "no", "off", "")
        return bool(x)

    for b in ("is_admin", "is_active", "is_staff", "is_superuser"):
        if b in payload:
            payload[b] = _to_bool(payload[b])

    if not payload:
        return Response(
            {"detail": "No fields to update"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    for k, v in payload.items():
        setattr(user, k, v)

    user.save(update_fields=list(payload.keys()))

    out = {
        "id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "email": user.email,
        "is_admin": user.is_admin,
        "is_active": user.is_active,
        "date_joined": (
            user.date_joined.isoformat()
            if hasattr(user.date_joined, "isoformat")
            else user.date_joined
        ),
    }
    return Response(out, status=status.HTTP_200_OK)


@api_view(["DELETE"])
@permission_classes([AllowAny])
@authentication_classes([CsrfExemptSessionAuthentication])
def admin_delete_user(request, pk: int):
    perm = _require_admin(request)
    if perm:
        return perm

    try:
        user = User.objects.get(pk=pk)
    except User.DoesNotExist:
        return Response(
            {"detail": "User not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    if user.pk == request.user.pk:
        return Response(
            {"detail": "You cannot deactivate yourself"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user.is_active = False
    if hasattr(user, "date_deleted"):
        user.date_deleted = timezone.now()
        user.save(update_fields=["is_active", "date_deleted"])
    else:
        user.save(update_fields=["is_active"])

    return Response(
        {"status": "deactivated"},
        status=status.HTTP_200_OK,
    )
