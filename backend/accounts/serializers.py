from rest_framework import serializers
from .models import User


class UserPublicSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'full_name', 'email', 'is_admin', 'storage_rel_path', 'date_joined']


class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField()
    full_name = serializers.CharField()
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)


class AdminUserSerializer(serializers.ModelSerializer):
    files_count = serializers.IntegerField(read_only=True)
    files_total_size = serializers.IntegerField(read_only=True)

    class Meta:
        model = User
        fields = (
            'id',
            'username',
            'full_name',
            'email',
            'is_admin',
            'is_staff',
            'is_superuser',
            'is_active',
            'date_joined',
            'files_count',
            'files_total_size',
        )
        read_only_fields = ('id', 'date_joined')
