from django.views.decorators.csrf import ensure_csrf_cookie
from django.contrib.auth import authenticate, login, logout
from django.core.exceptions import ValidationError
from django.db.models import Q

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated, BasePermission
from rest_framework.response import Response

from .models import User
from .serializers import (
    UserPublicSerializer,
    RegisterSerializer,
    LoginSerializer,
    AdminUserSerializer,
)

import logging
logger = logging.getLogger(__name__)
# ---- Permissions ----
class AdminOnly(BasePermission):
    """Доступ только пользователям с флагом is_admin=True."""
    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and getattr(u, "is_admin", False))


# ---- CSRF helper ----
@api_view(['GET'])
@permission_classes([AllowAny])
@ensure_csrf_cookie
def csrf(request):
    return Response({'detail': 'ok'})


# ---- Auth ----
@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    """
    POST /api/auth/register
    body: { username, full_name, email, password }
    """
    ser = RegisterSerializer(data=request.data)
    if not ser.is_valid():
        return Response({'errors': ser.errors}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user = User.objects.create_user(
            username=ser.validated_data['username'],
            email=ser.validated_data['email'],
            full_name=ser.validated_data['full_name'],
            password=ser.validated_data['password'],
        )
    except ValidationError as e:
        msg = getattr(e, "message", None) or (e.messages[0] if getattr(e, "messages", None) else str(e))
        return Response({'detail': msg}, status=status.HTTP_400_BAD_REQUEST)
    except Exception:
        return Response({'detail': 'Registration failed'}, status=status.HTTP_400_BAD_REQUEST)

    login(request, user)  # автологин после регистрации
    return Response(UserPublicSerializer(user).data, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    """
    POST /api/auth/login
    body: { username, password }
    """
    ser = LoginSerializer(data=request.data)
    if not ser.is_valid():
        return Response({'errors': ser.errors}, status=status.HTTP_400_BAD_REQUEST)

    user = authenticate(
        request,
        username=ser.validated_data['username'],
        password=ser.validated_data['password'],
    )
    if not user:
        return Response({'detail': 'Invalid credentials'}, status=status.HTTP_400_BAD_REQUEST)
    if not user.is_active:
        return Response({'detail': 'User disabled'}, status=status.HTTP_400_BAD_REQUEST)

    login(request, user)
    return Response(UserPublicSerializer(user).data, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    logout(request)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me(request):
    return Response(UserPublicSerializer(request.user).data)


# ---- Admin API ----
@api_view(['GET'])
@permission_classes([IsAuthenticated, AdminOnly])
def admin_users(request):
    
    try:
        qs = User.objects.all().order_by('id')

        q = request.query_params.get('q')
        if q:
            qs = qs.filter(
                Q(username__icontains=q) |
                Q(email__icontains=q) |
                Q(full_name__icontains=q)
            )

        rows = list(qs.values(
            'id', 'username', 'full_name', 'email',
            'is_admin', 'is_active', 'date_joined'
        ))
       
        for r in rows:
            dj = r.get('date_joined')
            if dj is not None and hasattr(dj, 'isoformat'):
                r['date_joined'] = dj.isoformat()

        return Response({"results": rows}, status=status.HTTP_200_OK)

    except Exception as e:
        logger.exception("admin_users failed")  
        return Response({"detail": "internal error", "error": str(e)}, status=500)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated, AdminOnly])
def admin_patch_user(request, pk: int):
    """
    PATCH /api/auth/admin/users/<id>
    Разрешено менять: email, full_name, is_admin, is_active.
    Самого себя деактивировать нельзя; строковые булевы нормализуем.
    """
    try:
        user = User.objects.get(pk=pk)
    except User.DoesNotExist:
        return Response({'detail': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

    # защита от самодеактивации
    if user.pk == request.user.pk and 'is_active' in request.data:
        val = str(request.data['is_active']).lower()
        if val in ('0', 'false', 'no'):
            return Response({'detail': 'You cannot deactivate yourself'}, status=status.HTTP_400_BAD_REQUEST)

    allowed = {'email', 'full_name', 'is_admin', 'is_active'}
    payload = {k: v for k, v in request.data.items() if k in allowed}

    # нормализуем булевы из строк
    for b in ('is_admin', 'is_active'):
        if b in payload and isinstance(payload[b], str):
            payload[b] = payload[b].lower() not in ('0', 'false', 'no')

    if not payload:
        return Response({'detail': 'No fields to update'}, status=status.HTTP_400_BAD_REQUEST)

    for k, v in payload.items():
        setattr(user, k, v)

    user.save(update_fields=list(payload.keys()))

    out = {
        'id': user.id,
        'username': user.username,
        'full_name': user.full_name,
        'email': user.email,
        'is_admin': user.is_admin,
        'is_active': user.is_active,
        'date_joined': user.date_joined.isoformat() if hasattr(user.date_joined, 'isoformat') else user.date_joined,
    }
    return Response(out, status=status.HTTP_200_OK)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated, AdminOnly])
def admin_delete_user(request, pk: int):
    """
    DELETE /api/auth/admin/users/<id>/delete
    «Мягкое удаление»: is_active=False. Самого себя нельзя.
    """
    try:
        user = User.objects.get(pk=pk)
    except User.DoesNotExist:
        return Response({'detail': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

    if user.pk == request.user.pk:
        return Response({'detail': 'You cannot deactivate yourself'}, status=status.HTTP_400_BAD_REQUEST)

    user.is_active = False
    user.save(update_fields=['is_active'])
    return Response({'status': 'deactivated'}, status=status.HTTP_200_OK)
