"""
URL configuration for lydo_project.
"""
from django.contrib import admin
from django.urls import path
from monitoring import views

urlpatterns = [
    # ── Django admin ───────────────────────────────────────────
    path('admin/', admin.site.urls),

    # ── Page views ─────────────────────────────────────────────
    path('',          views.index,        name='index'),
    path('login/',    views.login_page,   name='login_page'),
    path('reports/',  views.reports_page, name='reports_list'),
    path('reports/<int:bid>/', views.reports_page, name='reports_by_barangay'),

    # ── Auth API ───────────────────────────────────────────────
    path('api/login/',    views.login_view,     name='login'),
    path('api/register/', views.register_view,  name='register'),
    path('api/logout/',   views.logout_view,    name='logout'),
    path('api/user/',     views.user_info_view, name='user_info'),

    # ── Barangay API ───────────────────────────────────────────
    path('api/barangays/',                    views.barangays_api,    name='barangays_api'),
    path('api/barangay_summary/<int:bid>/',   views.barangay_summary, name='barangay_summary'),
    path('api/demographics/',                 views.demographics_api, name='demographics_api'),

    # ── Youth CRUD API ─────────────────────────────────────────
    path('api/youth/', views.youth_api, name='youth_api'),
]
