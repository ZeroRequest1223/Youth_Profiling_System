import json
import datetime
from django.shortcuts import render, redirect, get_object_or_404
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.contrib.auth.decorators import login_required
from django.db.models import Count
from .models import Youth, Barangay

# ── Optional profanity filter (graceful fallback if package not installed) ──
try:
    from better_profanity import profanity
    profanity.load_censor_words()
    profanity.add_censor_words(['gago', 'puta', 'yawa', 'piste'])
    _PROFANITY_AVAILABLE = True
except ImportError:
    _PROFANITY_AVAILABLE = False

def _contains_profanity(text: str) -> bool:
    if not _PROFANITY_AVAILABLE:
        return False
    return profanity.contains_profanity(text)


# ──────────────────────────────────────────────────────────────
# PAGE VIEWS
# ──────────────────────────────────────────────────────────────

@ensure_csrf_cookie
def index(request):
    """Dashboard page — redirect to login if not authenticated."""
    if not request.user.is_authenticated:
        return redirect('login_page')
    return render(request, 'dashboard.html')


def login_page(request):
    """Login page — redirect to dashboard if already authenticated."""
    if request.user.is_authenticated:
        return redirect('index')
    return render(request, 'login.html')


def reports_page(request, bid=None):
    """Reports page with server-side chart seed data."""
    if not request.user.is_authenticated:
        return redirect('login_page')

    bgs = list(Barangay.objects.all().order_by('name').values('id', 'name'))
    id_to_name = {b['id']: b['name'] for b in bgs}

    demo_data = {b['name']: {'isy': 0, 'osy': 0, 'yd': 0, 'iy': 0, 'wk': 0, 'uy': 0}
                 for b in bgs}

    qs = (
        Youth.objects
        .filter(barangay_id__in=id_to_name.keys())
        .values('barangay_id', 'is_in_school', 'is_osy',
                'is_working_youth', 'is_pwd', 'is_4ps')
    )

    for y in qs:
        name = id_to_name.get(y['barangay_id'])
        if not name:
            continue
        d = demo_data[name]
        if y['is_in_school']:     d['isy'] += 1
        if y['is_osy']:           d['osy'] += 1
        if y['is_working_youth']: d['wk']  += 1
        if y['is_pwd']:           d['iy']  += 1
        if y['is_4ps']:           d['yd']  += 1
        if not any([y['is_in_school'], y['is_osy'],
                    y['is_working_youth'], y['is_pwd'], y['is_4ps']]):
            d['uy'] += 1

    labels = [b['name'] for b in bgs]
    values = [sum(demo_data[b['name']].values()) for b in bgs]

    pie_labels = ['In School Youth', 'Out of School Youth', 'Working Youth',
                  'Youth with Disability', '4Ps Beneficiary', 'Unclassified']
    pie_values = [
        sum(d['isy'] for d in demo_data.values()),
        sum(d['osy'] for d in demo_data.values()),
        sum(d['wk']  for d in demo_data.values()),
        sum(d['iy']  for d in demo_data.values()),
        sum(d['yd']  for d in demo_data.values()),
        sum(d['uy']  for d in demo_data.values()),
    ]

    context = {
        'barangay_id':     bid,
        'chart_top_cities': json.dumps({'labels': labels, 'values': values}),
        'chart_responder':  json.dumps({'labels': pie_labels, 'values': pie_values}),
        'chart_avg':        json.dumps({'labels': [], 'values': []}),
        'chart_demo':       json.dumps(demo_data),
    }
    return render(request, 'reports.html', context)


# ──────────────────────────────────────────────────────────────
# AUTH API ENDPOINTS
# ──────────────────────────────────────────────────────────────

@csrf_exempt
def register_view(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST method required'}, status=405)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    username = data.get('username', '').strip()
    password = data.get('password', '')
    email    = data.get('email', '').strip()

    if not username or not password:
        return JsonResponse({'error': 'Username and password are required'}, status=400)

    if User.objects.filter(username=username).exists():
        return JsonResponse({'error': 'Username already exists'}, status=400)

    user = User.objects.create_user(username=username, password=password, email=email)
    login(request, user)
    return JsonResponse({'message': 'Registered and logged in successfully',
                         'username': user.username})


@csrf_exempt
def login_view(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST method required'}, status=405)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    username = data.get('username', '').strip()
    password = data.get('password', '')

    if not username or not password:
        return JsonResponse({'error': 'Username and password are required'}, status=400)

    user = authenticate(request, username=username, password=password)
    if user is not None:
        login(request, user)
        return JsonResponse({'message': 'Login successful', 'username': user.username})

    return JsonResponse({'error': 'Invalid credentials'}, status=401)


def logout_view(request):
    logout(request)
    return JsonResponse({'message': 'Logged out successfully'})


def user_info_view(request):
    """Return current authentication state."""
    if request.user.is_authenticated:
        return JsonResponse({'is_authenticated': True,
                             'username': request.user.username})
    return JsonResponse({'is_authenticated': False}, status=401)


# ──────────────────────────────────────────────────────────────
# BARANGAY API ENDPOINTS
# ──────────────────────────────────────────────────────────────

_DEFAULT_BARANGAYS = [
    "Agusan Canyon", "Alae", "Dahilayan", "Dalirig", "Damilag", "Diclum",
    "Guilang-guilang", "Kalugmanan", "Lindaban", "Lingion", "Lunocan", "Maluko",
    "Mambatangan", "Mampayag", "Mantibugao", "Minsuro", "San Miguel", "Sankanan",
    "Santiago", "Santo Niño", "Tankulan", "Ticala",
]


def _seed_barangays():
    """Seed the 22 default barangays if the table is empty."""
    if not Barangay.objects.exists():
        Barangay.objects.bulk_create(
            [Barangay(name=n) for n in _DEFAULT_BARANGAYS],
            ignore_conflicts=True,
        )


def barangays_api(request):
    """Return all barangays as a JSON array: [{id, name}, ...]"""
    _seed_barangays()
    data = list(Barangay.objects.all().order_by('name').values('id', 'name'))
    return JsonResponse(data, safe=False)


def barangay_summary(request, bid):
    """Return aggregated demographic summary for a single barangay."""
    barangay = get_object_or_404(Barangay, id=bid)
    youths   = Youth.objects.filter(barangay=barangay)

    age_counts   = {}
    sex_by_age   = {}
    civil_by_age = {}
    edu_by_age   = {}

    for y in youths:
        age = str(y.age)
        age_counts[age] = age_counts.get(age, 0) + 1

        for bucket, key in [
            (sex_by_age,   y.sex             or 'Unknown'),
            (civil_by_age, y.civil_status    or 'Unknown'),
            (edu_by_age,   y.education_level or 'Unknown'),
        ]:
            bucket.setdefault(key, {})
            bucket[key][age] = bucket[key].get(age, 0) + 1

    sex_counts = {
        r['sex'] or 'Unknown': r['count']
        for r in youths.values('sex').annotate(count=Count('id'))
    }
    civil_counts = {
        r['civil_status'] or 'Unknown': r['count']
        for r in youths.values('civil_status').annotate(count=Count('id'))
    }
    edu_counts = {
        r['education_level'] or 'Unknown': r['count']
        for r in youths.values('education_level').annotate(count=Count('id'))
    }

    return JsonResponse({
        'barangay_id':       barangay.id,
        'barangay_name':     barangay.name,
        'total':             youths.count(),
        'sex':               sex_counts,
        'sex_by_age':        sex_by_age,
        'ages':              age_counts,
        'civil_status':      civil_counts,
        'civil_by_age':      civil_by_age,
        'education':         edu_counts,
        'education_by_age':  edu_by_age,
        'pwd':               youths.filter(is_pwd=True).count(),
        'fourps':            youths.filter(is_4ps=True).count(),
        'osy':               youths.filter(is_osy=True).count(),
        'osy_male':          youths.filter(is_osy=True, sex='Male').count(),
        'osy_female':        youths.filter(is_osy=True, sex='Female').count(),
    })


def demographics_api(request):
    """Per-barangay demographic breakdown used by the reports stacked chart."""
    _seed_barangays()

    barangays = list(Barangay.objects.all().order_by('name'))
    demo_data = {b.name: {'isy': 0, 'osy': 0, 'yd': 0, 'iy': 0, 'wk': 0, 'uy': 0}
                 for b in barangays}

    for y in (Youth.objects
              .select_related('barangay')
              .values('barangay__name', 'is_in_school', 'is_osy',
                      'is_working_youth', 'is_pwd', 'is_4ps')):
        name = y['barangay__name']
        if name not in demo_data:
            continue
        d = demo_data[name]
        if y['is_in_school']:     d['isy'] += 1
        if y['is_osy']:           d['osy'] += 1
        if y['is_working_youth']: d['wk']  += 1
        if y['is_pwd']:           d['iy']  += 1
        if y['is_4ps']:           d['yd']  += 1
        if not any([y['is_in_school'], y['is_osy'],
                    y['is_working_youth'], y['is_pwd'], y['is_4ps']]):
            d['uy'] += 1

    return JsonResponse(demo_data)


# ──────────────────────────────────────────────────────────────
# YOUTH CRUD API
# ──────────────────────────────────────────────────────────────

@csrf_exempt
def youth_api(request):
    """
    GET  — public list of all youth profiles
    POST — create a new profile (auth required)
    PUT  — update an existing profile (auth required)
    DELETE — remove a profile (auth required)
    """

    # ── GET: list ──────────────────────────────────────────────
    if request.method == 'GET':
        youths = Youth.objects.select_related('barangay').all()
        data = []
        for y in youths:
            data.append({
                'id':              y.id,
                'name':            y.name,
                'age':             y.age,
                'sex':             y.sex,
                'barangay_name':   y.barangay.name,
                'barangay_id':     y.barangay.id,
                'education_level': y.education_level,
                'full_data': {
                    'birthdate':                str(y.birthdate) if y.birthdate else '',
                    'civil_status':             y.civil_status,
                    'religion':                 y.religion,
                    'purok':                    y.purok,
                    'barangay_id':              y.barangay.id,
                    'email':                    y.email,
                    'contact_number':           y.contact_number,
                    'is_in_school':             y.is_in_school,
                    'is_osy':                   y.is_osy,
                    'osy_willing_to_enroll':    y.osy_willing_to_enroll,
                    'osy_program_type':         y.osy_program_type,
                    'osy_reason_no_enroll':     y.osy_reason_no_enroll,
                    'is_working_youth':         y.is_working_youth,
                    'is_pwd':                   y.is_pwd,
                    'disability_type':          y.disability_type,
                    'has_specific_needs':       y.has_specific_needs,
                    'specific_needs_condition': y.specific_needs_condition,
                    'is_ip':                    y.is_ip,
                    'tribe_name':               y.tribe_name,
                    'is_muslim':                y.is_muslim,
                    'muslim_group':             y.muslim_group,
                    'course':                   y.course,
                    'school_name':              y.school_name,
                    'is_scholar':               y.is_scholar,
                    'scholarship_program':      y.scholarship_program,
                    'work_status':              y.work_status,
                    'registered_voter_sk':      y.registered_voter_sk,
                    'registered_voter_national':y.registered_voter_national,
                    'voted_last_sk':            y.voted_last_sk,
                    'attended_kk_assembly':     y.attended_kk_assembly,
                    'kk_assembly_times':        y.kk_assembly_times,
                    'kk_assembly_no_reason':    y.kk_assembly_no_reason,
                    'is_4ps':                   y.is_4ps,
                    'number_of_children':       y.number_of_children,
                },
            })
        return JsonResponse(data, safe=False)

    # ── All mutating operations require authentication ──────────
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Unauthorized. Please login.'}, status=401)

    # ── POST / PUT ─────────────────────────────────────────────
    if request.method in ('POST', 'PUT'):
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)

        try:
            name = data.get('name', '').strip()
            if not name:
                return JsonResponse({'error': 'Name is required'}, status=400)
            if _contains_profanity(name):
                return JsonResponse(
                    {'error': 'Inappropriate language detected in name.'}, status=400)

            barangay = get_object_or_404(Barangay, id=data.get('barangay_id'))

            def get_bool(key):
                return bool(data.get(key, False))

            def get_int(key, default=0):
                try:
                    return int(data.get(key) or default)
                except (ValueError, TypeError):
                    return default

            fields = {
                'name':             name,
                'birthdate':        data.get('birthdate') or None,
                'sex':              data.get('sex'),
                'civil_status':     data.get('civil_status'),
                'religion':         data.get('religion'),
                'purok':            data.get('purok'),
                'barangay':         barangay,
                'email':            data.get('email'),
                'contact_number':   data.get('contact_number'),
                'is_in_school':     get_bool('is_in_school'),
                'is_osy':           get_bool('is_osy'),
                'osy_willing_to_enroll': get_bool('osy_willing_to_enroll'),
                'osy_program_type': data.get('osy_program_type'),
                'osy_reason_no_enroll': data.get('osy_reason_no_enroll'),
                'is_working_youth': get_bool('is_working_youth'),
                'is_pwd':           get_bool('is_pwd'),
                'disability_type':  data.get('disability_type'),
                'has_specific_needs': get_bool('has_specific_needs'),
                'specific_needs_condition': data.get('specific_needs_condition'),
                'is_ip':            get_bool('is_ip'),
                'tribe_name':       data.get('tribe_name'),
                'is_muslim':        get_bool('is_muslim'),
                'muslim_group':     data.get('muslim_group'),
                'education_level':  data.get('education_level'),
                'course':           data.get('course'),
                'school_name':      data.get('school_name'),
                'is_scholar':       get_bool('is_scholar'),
                'scholarship_program': data.get('scholarship_program'),
                'work_status':      data.get('work_status'),
                'registered_voter_sk':      get_bool('registered_voter_sk'),
                'registered_voter_national': get_bool('registered_voter_national'),
                'voted_last_sk':    get_bool('voted_last_sk'),
                'attended_kk_assembly': get_bool('attended_kk_assembly'),
                'kk_assembly_times': get_int('kk_assembly_times'),
                'kk_assembly_no_reason': data.get('kk_assembly_no_reason'),
                'is_4ps':           get_bool('is_4ps'),
                'number_of_children': get_int('number_of_children'),
            }

            if request.method == 'POST':
                Youth.objects.create(**fields)
                return JsonResponse({'message': 'Youth profile added successfully'})

            # PUT — update existing record
            youth_id = data.get('id')
            if not youth_id:
                return JsonResponse({'error': 'ID is required for update'}, status=400)
            youth = get_object_or_404(Youth, id=youth_id)
            for key, value in fields.items():
                setattr(youth, key, value)
            youth.save()
            return JsonResponse({'message': 'Youth profile updated successfully'})

        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)

    # ── DELETE ─────────────────────────────────────────────────
    if request.method == 'DELETE':
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)

        try:
            youth = get_object_or_404(Youth, id=data.get('id'))
            youth.delete()
            return JsonResponse({'message': 'Youth profile deleted successfully'})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)

    return JsonResponse({'error': 'Method not allowed'}, status=405)
