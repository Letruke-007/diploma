from urllib.parse import quote as urlquote
from tempfile import NamedTemporaryFile
import zipfile
import mimetypes
from datetime import timedelta
from pathlib import Path

from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.conf import settings
from django.db.models import Sum

from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import StoredFile
from . import services


# ================= HELPERS =================

def _is_admin(user) -> bool:
    return bool(
        getattr(user, "is_admin", False)
        or getattr(user, "is_superuser", False)
    )


def _folder_path(folder: StoredFile | None) -> str | None:
    if folder is None:
        return None

    parts = []
    cur = folder
    while cur is not None:
        parts.append(cur.original_name)
        cur = cur.parent
    return "/".join(reversed(parts))


def _serialize(sf: StoredFile) -> dict:
    deleted_from_obj = getattr(sf, "deleted_from", None)
    return {
        "id": sf.id,
        "original_name": sf.original_name,
        "size": sf.size,
        "uploaded_at": sf.uploaded_at.isoformat() if sf.uploaded_at else None,
        "last_downloaded_at": (
            sf.last_downloaded_at.isoformat()
            if sf.last_downloaded_at else None
        ),
        "comment": sf.comment,
        "public_token": sf.public_token,
        "has_public_link": bool(sf.public_token),
        "is_deleted": sf.is_deleted,
        "deleted_at": sf.deleted_at.isoformat() if sf.deleted_at else None,
        "is_folder": bool(sf.is_folder),
        "parent": sf.parent_id,
        "deleted_from": sf.deleted_from_id,
        "deleted_from_path": _folder_path(deleted_from_obj),
    }

def _folder_sizes_recursive(owner_id: int, root_folder_ids: list[int]) -> dict[int, int]:
    """
    Возвращает {root_folder_id: total_bytes} для каждой папки из root_folder_ids.
    total_bytes считается рекурсивно по всем вложенным подпапкам и файлам.
    """
    if not root_folder_ids:
        return {}

    # root_of[folder_id] = root_folder_id
    root_of: dict[int, int] = {fid: fid for fid in root_folder_ids}
    totals: dict[int, int] = {fid: 0 for fid in root_folder_ids}

    frontier = list(root_folder_ids)

    while frontier:
        parent_ids = frontier
        frontier = []

        file_rows = (
            StoredFile.objects.filter(
                owner_id=owner_id,
                is_deleted=False,
                is_folder=False,
                parent_id__in=parent_ids,
            )
            .values("parent_id")
            .annotate(total=Sum("size"))
        )

        for row in file_rows:
            parent_id = row["parent_id"]
            total = int(row["total"] or 0)
            root_id = root_of.get(parent_id)
            if root_id is not None:
                totals[root_id] += total

        child_folders = (
            StoredFile.objects.filter(
                owner_id=owner_id,
                is_deleted=False,
                is_folder=True,
                parent_id__in=parent_ids,
            )
            .values_list("id", "parent_id")
        )

        for child_id, parent_id in child_folders:
    
            root_id = root_of.get(parent_id)
            if root_id is None:
                continue
            root_of[child_id] = root_id
            frontier.append(child_id)

    return totals

class FilePagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


# ================= LIST + UPLOAD =================

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def list_files(request):
    view = request.GET.get("view", "my")
    parent_param = request.GET.get("parent")
    target_user_id = request.GET.get("user")

    # --- POST: upload ---
    if request.method == "POST":
        up = request.FILES.get("file")
        # Админ может загружать в чужое хранилище: /api/files/?user=<id>
        target_owner = request.user
        if target_user_id is not None:
            if not _is_admin(request.user):
                return Response(
                    {"detail": "Forbidden"},
                    status=status.HTTP_403_FORBIDDEN,
                )
            try:
                uid = int(target_user_id)
            except (TypeError, ValueError):
                return Response(
                    {"detail": "Invalid user id"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            from django.contrib.auth import get_user_model
            User = get_user_model()
            try:
                target_owner = User.objects.get(pk=uid)
            except User.DoesNotExist:
                return Response(
                    {"detail": "User not found"},
                    status=status.HTTP_404_NOT_FOUND,
                )
        if not up:
            return Response(
                {"detail": "file is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        comment = request.data.get("comment", "")
        parent = None
        parent_id = request.data.get("parent")

        if parent_id not in (None, "", "null"):
            try:
                parent = StoredFile.objects.get(
                    id=int(parent_id),
                    owner=target_owner,
                    is_folder=True,
                    is_deleted=False,
                )
            except (StoredFile.DoesNotExist, ValueError, TypeError):
                return Response(
                    {"parent": ["Родительская папка не найдена"]},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        try:
            created = services.save_uploaded(
                up,
                target_owner,
                comment=comment,
                parent=parent,
            )

        except ValueError as e:
            return Response(
                {"detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ВАЖНО: всегда возвращаем Response (иначе будет NoneType и 500)
        if created is not None:
            return Response(_serialize(created), status=status.HTTP_201_CREATED)

        # Если save_uploaded ничего не возвращает — отдаем 201, фронт должен refetch списка
        return Response({"detail": "uploaded"}, status=status.HTTP_201_CREATED)

    # --- GET: list ---
    if target_user_id is not None:
        if not _is_admin(request.user):
            return Response(
                {"detail": "Forbidden"},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            uid = int(target_user_id)
        except ValueError:
            return Response(
                {"detail": "Invalid user parameter"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        qs = StoredFile.objects.filter(owner_id=uid)
        owner_id_for_sizes = uid
    else:
        qs = StoredFile.objects.filter(owner=request.user)
        owner_id_for_sizes = request.user.id

    if view == "trash":
        limit = timezone.now() - timedelta(days=30)
        qs = qs.filter(
            is_deleted=True,
            deleted_at__gte=limit,
        ).order_by("-deleted_at")

    elif view == "recent":
        qs = qs.filter(is_deleted=False).order_by("-uploaded_at")

    else:
        qs = qs.filter(is_deleted=False)
        if parent_param in (None, "", "null"):
            qs = qs.filter(parent__isnull=True)
        else:
            try:
                pid = int(parent_param)
            except ValueError:
                return Response(
                    {"detail": "Invalid parent parameter"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            qs = qs.filter(parent_id=pid)

        qs = qs.order_by("-is_folder", "-uploaded_at")

    paginator = FilePagination()
    page = paginator.paginate_queryset(qs, request)

    folder_ids = [x.id for x in page if getattr(x, "is_folder", False)]
    folder_sizes = _folder_sizes_recursive(owner_id_for_sizes, folder_ids)

    serialized = []
    for x in page:
        obj = _serialize(x)
        if obj.get("is_folder"):
            obj["size"] = int(folder_sizes.get(x.id, 0))
        serialized.append(obj)

    response = paginator.get_paginated_response(serialized)
    response.data["items"] = response.data.get("results", [])
    response.data["data"] = response.data.get("results", [])
    return response

# ================= PATCH =================

@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def patch_file(request, pk: int):
    sf = get_object_or_404(StoredFile, pk=pk)

    if not (_is_admin(request.user) or request.user == sf.owner):
        return Response({"detail": "Forbidden"}, status=403)

    updated_fields: list[str] = []

    new_name = None
    if "original_name" in request.data:
        new_name = request.data["original_name"]
    elif "name" in request.data:
        new_name = request.data["name"]

    if new_name is not None:
        sf.original_name = str(new_name).strip()
        updated_fields.append("original_name")

    if "comment" in request.data:
        sf.comment = str(request.data["comment"])
        updated_fields.append("comment")

    if updated_fields:
        sf.save(update_fields=updated_fields)

    return Response(_serialize(sf))

# ================= DELETE =================

@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def delete_file(request, pk: int):
    sf = get_object_or_404(StoredFile, pk=pk)

    if not (_is_admin(request.user) or request.user.id == sf.owner_id):
        return Response({"detail": "Forbidden"}, status=403)

    if not sf.is_deleted:
        sf.soft_delete()
        return Response({"status": "trashed"})

    if not sf.is_folder:
        try:
            p = sf.path_on_disk
            if p.exists():
                p.unlink()
        except Exception:
            pass

    sf.delete()
    return Response({"status": "deleted_forever"})


# ================= RESTORE =================

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def restore_file(request, pk: int):
    sf = get_object_or_404(StoredFile, pk=pk)

    if not (_is_admin(request.user) or request.user.id == sf.owner_id):
        return Response({"detail": "Forbidden"}, status=403)

    if not sf.is_deleted:
        return Response(
            {"detail": "File is not in trash"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    sf.restore()
    return Response(_serialize(sf))


# ================= DOWNLOAD =================

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def download_file(request, pk: int):
    sf = get_object_or_404(StoredFile, pk=pk)

    if not (_is_admin(request.user) or request.user == sf.owner):
        return Response({"detail": "Forbidden"}, status=403)

    sf.last_downloaded_at = timezone.now()
    sf.save(update_fields=["last_downloaded_at"])

    path = Path(sf.path_on_disk)
    if not path.exists():
        return Response(
            {"detail": "File not found on disk"},
            status=status.HTTP_404_NOT_FOUND,
        )

    f = open(path, "rb")
    resp = FileResponse(f)
    resp["Content-Disposition"] = f'attachment; filename="{urlquote(sf.original_name)}"'
    return resp

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def view_file(request, pk: int):
    sf = get_object_or_404(StoredFile, pk=pk)

    if not (_is_admin(request.user) or request.user == sf.owner):
        return Response({"detail": "Forbidden"}, status=403)

    sf.last_downloaded_at = timezone.now()
    sf.save(update_fields=["last_downloaded_at"])

    path = Path(sf.path_on_disk)
    if not path.exists():
        return Response(
            {"detail": "File not found on disk"},
            status=status.HTTP_404_NOT_FOUND,
        )

    f = open(path, "rb")

    resp = FileResponse(f)

    ctype, _ = mimetypes.guess_type(sf.original_name)
    if ctype:
        resp["Content-Type"] = ctype

    resp["Content-Disposition"] = (
        f'inline; filename="{urlquote(sf.original_name)}"'
    )
    return resp


# ================= PUBLIC LINKS =================

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def issue_public(request, pk: int):
    sf = get_object_or_404(StoredFile, pk=pk)

    if sf.is_folder:
        return Response({"detail": "Folders cannot be shared"}, status=400)

    if not (_is_admin(request.user) or request.user == sf.owner):
        return Response({"detail": "Forbidden"}, status=403)

    token = services.issue_public_link(sf)
    url = request.build_absolute_uri(f"/d/{token}/")

    return Response({"token": token, "url": url})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def revoke_public(request, pk: int):
    sf = get_object_or_404(StoredFile, pk=pk)

    if not (_is_admin(request.user) or request.user == sf.owner):
        return Response({"detail": "Forbidden"}, status=403)

    services.revoke_public_link(sf)
    return Response({"status": "revoked"})

@api_view(["GET"])
@permission_classes([AllowAny])
def public_download(request, token: str):
    sf = services.resolve_public_link(token)
    if not sf:
        raise Http404

    sf.last_downloaded_at = timezone.now()
    sf.save(update_fields=["last_downloaded_at"])

    path = Path(sf.path_on_disk)
    if not path.exists():
        return Response(
            {"detail": "File not found on disk"},
            status=status.HTTP_404_NOT_FOUND,
        )

    f = open(path, "rb")
    resp = FileResponse(f)
    resp["Content-Disposition"] = (
        f'attachment; filename="{urlquote(sf.original_name)}"'
    )
    return resp

# ================= CREATE FOLDER =================

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_folder(request):
    name = (request.data.get("name") or "").strip()
    parent_id = request.data.get("parent")
    
    # Админ может создавать папку в чужом хранилище: /api/folders/?user=<id>
    target_user_id = request.GET.get("user")
    target_owner = request.user

    if target_user_id is not None:
        if not _is_admin(request.user):
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        try:
            uid = int(target_user_id)
        except (TypeError, ValueError):
            return Response({"detail": "Invalid user id"}, status=status.HTTP_400_BAD_REQUEST)

        from django.contrib.auth import get_user_model
        User = get_user_model()
        try:
            target_owner = User.objects.get(pk=uid)
        except User.DoesNotExist:
            return Response({"detail": "User not found"}, status=status.HTTP_404_NOT_FOUND)


    if not name:
        return Response(
            {"name": ["Введите имя папки"]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    forbidden = '\\/:*?"<>|'
    if any(ch in forbidden for ch in name):
        return Response(
            {"name": ['Недопустимые символы: \\ / : * ? " < > |']},
            status=status.HTTP_400_BAD_REQUEST,
        )

    parent = None
    if parent_id not in (None, "", "null"):
        try:
            parent = StoredFile.objects.get(
                id=int(parent_id),
                owner=request.user,
                is_folder=True,
                is_deleted=False,
            )
        except (StoredFile.DoesNotExist, ValueError, TypeError):
            return Response(
                {"parent": ["Родительская папка не найдена"]},
                status=status.HTTP_400_BAD_REQUEST,
            )

    folder = StoredFile.objects.create(
        owner=target_owner,
        original_name=name,
        is_folder=True,
        parent=parent,
        size=0,
        rel_dir="",
    )

    return Response(_serialize(folder), status=status.HTTP_201_CREATED)

# ================= ZIP DOWNLOAD =================

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def download_file(request, pk: int):
    sf = get_object_or_404(StoredFile, pk=pk)

    if not (_is_admin(request.user) or request.user == sf.owner):
        return Response({"detail": "Forbidden"}, status=403)

    sf.last_downloaded_at = timezone.now()
    sf.save(update_fields=["last_downloaded_at"])

    path = Path(sf.path_on_disk)
    if not path.exists():
        return Response(
            {"detail": "File not found on disk"},
            status=status.HTTP_404_NOT_FOUND,
        )

    f = open(path, "rb")
    resp = FileResponse(f)
    resp["Content-Disposition"] = (
        f'attachment; filename="{urlquote(sf.original_name)}"'
    )
    return resp

# ================= BULK OPERATIONS =================

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def bulk_trash(request):
    ids = request.data.get("ids")

    if not isinstance(ids, list) or not ids:
        return Response(
            {"detail": "ids must be non-empty list"},
            status=400,
        )

    try:
        ids = [int(x) for x in ids]
    except (TypeError, ValueError):
        return Response(
            {"detail": "ids must be integers"},
            status=400,
        )

    qs = StoredFile.objects.filter(id__in=ids)

    if not _is_admin(request.user):
        qs = qs.filter(owner=request.user)

    if qs.count() != len(set(ids)):
        return Response({"detail": "Forbidden"}, status=403)

      # Admin safety: do not allow cross-owner moves.
      # In admin UI we always operate within a single user storage.
    if _is_admin(request.user):
        owner_ids = set(qs.values_list("owner_id", flat=True))
        if len(owner_ids) != 1:
            return Response(
                {"detail": "Cannot move objects belonging to different owners in one request"},
                status=400,
            )

    trashed = 0
    for sf in qs:
        if sf.is_deleted:
            continue
        sf.soft_delete()
        trashed += 1

    return Response({"trashed": trashed})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def bulk_move(request):
    ids = request.data.get("ids")
    parent_id = request.data.get("parent")

    if not isinstance(ids, list) or not ids:
        return Response(
            {"detail": "ids must be a non-empty list"},
            status=400,
        )

    try:
        ids = [int(x) for x in ids]
    except (TypeError, ValueError):
        return Response(
            {"detail": "ids must be integers"},
            status=400,
        )

    qs = StoredFile.objects.filter(id__in=ids)

    if not _is_admin(request.user):
        qs = qs.filter(owner=request.user)

    if qs.count() != len(set(ids)):
        return Response({"detail": "Forbidden"}, status=403)

    # Admin safety: do not allow cross-owner moves.
    # In admin UI we always operate within a single user storage.
    owner_ids = None
    if _is_admin(request.user):
        owner_ids = set(qs.values_list("owner_id", flat=True))
        if len(owner_ids) != 1:
            return Response(
                {"detail": "Cannot move objects belonging to different owners in one request"},
                status=400,
            )

    if parent_id in (None, "", "null"):
        parent = None
    else:
        try:
            parent = StoredFile.objects.get(
                id=int(parent_id),
                is_folder=True,
                is_deleted=False,
            )
        except (StoredFile.DoesNotExist, ValueError, TypeError):
            return Response(
                {"parent": ["Родительская папка не найдена"]},
                status=400,
            )

        if not (_is_admin(request.user) or parent.owner_id == request.user.id):
            return Response({"detail": "Forbidden"}, status=403)

        # Ensure we do not move items into a folder of another owner (even for admins).
        if _is_admin(request.user) and parent is not None and parent.owner_id not in owner_ids:
            return Response(
                {"detail": "Parent folder belongs to a different owner"},
                status=400,
            )

    def is_descendant(folder, target):
        while target:
            if target.id == folder.id:
                return True
            target = target.parent
        return False

    for sf in qs:
        if parent and sf.is_folder and is_descendant(sf, parent):
            return Response(
                {
                    "detail": (
                        f"Нельзя переместить папку "
                        f"'{sf.original_name}' внутрь самой себя"
                    )
                },
                status=400,
            )

    qs.update(parent=parent)
    return Response({"moved": qs.count()})

# ================= STORAGE USAGE =================

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def storage_usage(request):
    qs = StoredFile.objects.filter(
        owner=request.user,
        is_deleted=False,
        is_folder=False,
    )

    used = qs.aggregate(total=Sum("size"))["total"] or 0
    quota = getattr(
        settings,
        "USER_QUOTA_BYTES",
        5 * 1024 * 1024 * 1024,
    )

    return Response(
        {
            "used_bytes": int(used),
            "quota_bytes": int(quota),
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def download_archive(request):
    """
    Собирает ZIP-архив из выбранных файлов и отдаёт его как attachment.

    Ожидает JSON:
      {"ids": [1,2,3]}

    Ограничения:
      - архивируются только файлы (is_folder=False)
      - доступ: владелец или админ
    """
    ids = request.data.get("ids")

    if not isinstance(ids, list) or not ids:
        return Response(
            {"detail": "ids must be non-empty list"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        ids = [int(x) for x in ids]
    except (TypeError, ValueError):
        return Response(
            {"detail": "ids must be integers"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    qs = StoredFile.objects.filter(id__in=ids, is_folder=False)

    # Права: админ видит всё, обычный пользователь — только своё
    if not _is_admin(request.user):
        qs = qs.filter(owner=request.user)

    # Если чего-то не нашли или нет прав — считаем это forbidden
    if qs.count() != len(set(ids)):
        return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    # Создаём ZIP во временном файле
    tmp = NamedTemporaryFile(prefix="mycloud_", suffix=".zip", delete=False)
    tmp_path = Path(tmp.name)
    tmp.close()

    try:
        with zipfile.ZipFile(tmp_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            used_names: set[str] = set()

            for sf in qs:
                p = Path(sf.path_on_disk)
                if not p.exists():
                    # Если файл отсутствует на диске — это корректнее вернуть 404
                    return Response(
                        {"detail": f"File not found on disk: {sf.id}"},
                        status=status.HTTP_404_NOT_FOUND,
                    )

                name = (sf.original_name or f"file-{sf.id}").strip() or f"file-{sf.id}"

                # защита от коллизий имён в архиве
                base = name
                i = 2
                while name in used_names:
                    name = f"{base} ({i})"
                    i += 1
                used_names.add(name)

                zf.write(p, arcname=name)

        f = open(tmp_path, "rb")
        resp = FileResponse(f, as_attachment=True, filename="mycloud-archive.zip")
        resp["Content-Type"] = "application/zip"
        return resp

    except Exception as e:
        try:
            if tmp_path.exists():
                tmp_path.unlink()
        except Exception:
            pass
        return Response(
            {"detail": f"archive build failed: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
