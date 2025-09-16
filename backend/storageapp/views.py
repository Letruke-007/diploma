from urllib.parse import quote as urlquote
from tempfile import NamedTemporaryFile
import zipfile

from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import StoredFile
from . import services


def _is_admin(user) -> bool:
  return bool(getattr(user, "is_admin", False) or getattr(user, "is_superuser", False))


def _serialize(sf: StoredFile) -> dict:
  return {
      "id": sf.id,
      "original_name": sf.original_name,
      "size": sf.size,
      "uploaded_at": sf.uploaded_at.isoformat() if sf.uploaded_at else None,
      "last_downloaded_at": sf.last_downloaded_at.isoformat() if sf.last_downloaded_at else None,
      "comment": sf.comment,
      "public_token": sf.public_token,
      "has_public_link": bool(sf.public_token),
  }


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def list_files(request):
  if request.method == "GET":
    files_list = []
    target_user_id = request.GET.get("user")

    if request.user.is_authenticated:
      if target_user_id is not None:
        if not _is_admin(request.user):
          return Response({"detail": "You do not have permission to view other users' files."},
                          status=status.HTTP_403_FORBIDDEN)
        try:
          uid = int(target_user_id)
        except (TypeError, ValueError):
          return Response({"detail": "Invalid 'user' parameter"}, status=status.HTTP_400_BAD_REQUEST)
        qs = StoredFile.objects.filter(owner_id=uid)
      else:
        qs = StoredFile.objects.all() if _is_admin(request.user) else StoredFile.objects.filter(owner=request.user)
      files_list = [_serialize(x) for x in qs.order_by("-uploaded_at", "-id")]

    return Response({"items": files_list, "data": files_list, "results": files_list})

  if not request.user.is_authenticated:
    return Response({"detail": "Authentication credentials were not provided."},
                    status=status.HTTP_401_UNAUTHORIZED)

  up = request.FILES.get("file")
  if not up:
    return Response({"detail": "file is required"}, status=status.HTTP_400_BAD_REQUEST)

  comment = request.data.get("comment", "")
  try:
    sf = services.save_uploaded(up, request.user, comment=comment)
  except ValueError as e:
    return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
  return Response(_serialize(sf), status=status.HTTP_201_CREATED)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def patch_file(request, pk: int):
  sf = get_object_or_404(StoredFile, pk=pk)
  if not (_is_admin(request.user) or request.user == sf.owner):
    return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

  original_name = request.data.get("original_name")
  comment = request.data.get("comment")

  updated_fields = []
  if original_name is not None:
    sf.original_name = str(original_name).strip()
    updated_fields.append("original_name")
  if comment is not None:
    sf.comment = str(comment)
    updated_fields.append("comment")

  if updated_fields:
    sf.save(update_fields=updated_fields)

  return Response(_serialize(sf))


@api_view(["DELETE", "POST"])
@permission_classes([IsAuthenticated])
def delete_file(request, file_id: int = None, pk: int = None):
  _id = file_id or pk
  sf = get_object_or_404(StoredFile.objects.all(), id=_id)

  if not _is_admin(request.user) and sf.owner_id != request.user.id:
    return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

  try:
    if sf.file:
      sf.file.delete(save=False)
  except Exception:
    pass

  StoredFile.objects.filter(pk=sf.pk).delete()
  return Response({"status": "deleted"})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def download_file(request, pk: int):
  sf = get_object_or_404(StoredFile, pk=pk)
  if not (_is_admin(request.user) or request.user == sf.owner):
    return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

  sf.last_downloaded_at = timezone.now()
  sf.save(update_fields=["last_downloaded_at"])

  f = open(sf.path_on_disk, "rb")
  resp = FileResponse(f)
  resp["Content-Disposition"] = f'attachment; filename="{urlquote(sf.original_name)}"'
  return resp


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def issue_public(request, pk: int):
  sf = get_object_or_404(StoredFile, pk=pk)
  if not (_is_admin(request.user) or request.user == sf.owner):
    return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

  token = services.issue_public_link(sf)
  return Response({"token": token})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def revoke_public(request, pk: int):
  sf = get_object_or_404(StoredFile, pk=pk)
  if not (_is_admin(request.user) or request.user == sf.owner):
    return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

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

  f = open(sf.path_on_disk, "rb")
  resp = FileResponse(f)
  resp["Content-Disposition"] = f'attachment; filename="{urlquote(sf.original_name)}"'
  return resp


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def download_archive(request):
  ids = request.data.get("ids")
  if not isinstance(ids, list) or not ids:
    return Response({"detail": "ids must be a non-empty list"}, status=status.HTTP_400_BAD_REQUEST)
  try:
    ids = [int(x) for x in ids]
  except (TypeError, ValueError):
    return Response({"detail": "ids must be integers"}, status=status.HTTP_400_BAD_REQUEST)

  qs = StoredFile.objects.filter(pk__in=ids)
  if not _is_admin(request.user):
    qs = qs.filter(owner=request.user)
    if qs.count() != len(set(ids)):
      return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

  tmp = NamedTemporaryFile(suffix=".zip", delete=False)
  tmp.close()
  skipped = []

  with zipfile.ZipFile(tmp.name, "w", compression=zipfile.ZIP_DEFLATED) as z:
    for sf in qs:
      try:
        z.write(sf.path_on_disk, arcname=sf.original_name)
      except FileNotFoundError:
        skipped.append(sf.id)

  ts = timezone.now().strftime("%Y%m%d-%H%M%S")
  resp = FileResponse(open(tmp.name, "rb"))
  resp["Content-Disposition"] = f'attachment; filename="files-{ts}.zip"'
  if skipped:
    resp["X-Archived-Skipped"] = ",".join(map(str, skipped))
  return resp
