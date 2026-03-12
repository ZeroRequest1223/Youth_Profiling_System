import json
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.contrib.auth.decorators import login_required
from .models import Youth, Barangay
from better_profanity import profanity

# Load profanity filter
profanity.load_censor_words()
custom_bad_words = ['gago', 'puta', 'yawa', 'piste']
profanity.add_censor_words(custom_bad_words)

# --- AUTH VIEWS ---

@csrf_exempt
def register_view(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        username = data.get('username')
        password = data.get('password')
        email = data.get('email', '')

        if User.objects.filter(username=username).exists():
            return JsonResponse({'error': 'Username already exists'}, status=400)
        
        # Create user
        user = User.objects.create_user(username=username, password=password, email=email)
        user.save()
        
        # Auto-login after register
        login(request, user)
        return JsonResponse({'message': 'Registered and logged in successfully'})
    return JsonResponse({'error': 'POST method required'}, status=405)

@csrf_exempt
def login_view(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        username = data.get('username')
        password = data.get('password')
        
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            return JsonResponse({'message': 'Login successful', 'username': user.username})
        else:
            return JsonResponse({'error': 'Invalid credentials'}, status=401)
    return JsonResponse({'error': 'POST method required'}, status=405)

def logout_view(request):
    logout(request)
    return JsonResponse({'message': 'Logged out successfully'})

def user_info_view(request):
    """Check if user is logged in"""
    if request.user.is_authenticated:
        return JsonResponse({'is_authenticated': True, 'username': request.user.username})
    return JsonResponse({'is_authenticated': False}, status=401)


def barangays_api(request):
    """Return list of barangays as JSON (id and name)."""
    b = Barangay.objects.all().order_by('name')
    # If no barangays exist, seed a default list so frontend can function
    if not b.exists():
        default_names = [
            "Agusan Canyon","Alae","Dahilayan","Dalirig","Damilag","Diclum",
            "Guilang-guilang","Kalugmanan","Lindaban","Lingion","Lunocan","Maluko",
            "Mambatangan","Mampayag","Mantibugao","Minsuro","San Miguel","Sankanan",
            "Santiago","Santo Niño","Tankulan","Ticala"
        ]
        for name in default_names:
            Barangay.objects.create(name=name)
        b = Barangay.objects.all().order_by('name')

    data = [{'id': bg.id, 'name': bg.name} for bg in b]
    return JsonResponse(data, safe=False)


def barangay_summary(request, bid):
    """Return aggregated demographics summary for a barangay."""
    from django.db.models import Count, Q

    barangay = get_object_or_404(Barangay, id=bid)
    youths = Youth.objects.filter(barangay=barangay)

    # Sex counts
    sex_counts = youths.values('sex').annotate(count=Count('id'))

    # Compute age counts by Python to avoid complex DB functions
    age_counts = {}
    import datetime
    # counters for age-range and sex-specific special counts
    age_15_30_male = 0
    age_15_30_female = 0
    # Also compute per-age breakdowns for sex, civil status, and education to support table layout
    sex_by_age = {}
    civil_by_age = {}
    edu_by_age = {}
    # per-age per-category sex breakdowns for PDF table
    age_category_table = {}
    categories = ['in_school','osy','pwd','ip','working','unemployed']
    for y in youths:
        a = y.age
        age_counts[str(a)] = age_counts.get(str(a), 0) + 1

        # Sex by age
        s = (y.sex or 'Unknown')
        sex_by_age.setdefault(s, {})
        sex_by_age[s][str(a)] = sex_by_age[s].get(str(a), 0) + 1

        # Civil status by age
        cs = (y.civil_status or 'Unknown')
        civil_by_age.setdefault(cs, {})
        civil_by_age[cs][str(a)] = civil_by_age[cs].get(str(a), 0) + 1

        # Education by age
        ed = (y.education_level or 'Unknown')
        edu_by_age.setdefault(ed, {})
        edu_by_age[ed][str(a)] = edu_by_age[ed].get(str(a), 0) + 1

        # Age-range counters for 15-30 by sex
        try:
            if a is not None and 15 <= int(a) <= 30:
                if s == 'Male':
                    age_15_30_male += 1
                elif s == 'Female':
                    age_15_30_female += 1
        except Exception:
            pass

        # per-age category breakdowns
        age_key = str(a)
        if age_key not in age_category_table:
            age_category_table[age_key] = {c: {'male':0, 'female':0, 'total':0} for c in categories}
        # helper: inc category counters
        def inc_cat(cat, sex):
            rec = age_category_table[age_key][cat]
            if sex == 'Male':
                rec['male'] += 1
            elif sex == 'Female':
                rec['female'] += 1
            rec['total'] += 1

        if y.is_in_school:
            inc_cat('in_school', s)
        if y.is_osy:
            inc_cat('osy', s)
        if y.is_pwd:
            inc_cat('pwd', s)
        if y.is_ip:
            inc_cat('ip', s)
        if y.is_working_youth:
            inc_cat('working', s)
        if getattr(y, 'is_unemployed', False):
            inc_cat('unemployed', s)

    # Civil status counts
    civil_counts = youths.values('civil_status').annotate(count=Count('id'))

    # Education level counts
    edu_counts = youths.values('education_level').annotate(count=Count('id'))

    # PWD / 4Ps / OSY counts
    pwd = youths.filter(is_pwd=True).count()
    fourps = youths.filter(is_4ps=True).count()
    osy = youths.filter(is_osy=True).count()
    # OSY split by sex
    osy_male = youths.filter(is_osy=True, sex='Male').count()
    osy_female = youths.filter(is_osy=True, sex='Female').count()

    # Working youth counts
    working_male = youths.filter(is_working_youth=True, sex='Male').count()
    working_female = youths.filter(is_working_youth=True, sex='Female').count()
    working_total = youths.filter(is_working_youth=True).count()

    # Unemployed youth counts (model field `is_unemployed`)
    unemployed_male = youths.filter(is_unemployed=True, sex='Male').count()
    unemployed_female = youths.filter(is_unemployed=True, sex='Female').count()
    unemployed_total = youths.filter(is_unemployed=True).count()

    # PWD split by sex
    pwd_male = youths.filter(is_pwd=True, sex='Male').count()
    pwd_female = youths.filter(is_pwd=True, sex='Female').count()

    # IP split by sex
    ip_male = youths.filter(is_ip=True, sex='Male').count()
    ip_female = youths.filter(is_ip=True, sex='Female').count()
    ip_total = youths.filter(is_ip=True).count()

    data = {
        'barangay_id': barangay.id,
        'barangay_name': barangay.name,
        'total': youths.count(),
        'sex': {item['sex'] or 'Unknown': item['count'] for item in sex_counts},
        'sex_by_age': sex_by_age,
        'ages': age_counts,
        'civil_status': {item['civil_status'] or 'Unknown': item['count'] for item in civil_counts},
        'civil_by_age': civil_by_age,
        'education': {item['education_level'] or 'Unknown': item['count'] for item in edu_counts},
        'education_by_age': edu_by_age,
        'age_category_table': age_category_table,
        'pwd': pwd,
        'pwd_male': pwd_male,
        'pwd_female': pwd_female,
        'fourps': fourps,
        'osy': osy,
        'osy_male': osy_male,
        'osy_female': osy_female,
        'working_male': working_male,
        'working_female': working_female,
        'working_total': working_total,
        'unemployed_male': unemployed_male,
        'unemployed_female': unemployed_female,
        'unemployed_total': unemployed_total,
        'ip_male': ip_male,
        'ip_female': ip_female,
        'ip_total': ip_total,
        'age_15_30_male': age_15_30_male,
        'age_15_30_female': age_15_30_female,
    }
    return JsonResponse(data)


def report_responder_types(request):
    """Return responder type distribution for reports page.
    No dedicated responder model exists in this project, so return
    a sensible default distribution. This endpoint can later be
    updated to aggregate real responder data if/when that model
    is added.
    """
    data = {
        'labels': ['Bureau of Fire Protection', 'Local Government Unit (LGU)', 'Volunteer Fire Brigades', 'Private'],
        'values': [60, 30, 6, 4]
    }
    return JsonResponse(data)


def report_top_cities(request):
    """Return top municipalities by youth record count as a proxy for incidents.
    Uses `Youth.municipality` aggregation where available; falls back to
    sample data if no records exist.
    """
    from django.db.models import Count

    # Prefer aggregating by Barangay name so the frontend legend shows barangays
    qs = Youth.objects.values('barangay__name').annotate(count=Count('id')).order_by('-count')
    labels = [r['barangay__name'] or 'Unknown' for r in qs[:30]]
    values = [r['count'] for r in qs[:30]]

    # If no youths exist, fall back to the Barangay table (zero counts) so
    # the frontend legend can still display actual barangay names.
    if len(labels) == 0:
        bgs = Barangay.objects.all().order_by('name')
        if bgs.exists():
            labels = [b.name for b in bgs[:30]]
            values = [0 for _ in labels]
        else:
            # final fallback sample matching the example screenshots
            labels = ['Taguig','Cebu','Quezon City','Tagbilaran','Makati','Paranaque','Guiguinto','Cainta','Cagayan De Oro','Pasig','Manila','Muntinlupa','Orion','Dasmarinas','Antipolo','Santa Rosa','Malate','Pasay','Hagonoy','Arayat','Zamboanga','Ilagan','Valenzuela','Bacolod','Iloilo','Naga','Lipa','Lapu-Lapu','Marikina','Sagay']
            values = [920,380,320,305,280,210,160,150,140,135,120,110,105,100,98,95,90,88,85,82,76,70,68,65,62,60,58,55,50]

    return JsonResponse({'labels': labels, 'values': values})


def report_avg_response_time(request):
    """Return average response time per responder type.
    No response-time data model exists; return sample values (in seconds)
    so Chart.js can render minutes by dividing values on the frontend.
    """
    data = {
        'labels': ['Bureau of Fire Protection','Local Government Unit (LGU)','Volunteer Fire Brigades','Private'],
        'values': [1200, 1400, 1700, 1500]  # example seconds values
    }
    return JsonResponse(data)


def login_page(request):
    """Render standalone login page."""
    return render(request, 'login.html')


def reports_page(request, bid=None):
    """Render the reports frontend page.

    If `bid` (barangay id) is provided, pass it to the template so the
    frontend can request barangay-specific data. This makes the URL
    (/reports/<bid>/) reflect the database's barangays.
    """
    # Build top-cities data from the Barangay table and Youth counts so
    # the frontend legend shows the actual barangay names from the DB.
    from django.db.models import Count

    bgs = list(Barangay.objects.all().order_by('name').values('id', 'name'))
    labels = [b['name'] for b in bgs]
    values = []
    for b in bgs:
        cnt = Youth.objects.filter(barangay_id=b['id']).count()
        values.append(cnt)

    top_cities = {'labels': labels, 'values': values}

    # Provide responder and avg-response placeholders so the template
    # can use server-provided values if desired.
    responder = {
        'labels': ['Bureau of Fire Protection', 'Local Government Unit (LGU)', 'Volunteer Fire Brigades', 'Private'],
        'values': [60, 30, 6, 4]
    }
    avg_resp = {
        'labels': responder['labels'],
        'values': [1200, 1400, 1700, 1500]
    }

    context = {
        'barangay_id': bid,
        'top_cities_json': json.dumps(top_cities),
        'responder_json': json.dumps(responder),
        'avg_json': json.dumps(avg_resp),
    }
    return render(request, 'reports.html', context)

# --- APP VIEWS ---

@ensure_csrf_cookie
def index(request):
    """Serves the frontend HTML page"""
    return render(request, 'dashboard.html')

@csrf_exempt
def youth_api(request):
    """Handles Listing (GET) and Full Profile CRUD"""

    # 1. GET: List all youths
    if request.method == 'GET':
        youths = Youth.objects.all().select_related('barangay') # Optimized query
        data = []
        for y in youths:
            data.append({
                'id': y.id,
                'name': y.name,
                'age': y.age,
                'sex': y.sex,
                'barangay_name': y.barangay.name, # Helper for display
                'barangay_id': y.barangay.id,     # Helper for filtering
                'education_level': y.education_level,
                'full_data': { 
                    'birthdate': str(y.birthdate) if y.birthdate else '',
                    'civil_status': y.civil_status,
                    'religion': y.religion,
                    'purok': y.purok,
                    'barangay_id': y.barangay.id,
                    'email': y.email,
                    'contact_number': y.contact_number,
                    'is_in_school': y.is_in_school,
                    'is_osy': y.is_osy,
                    'osy_willing_to_enroll': y.osy_willing_to_enroll,
                    'osy_program_type': y.osy_program_type,
                    'osy_reason_no_enroll': y.osy_reason_no_enroll,
                    'is_working_youth': y.is_working_youth,
                    'is_pwd': y.is_pwd,
                    'is_unemployed': y.is_unemployed,
                    'disability_type': y.disability_type,
                    'has_specific_needs': y.has_specific_needs,
                    'specific_needs_condition': y.specific_needs_condition,
                    'is_ip': y.is_ip,
                    'tribe_name': y.tribe_name,
                    'is_muslim': y.is_muslim,
                    'muslim_group': y.muslim_group,
                    'course': y.course,
                    'school_name': y.school_name,
                    'is_scholar': y.is_scholar,
                    'scholarship_program': y.scholarship_program,
                    'work_status': y.work_status,
                    'registered_voter_sk': y.registered_voter_sk,
                    'registered_voter_national': y.registered_voter_national,
                    'voted_last_sk': y.voted_last_sk,
                    'attended_kk_assembly': y.attended_kk_assembly,
                    'kk_assembly_times': y.kk_assembly_times,
                    'kk_assembly_no_reason': y.kk_assembly_no_reason,
                    'is_4ps': y.is_4ps,
                    'number_of_children': y.number_of_children,
                }
            })
        return JsonResponse(data, safe=False)

    # ... (Keep the rest of the Authentication check and POST/PUT/DELETE logic exactly the same) ...
    # Copy the previous POST/PUT/DELETE code here if you deleted it.
    
    # 2. AUTH CHECK
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Unauthorized. Please login.'}, status=401)

    # 3. POST/PUT Logic (Same as before)
    if request.method in ['POST', 'PUT']:
        try:
            data = json.loads(request.body)
           
           
            if profanity.contains_profanity(data.get('name', '')):
                return JsonResponse({'error': 'Profanity detected in name.'}, status=400)

            barangay = get_object_or_404(Barangay, id=data.get('barangay_id'))
            def get_bool(key): return data.get(key, False)
            
            fields = {
                'name': data.get('name'),
                'birthdate': data.get('birthdate') or None,
                'sex': data.get('sex'),
                'civil_status': data.get('civil_status'),
                'religion': data.get('religion'),
                'purok': data.get('purok'),
                'barangay': barangay,
                'email': data.get('email'),
                'contact_number': data.get('contact_number'),
                'is_in_school': get_bool('is_in_school'),
                'is_osy': get_bool('is_osy'),
                'osy_willing_to_enroll': get_bool('osy_willing_to_enroll'),
                'osy_program_type': data.get('osy_program_type'),
                'osy_reason_no_enroll': data.get('osy_reason_no_enroll'),
                'is_working_youth': get_bool('is_working_youth'),
                'is_pwd': get_bool('is_pwd'),
                'is_unemployed': get_bool('is_unemployed'),
                'disability_type': data.get('disability_type'),
                'has_specific_needs': get_bool('has_specific_needs'),
                'specific_needs_condition': data.get('specific_needs_condition'),
                'is_ip': get_bool('is_ip'),
                'tribe_name': data.get('tribe_name'),
                'is_muslim': get_bool('is_muslim'),
                'muslim_group': data.get('muslim_group'),
                'education_level': data.get('education_level'),
                'course': data.get('course'),
                'school_name': data.get('school_name'),
                'is_scholar': get_bool('is_scholar'),
                'scholarship_program': data.get('scholarship_program'),
                'work_status': data.get('work_status'),
                'registered_voter_sk': get_bool('registered_voter_sk'),
                'registered_voter_national': get_bool('registered_voter_national'),
                'voted_last_sk': get_bool('voted_last_sk'),
                'attended_kk_assembly': get_bool('attended_kk_assembly'),
                'kk_assembly_times': int(data.get('kk_assembly_times') or 0),
                'kk_assembly_no_reason': data.get('kk_assembly_no_reason'),
                'is_4ps': get_bool('is_4ps'),
                'number_of_children': int(data.get('number_of_children') or 0),
            }

            if request.method == 'POST':
                Youth.objects.create(**fields)
                return JsonResponse({'message': 'Youth added successfully'})
            elif request.method == 'PUT':
                youth = get_object_or_404(Youth, id=data.get('id'))
                for key, value in fields.items(): setattr(youth, key, value)
                youth.save()
                return JsonResponse({'message': 'Updated successfully'})

        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)

    elif request.method == 'DELETE':
        try:
            data = json.loads(request.body)
            youth = get_object_or_404(Youth, id=data.get('id'))
            youth.delete()
            return JsonResponse({'message': 'Deleted successfully'})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)
    
    return JsonResponse({'error': 'Method not allowed'}, status=405)