"""
URL configuration for lydo_project project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path
from monitoring import views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', views.index, name='index'),
    
    # Auth Endpoints
    path('api/login/', views.login_view, name='login'),
    path('api/register/', views.register_view, name='register'),
    path('api/logout/', views.logout_view, name='logout'),
    path('api/user/', views.user_info_view, name='user_info'),
    path('api/barangays/', views.barangays_api, name='barangays_api'),
    path('login/', views.login_page, name='login_page'),
    path('reports.html', views.reports_page, name='reports_page'),
    path('reports/', views.reports_page, name='reports_list'),
    path('reports/<int:bid>/', views.reports_page, name='reports_by_barangay'),
    path('api/barangay_summary/<int:bid>/', views.barangay_summary, name='barangay_summary'),
    
    # Data Endpoints
    path('api/youth/', views.youth_api, name='youth_api'),
]

