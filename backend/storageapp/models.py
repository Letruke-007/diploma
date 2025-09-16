import uuid
from pathlib import Path
from django.conf import settings
from django.db import models
from django.utils import timezone


class StoredFile(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="files")
    original_name = models.CharField(max_length=255)
    disk_name = models.UUIDField(default=uuid.uuid4, editable=False, db_index=True)
    rel_dir = models.CharField(max_length=255, default="")
    size = models.BigIntegerField()
    uploaded_at = models.DateTimeField(default=timezone.now)
    last_downloaded_at = models.DateTimeField(null=True, blank=True)
    comment = models.TextField(blank=True, default="")
    public_token = models.CharField(max_length=64, unique=True, null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["owner", "rel_dir"])]

    def __str__(self) -> str: 
        return f"{self.id} · {self.original_name} ({self.size} B)"

    @property
    def rel_path(self) -> str:
        return f"{self.rel_dir}/{str(self.disk_name)[:2]}/{self.disk_name}"

    @property
    def path_on_disk(self) -> Path:
        return Path(settings.MEDIA_ROOT) / self.rel_path
