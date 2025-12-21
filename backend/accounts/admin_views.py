from typing import Any, Dict

from django.contrib.auth import get_user_model
from django.contrib.auth.models import AbstractBaseUser
from django.db.models import Count, Sum, Q
from django.http import Http404
from django.utils import timezone

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from storageapp.models import StoredFile


User = get_user_model()


def _is_admin(user) -> bool:
    return bool(
        getattr(user, "is_admin", False)
        or getattr(user, "is_superuser", False)
    )


def _user_public_dict(
    u: AbstractBaseUser,
    aggregates: Dict[int, Dict[str, Any]],
) -> Dict[str, Any]:
    agg = aggregates.get(u.id, {}) if aggregates else {}

    return {
        "id": u.id,
        "username": getattr(u, "username", ""),
        "full_name": getattr(u, "full_name", "") or "",
        "email": getattr(u, "email", "") or "",
        "is_admin": bool(
            getattr(u, "is_admin", False)
            or getattr(u, "is_superuser", False)
        ),
        "is_active": bool(getattr(u, "is_active", True)),
        "files_count": int(agg.get("files_count") or 0),
        "files_total_size": int(agg.get("files_total_size") or 0),
    }


class UserPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_users_list(request):
    if not _is_admin(request.user):
        return Response(
            {"detail": "Forbidden"},
            status=status.HTTP_403_FORBIDDEN,
        )

    q = (request.GET.get("q") or "").strip()

    users_qs = User.objects.all().order_by("id")
    if q:
        users_qs = users_qs.filter(
            Q(username__icontains=q)
            | Q(full_name__icontains=q)
            | Q(email__icontains=q)
        )

    file_aggs = (
        StoredFile.objects.values("owner_id")
        .annotate(
            files_count=Count("id"),
            files_total_size=Sum("size"),
        )
    )
    by_owner: Dict[int, Dict[str, Any]] = {
        row["owner_id"]: row for row in file_aggs
    }

    paginator = UserPagination()
    page = paginator.paginate_queryset(users_qs, request)

    results = [_user_public_dict(u, by_owner) for u in page]

    response = paginator.get_paginated_response(results)

    data = response.data
    data["items"] = data.get("results", [])
    data["data"] = data.get("results", [])

    return response


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def admin_user_patch(request, pk: int):
    if not _is_admin(request.user):
        return Response(
            {"detail": "Forbidden"},
            status=status.HTTP_403_FORBIDDEN,
        )

    try:
        u = User.objects.get(pk=pk)
    except User.DoesNotExist:
        raise Http404

    allowed_fields = {"email", "full_name", "is_admin", "is_active"}
    payload = {
        k: v
        for k, v in (request.data or {}).items()
        if k in allowed_fields
    }

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
        .aggregate(
            files_count=Count("id"),
            files_total_size=Sum("size"),
        )
        or {}
    )

    return Response(_user_public_dict(u, {u.id: agg}))


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def admin_user_delete(request, pk: int):
    """
    DELETE /api/auth/admin/users/<id>/delete

    Мягкое удаление (деактивация):
    - is_active=False
    - date_deleted=now
    - is_admin/is_staff=False
    """
    if not _is_admin(request.user):
        return Response(
            {"detail": "Forbidden"},
            status=status.HTTP_403_FORBIDDEN,
        )

    try:
        u = User.objects.get(pk=pk)
    except User.DoesNotExist:
        raise Http404

    if int(pk) == int(request.user.id):
        return Response(
            {"detail": "Нельзя деактивировать самого себя"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not bool(getattr(u, "is_active", True)):
        return Response({"status": "already_deactivated"}, status=status.HTTP_200_OK)

    u.is_active = False

    if hasattr(u, "date_deleted"):
        u.date_deleted = timezone.now()

    if hasattr(u, "is_admin"):
        u.is_admin = False
    if hasattr(u, "is_staff"):
        u.is_staff = False

    update_fields = ["is_active"]
    if hasattr(u, "date_deleted"):
        update_fields.append("date_deleted")
    if hasattr(u, "is_admin"):
        update_fields.append("is_admin")
    if hasattr(u, "is_staff"):
        update_fields.append("is_staff")

    u.save(update_fields=update_fields)

    return Response({"status": "deactivated"}, status=status.HTTP_200_OK)

@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def admin_user_purge(request, pk: int):
    """
    DELETE /api/auth/admin/users/<id>/purge

    Полное удаление пользователя и его файловых данных.
    Разрешено ТОЛЬКО если пользователь уже деактивирован (is_active=False).
    """
    if not _is_admin(request.user):
        return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    try:
        u = User.objects.get(pk=pk)
    except User.DoesNotExist:
        raise Http404

    if int(pk) == int(request.user.id):
        return Response({"detail": "Нельзя удалить самого себя"}, status=status.HTTP_400_BAD_REQUEST)

    if bool(getattr(u, "is_active", True)):
        return Response(
            {"detail": "User must be deactivated before purge"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    from storageapp import services as storage_services

    qs = StoredFile.objects.filter(owner_id=u.id, is_folder=False).only("id", "rel_dir", "disk_name")
    for sf in qs.iterator():
        storage_services.delete_stored_file(sf)

    u.delete()

    return Response({"status": "purged"}, status=status.HTTP_200_OK)
