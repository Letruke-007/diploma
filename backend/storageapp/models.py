import uuid
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.db import models
from django.utils import timezone


class StoredFileQuerySet(models.QuerySet):
    """
    Расширенный QuerySet для работы с корзиной.
    """

    def alive(self):
        """
        Файлы, которые не удалены (основной список / Недавние).
        """
        return self.filter(is_deleted=False)

    def trashed(self):
        """
        Файлы в корзине, которые ещё не «протухли» (младше 30 дней).
        """
        limit = timezone.now() - timedelta(days=30)
        return self.filter(is_deleted=True, deleted_at__gte=limit)

    def expired(self):
        """
        Файлы в корзине старше 30 дней — кандидаты на окончательное удаление.
        """
        limit = timezone.now() - timedelta(days=30)
        return self.filter(is_deleted=True, deleted_at__lt=limit)


class StoredFile(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="files",
    )
    original_name = models.CharField(max_length=255)

    is_folder = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Является ли объект папкой",
    )

    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="children",
        help_text="Родительская папка (null = корень)",
    )

    deleted_from = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="trashed_children",
        limit_choices_to={"is_folder": True},
        help_text=(
            "Папка, из которой объект был отправлен в корзину "
            "(для отображения исходного места)."
        ),
    )

    disk_name = models.UUIDField(
        default=uuid.uuid4,
        editable=False,
        db_index=True,
    )
    rel_dir = models.CharField(max_length=255, default="")
    size = models.BigIntegerField()
    uploaded_at = models.DateTimeField(default=timezone.now)
    last_downloaded_at = models.DateTimeField(null=True, blank=True)
    comment = models.TextField(blank=True, default="")
    public_token = models.CharField(
        max_length=64,
        unique=True,
        null=True,
        blank=True,
    )

    # ---- Корзина ----
    is_deleted = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Флаг soft-delete: файл перемещён в корзину.",
    )
    deleted_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Момент перемещения файла в корзину.",
    )

    objects = StoredFileQuerySet.as_manager()

    class Meta:
        indexes = [
            models.Index(fields=["owner", "rel_dir"]),
            models.Index(fields=["is_deleted", "deleted_at"]),
        ]

    def __str__(self) -> str:
        status = "deleted" if self.is_deleted else "alive"
        return f"{self.id} · {self.original_name} ({self.size} B, {status})"

    # ---- Вспомогательные свойства пути ----

    @property
    def rel_path(self) -> str:
        return f"{self.rel_dir}/{str(self.disk_name)[:2]}/{self.disk_name}"

    @property
    def path_on_disk(self) -> Path:
        return Path(settings.MEDIA_ROOT) / self.rel_path

    # ---- Операции корзины ----

    def soft_delete(self) -> None:
        """
        Переместить файл/папку в корзину (soft-delete)
        и запомнить исходную папку.
        """
        if self.is_deleted:
            return

        self.deleted_from_id = self.parent_id
        self.parent_id = None

        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.save(
            update_fields=[
                "deleted_from",
                "parent",
                "is_deleted",
                "deleted_at",
            ]
        )

    def restore(self) -> None:
        """
        Восстановить файл/папку из корзины.

        Возвращает в deleted_from, если папка существует,
        является папкой, не удалена и принадлежит тому же владельцу.
        """
        if not self.is_deleted:
            return

        target_parent = None
        if self.deleted_from_id:
            try:
                target_parent = StoredFile.objects.get(
                    pk=self.deleted_from_id,
                    owner_id=self.owner_id,
                    is_folder=True,
                    is_deleted=False,
                )
            except StoredFile.DoesNotExist:
                target_parent = None

        self.parent = target_parent
        self.deleted_from = None
        self.is_deleted = False
        self.deleted_at = None
        self.save(
            update_fields=[
                "parent",
                "deleted_from",
                "is_deleted",
                "deleted_at",
            ]
        )
