from typing import Any, Dict
from rest_framework import serializers
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
        """Если у нового имени нет расширения, добавляет его из старого."""
        new = (new_name or "").strip()
        if not new:
            return new

        # новое имя уже содержит расширение (и оно не на конце)
        if (dot_new := new.rfind(".")) > 0 and dot_new < len(new) - 1:
            return new

        # переносим расширение из старого имени (если оно есть)
        if (dot_old := (old_name or "").rfind(".")) > 0 and dot_old < len(old_name or "") - 1:
            return f"{new}{old_name[dot_old:]}"
        return new

    def update(self, instance: StoredFile, validated_data: Dict[str, Any]) -> StoredFile:
        if "original_name" in validated_data:
            validated_data["original_name"] = self._keep_extension(
                validated_data["original_name"], instance.original_name or ""
            )
        return super().update(instance, validated_data)
