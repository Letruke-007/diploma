from typing import Any, Dict
from django.contrib.auth import get_user_model
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from .models import StoredFile


class StoredFileSerializer(serializers.ModelSerializer):
    has_public_link = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = StoredFile
        fields = [
            "id",
            "original_name",
            "size",
            "uploaded_at",
            "last_downloaded_at",
            "comment",
            "has_public_link",
            "public_token",
            "parent",
        ]
        read_only_fields = [
            "size",
            "uploaded_at",
            "last_downloaded_at",
            "has_public_link",
            "public_token",
        ]

    def get_has_public_link(self, obj: StoredFile) -> bool:
        return bool(obj.public_token)

    @staticmethod
    def _keep_extension(new_name: str, old_name: str) -> str:
        """
        Если у нового имени нет расширения, добавляет его из старого.
        """
        new = (new_name or "").strip()
        if not new:
            return new

        # новое имя уже содержит расширение
        dot_new = new.rfind(".")
        if dot_new > 0 and dot_new < len(new) - 1:
            return new

        # переносим расширение из старого имени (если есть)
        dot_old = (old_name or "").rfind(".")
        if dot_old > 0 and dot_old < len(old_name or "") - 1:
            return f"{new}{old_name[dot_old:]}"

        return new

    def update(
        self,
        instance: StoredFile,
        validated_data: Dict[str, Any],
    ) -> StoredFile:
        if "original_name" in validated_data:
            validated_data["original_name"] = self._keep_extension(
                validated_data["original_name"],
                instance.original_name or "",
            )
        return super().update(instance, validated_data)


class FolderCreateSerializer(serializers.ModelSerializer):
    # фронтенд шлёт name, а в модели используется original_name
    name = serializers.CharField(
        write_only=True,
        allow_blank=False,
        max_length=255,
    )
    parent = serializers.PrimaryKeyRelatedField(
        queryset=StoredFile.objects.all(),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = StoredFile
        fields = ["id", "name", "parent"]

    def validate_name(self, value: str) -> str:
        name = (value or "").strip()
        if not name:
            raise serializers.ValidationError("Введите имя папки")

        # минимальный запрет символов (Windows-safe)
        forbidden = set('\\/:*?"<>|')
        if any(ch in forbidden for ch in name):
            raise serializers.ValidationError(
                'Недопустимые символы: \\ / : * ? " < > |'
            )

        return name

    def create(self, validated_data: Dict[str, Any]) -> StoredFile:
        request = self.context.get("request")
        name = validated_data.pop("name")
        parent = validated_data.pop("parent", None)

        # --- resolve target owner (supports admin context: ?user=<id>) ---
        owner = getattr(request, "user", None)
        target_user_id = None
        if request is not None:
            # DRF Request
            if hasattr(request, "query_params"):
                target_user_id = request.query_params.get("user")
            # Django HttpRequest
            if target_user_id is None and hasattr(request, "GET"):
                target_user_id = request.GET.get("user")

        if target_user_id not in (None, "", "null"):
            is_admin = bool(
                getattr(owner, "is_admin", False) or getattr(owner, "is_superuser", False)
            )
            if not is_admin:
                raise PermissionDenied("Forbidden")

            try:
                uid = int(target_user_id)
            except (TypeError, ValueError):
                raise serializers.ValidationError({"user": "Invalid user id"})

            User = get_user_model()
            try:
                owner = User.objects.get(pk=uid)
            except User.DoesNotExist:
                raise serializers.ValidationError({"user": "User not found"})

        # Parent folder must belong to the same owner
        if parent is not None:
            if not parent.is_folder or parent.is_deleted:
                raise serializers.ValidationError({"parent": "Invalid parent folder"})
            if owner is not None and parent.owner_id != owner.id:
                raise serializers.ValidationError(
                    {"parent": "Parent folder belongs to a different owner"}
                )

        return StoredFile.objects.create(
            original_name=name,
            parent=parent,
            is_folder=True,
            owner=owner,
        )
