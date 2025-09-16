from typing import Any, Dict
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AbstractBaseUser
from django.db.models import Count, Sum
from django.http import Http404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from storageapp.models import StoredFile

User = get_user_model()


def _is_admin(user) -> bool:
    return bool(getattr(user, "is_admin", False) or getattr(user, "is_superuser", False))


def _user_public_dict(u: AbstractBaseUser, aggregates: Dict[int, Dict[str, Any]]) -> Dict[str, Any]:
    agg = aggregates.get(u.id, {}) if aggregates else {}
    return {
        "id": u.id,
        "username": getattr(u, "username", ""),
        "full_name": getattr(u, "full_name", "") or "",
        "email": getattr(u, "email", "") or "",
        "is_admin": bool(getattr(u, "is_admin", False) or getattr(u, "is_superuser", False)),
        "is_active": bool(getattr(u, "is_active", True)),
        "files_count": int(agg.get("files_count") or 0),
        "files_total_size": int(agg.get("files_total_size") or 0),
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_users_list(request):
    if not _is_admin(request.user):
        return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    q = (request.GET.get("q") or "").strip()

    users_qs = User.objects.all().order_by("id")
    if q:
        from django.db.models import Q
        users_qs = users_qs.filter(
            Q(username__icontains=q)
            | Q(full_name__icontains=q)
            | Q(email__icontains=q)
        )

    file_aggs = (
        StoredFile.objects.values("owner_id")
        .annotate(files_count=Count("id"), files_total_size=Sum("size"))
    )
    by_owner: Dict[int, Dict[str, Any]] = {row["owner_id"]: row for row in file_aggs}

    results = [_user_public_dict(u, by_owner) for u in users_qs]
    return Response({"results": results})


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def admin_user_patch(request, pk: int):
    if not _is_admin(request.user):
        return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    try:
        u = User.objects.get(pk=pk)
    except User.DoesNotExist:
        raise Http404

    allowed_fields = {"email", "full_name", "is_admin", "is_active"}
    payload = {k: v for k, v in (request.data or {}).items() if k in allowed_fields}

    if "is_active" in payload and int(pk) == int(request.user.id):
        if not bool(payload["is_active"]):
            return Response(
                {"detail": "Нельзя деактивировать самого себя"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    if "is_admin" in payload:
        val = bool(payload["is_admin"])
        if hasattr(u, "is_admin"):
            setattr(u, "is_admin", val)
        if hasattr(u, "is_staff"):
            u.is_staff = val

    if "email" in payload:
        u.email = (payload["email"] or "").strip()
    if "full_name" in payload:
        u.full_name = (payload["full_name"] or "").strip()
    if "is_active" in payload:
        u.is_active = bool(payload["is_active"])

    u.save()

    agg = (
        StoredFile.objects.filter(owner_id=u.id)
        .aggregate(files_count=Count("id"), files_total_size=Sum("size"))
        or {}
    )
    return Response(_user_public_dict(u, {u.id: agg}))


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def admin_user_delete(request, pk: int):
    if not _is_admin(request.user):
        return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    try:
        u = User.objects.get(pk=pk)
    except User.DoesNotExist:
        raise Http404

    if int(pk) == int(request.user.id):
        return Response(
            {"detail": "Нельзя деактивировать самого себя"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    u.is_active = False
    if hasattr(u, "is_admin"):
        u.is_admin = False
    if hasattr(u, "is_staff"):
        u.is_staff = False
    u.save(update_fields=["is_active"] + (
        ["is_admin"] if hasattr(u, "is_admin") else []
    ) + (
        ["is_staff"] if hasattr(u, "is_staff") else []
    ))

    return Response({"status": "deactivated"})
