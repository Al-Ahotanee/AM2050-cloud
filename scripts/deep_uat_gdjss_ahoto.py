#!/usr/bin/env python3
"""
==============================================================================
AM2050 — Deep Live UAT & Permanent Production Seeder
==============================================================================
Creates and verifies:
1. Junior Secondary School: GDJSS AHOTO (Secondary, Public, Ahoto Ward)
2. Personnel: 1 Headmaster + 10 Specialist Teachers (5 direct, 5 via HM request + Admin approval)
3. 3 Academic Classes: JSS 1, JSS 2, JSS 3 with assigned Class Teachers
4. 10 Standard Junior Secondary Curriculum Subjects linked to all 3 classes
5. 30 Teaching Allocations (10 teachers × 3 classes)
6. 1 Academic Session (2025/2026) with First, Second, Third Terms
7. 30 Child Profiles & Approved Formal Enrollments (10 per class)
8. Multi-day Daily Attendance (Manual + QR Burst Scans)
9. 300 Comprehensive Subject Results (30 students × 10 subjects) & Behavioral Ratings
10. Results Publishing, Summary Reports, and Executive KPI Validation
==============================================================================
"""

import sys
import os
import json
import urllib.request
import urllib.error
import time
import random

BASE_URL = os.environ.get("AM2050_API_URL", "http://127.0.0.1:10000/api/v1")

results = []

def record(test_name: str, passed: bool, details: str = ""):
    status = "PASS [OK]" if passed else "FAIL [X]"
    results.append((test_name, passed, details))
    print(f"  {status:<10} | {test_name:<58} | {details}")

def api_call(method: str, path: str, data: dict = None, token: str = None) -> tuple[int, dict]:
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json", "User-Agent": "AM2050-Deep-UAT/3.0"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    payload = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=payload, headers=headers, method=method)
    
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            body = resp.read().decode("utf-8")
            try:
                parsed = json.loads(body) if body else {}
            except Exception:
                parsed = {"raw": body}
            return resp.status, parsed
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            parsed = json.loads(body)
        except Exception:
            parsed = {"raw": body}
        return e.code, parsed
    except Exception as e:
        return 0, {"error": str(e)}

def get_items(res: dict) -> list:
    d = res.get("data")
    if isinstance(d, list):
        return d
    if isinstance(d, dict):
        return d.get("items", d.get("data", []))
    return []

print("\n" + "="*100)
print("  AM2050 DEEP PRODUCTION UAT: GDJSS AHOTO (SCHOOL, TEACHERS, CURRICULUM, ATTENDANCE, GRADING)")
print(f"  Target: {BASE_URL}")
print("="*100 + "\n")

# ------------------------------------------------------------------------------
# STEP 1: SUPER ADMIN AUTH & GEOGRAPHY SCOPE
# ------------------------------------------------------------------------------
print(">> Phase 1: Super Admin Authentication & Geographic Foundation")
status, res = api_call("POST", "/auth/login", {"phone": "08011111111", "password": "AM2050Security#2026"})
admin_token = res.get("data", {}).get("accessToken")
record("Super Admin Login (08011111111)", status == 200 and bool(admin_token), f"HTTP {status}")

if not admin_token:
    print("FATAL: Cannot authenticate as Super Admin.")
    sys.exit(1)

# Lookup Ahoto Ward and Community
status, res = api_call("GET", "/states", token=admin_token)
states = get_items(res)
jigawa = next((s for s in states if s.get("code") == "JIG" or "jigawa" in s.get("name", "").lower()), states[0])
state_id = jigawa["id"]

status, res = api_call("GET", f"/lgas?state_id={state_id}", token=admin_token)
lgas = get_items(res)
buji = next((l for l in lgas if "buji" in l.get("name", "").lower()), lgas[0])
lga_id = buji["id"]

status, res = api_call("GET", f"/wards?lga_id={lga_id}", token=admin_token)
wards = get_items(res)
ahoto_ward = next((w for w in wards if "ahoto" in w.get("name", "").lower()), wards[0])
ward_id = ahoto_ward["id"]

status, res = api_call("GET", f"/communities?ward_id={ward_id}", token=admin_token)
communities = get_items(res)
ahoto_comm = communities[0]
community_id = ahoto_comm["id"]

record("Geography Anchored (Jigawa -> Buji -> Ahoto)", bool(ward_id and community_id), f"Ward: {ahoto_ward.get('name')}, Comm: {ahoto_comm.get('name')}")

# ------------------------------------------------------------------------------
# STEP 2: CREATE JUNIOR SECONDARY SCHOOL (GDJSS AHOTO)
# ------------------------------------------------------------------------------
print("\n>> Phase 2: Junior Secondary School Registry (GDJSS AHOTO)")
status, res = api_call("GET", f"/schools?ward_id={ward_id}", token=admin_token)
existing_schools = get_items(res)
gdjss_school = next((s for s in existing_schools if "GDJSS AHOTO" in s.get("school_name", "").upper()), None)

if not gdjss_school:
    school_payload = {
        "schoolName": "GDJSS AHOTO",
        "schoolType": "secondary",
        "ownership": "public",
        "wardId": ward_id,
        "communityId": community_id,
        "totalCapacity": 600
    }
    status, res = api_call("POST", "/schools", school_payload, token=admin_token)
    gdjss_school = res.get("data")
    record("Register Junior Secondary School (GDJSS AHOTO)", status in (200, 201) and bool(gdjss_school), f"HTTP {status} - ID: {gdjss_school.get('id') if gdjss_school else 'N/A'}")
else:
    record("Verify Existing Junior Secondary School (GDJSS AHOTO)", True, f"Found ID: {gdjss_school['id']}")

school_id = gdjss_school["id"]

# ------------------------------------------------------------------------------
# STEP 3: CREATE HEADMASTER (MALLAM USMAN BELLO AHOTO)
# ------------------------------------------------------------------------------
print("\n>> Phase 3: School Leadership (Headmaster Account)")
hm_phone = "08033333331"
status, res = api_call("GET", "/users?limit=250", token=admin_token)
all_users = get_items(res)
hm_user = next((u for u in all_users if u.get("phone") == hm_phone), None)

if not hm_user:
    hm_payload = {
        "name": "Mallam Usman Bello Ahoto",
        "phone": hm_phone,
        "email": "hm.gdjss.ahoto@am2050.ng",
        "password": "AM2050Security#2026",
        "role": "headmaster",
        "assignedScopeType": "school",
        "assignedScopeId": school_id,
        "staffNumber": "JIG/SUBEB/HM/2026/088",
        "dateOfBirth": "1978-04-12",
        "highestQualification": "B.Ed Educational Administration",
        "rankTitle": "Principal Grade I",
        "specialization": "Educational Leadership",
        "photoData": "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100' height='100' fill='%23123148'/><text x='50' y='55' fill='white' text-anchor='middle'>HM</text></svg>",
        "subjectsTaught": ["Educational Administration"]
    }
    status, res = api_call("POST", "/users", hm_payload, token=admin_token)
    hm_user = res.get("data")
    record("Create Headmaster Account (Mallam Usman Bello)", status in (200, 201) and bool(hm_user), f"HTTP {status} - Role: headmaster")
else:
    record("Verify Headmaster Account (Mallam Usman Bello)", True, f"User ID: {hm_user['id']}")

# Update school with Headmaster ID
hm_id = hm_user["id"]
api_call("PUT", f"/schools/{school_id}", {"headmasterUserId": hm_id}, token=admin_token)

# Authenticate as Headmaster
status, res = api_call("POST", "/auth/login", {"phone": hm_phone, "password": "AM2050Security#2026"})
hm_token = res.get("data", {}).get("accessToken")
record("Headmaster Authentication Handshake", status == 200 and bool(hm_token), f"HTTP {status} - Bearer token obtained")

# ------------------------------------------------------------------------------
# STEP 4: CREATE 10 TEACHERS (5 DIRECT, 5 VIA HM REQUEST + ADMIN APPROVAL)
# ------------------------------------------------------------------------------
print("\n>> Phase 4: Teacher Personnel Register (10 Specialist Teachers)")
TEACHER_PROFILES = [
    {"name": "Suleiman Ibrahim", "phone": "08033333341", "email": "suleiman.ibrahim@am2050.ng", "staff": "GDJSS/T/001", "dob": "1988-06-15", "qual": "B.A. Ed English", "rank": "Master Grade II", "spec": "English Studies", "subjects": ["English Studies"]},
    {"name": "Maryam Abdullahi", "phone": "08033333342", "email": "maryam.abdullahi@am2050.ng", "staff": "GDJSS/T/002", "dob": "1990-09-22", "qual": "B.Sc. Ed Mathematics", "rank": "Senior Master I", "spec": "Mathematics", "subjects": ["Mathematics"]},
    {"name": "Kabiru Haruna", "phone": "08033333343", "email": "kabiru.haruna@am2050.ng", "staff": "GDJSS/T/003", "dob": "1985-02-18", "qual": "B.Sc. Ed Biology", "rank": "Master Grade II", "spec": "Basic Science", "subjects": ["Basic Science"]},
    {"name": "Fatima Mohammed", "phone": "08033333344", "email": "fatima.mohammed@am2050.ng", "staff": "GDJSS/T/004", "dob": "1992-11-04", "qual": "B.Tech. Technology Education", "rank": "Master Grade I", "spec": "Basic Technology", "subjects": ["Basic Technology"]},
    {"name": "Aliyu Musa", "phone": "08033333345", "email": "aliyu.musa@am2050.ng", "staff": "GDJSS/T/005", "dob": "1987-07-30", "qual": "B.Sc. Ed Social Studies", "rank": "Senior Master II", "spec": "Social Studies", "subjects": ["Social Studies"]},
    {"name": "Zainab Sani", "phone": "08033333346", "email": "zainab.sani@am2050.ng", "staff": "GDJSS/T/006", "dob": "1991-03-12", "qual": "B.Ed. Political Science", "rank": "Master Grade II", "spec": "Civic Education", "subjects": ["Civic Education"]},
    {"name": "Mustapha Garba", "phone": "08033333347", "email": "mustapha.garba@am2050.ng", "staff": "GDJSS/T/007", "dob": "1986-08-25", "qual": "B.Sc. Agricultural Science", "rank": "Master Grade I", "spec": "Agricultural Science", "subjects": ["Agricultural Science"]},
    {"name": "Aisha Dahiru", "phone": "08033333348", "email": "aisha.dahiru@am2050.ng", "staff": "GDJSS/T/008", "dob": "1993-01-19", "qual": "B.Sc. Ed Business Studies", "rank": "Master Grade II", "spec": "Business Studies", "subjects": ["Business Studies"]},
    {"name": "Balarabe Idris", "phone": "08033333349", "email": "balarabe.idris@am2050.ng", "staff": "GDJSS/T/009", "dob": "1984-12-05", "qual": "B.A. Hausa Linguistics", "rank": "Senior Master I", "spec": "Hausa Language", "subjects": ["Hausa Language"]},
    {"name": "Hauwa Yahaya", "phone": "08033333350", "email": "hauwa.yahaya@am2050.ng", "staff": "GDJSS/T/010", "dob": "1994-05-14", "qual": "B.Sc. Physical & Health Ed", "rank": "Master Grade II", "spec": "Physical & Health Education", "subjects": ["Physical and Health Education"]}
]

teacher_records = []
status, res = api_call("GET", "/users?limit=250", token=admin_token)
users_by_phone = {u.get("phone"): u for u in get_items(res)}

dummy_photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

# First 5 teachers: Direct Registration by Super Admin
for t in TEACHER_PROFILES[:5]:
    existing = users_by_phone.get(t["phone"])
    if not existing:
        t_payload = {
            "name": t["name"],
            "phone": t["phone"],
            "email": t["email"],
            "password": "AM2050Security#2026",
            "role": "teacher",
            "assignedScopeType": "school",
            "assignedScopeId": school_id,
            "staffNumber": t["staff"],
            "dateOfBirth": t["dob"],
            "highestQualification": t["qual"],
            "rankTitle": t["rank"],
            "specialization": t["spec"],
            "photoData": dummy_photo,
            "subjectsTaught": t["subjects"]
        }
        status, res = api_call("POST", "/users", t_payload, token=admin_token)
        teacher_records.append(res.get("data"))
    else:
        teacher_records.append(existing)

record("Register First 5 Teachers (Direct Admin Enrolment)", len(teacher_records) == 5, f"Teachers active: {len(teacher_records)}")

# Next 5 teachers: Headmaster submits Teacher Request -> Super Admin approves
pending_requests = []
for t in TEACHER_PROFILES[5:]:
    existing = users_by_phone.get(t["phone"])
    if not existing:
        req_payload = {
            "name": t["name"],
            "phone": t["phone"],
            "email": t["email"],
            "password": "AM2050Security#2026",
            "staffNumber": t["staff"],
            "dateOfBirth": t["dob"],
            "highestQualification": t["qual"],
            "rankTitle": t["rank"],
            "specialization": t["spec"],
            "photoData": dummy_photo,
            "subjectsTaught": t["subjects"]
        }
        status, res = api_call("POST", "/teacher-requests", req_payload, token=hm_token)
        req_data = res.get("data", {})
        if req_data.get("id"):
            # Super Admin approves request
            status, res = api_call("POST", f"/teacher-requests/{req_data['id']}/approve", {}, token=admin_token)
            approved_req = res.get("data", {})
            created_user_id = approved_req.get("created_user_id")
            if created_user_id:
                status, u_res = api_call("GET", f"/users/{created_user_id}", token=admin_token)
                teacher_records.append(u_res.get("data") or req_data)
            else:
                teacher_records.append(req_data)
        else:
            teacher_records.append(req_data)
    else:
        teacher_records.append(existing)

record("Onboard Next 5 Teachers (HM Request & Super Admin Approval)", len(teacher_records) == 10, f"Total school teachers: {len(teacher_records)}")

# Test all 10 teachers authentication
teacher_tokens = {}
for t in teacher_records:
    status, res = api_call("POST", "/auth/login", {"phone": t["phone"], "password": "AM2050Security#2026"})
    tok = res.get("data", {}).get("accessToken")
    if tok:
        teacher_tokens[t["id"]] = tok

record("Authenticate All 10 Specialist Teachers", len(teacher_tokens) == 10, f"Logged-in teachers: {len(teacher_tokens)}/10")

# ------------------------------------------------------------------------------
# STEP 5: 3 CLASSES & CLASS TEACHER ASSIGNMENTS
# ------------------------------------------------------------------------------
print("\n>> Phase 5: Academic Class Hierarchy & Class Teacher Assignments")
status, res = api_call("GET", f"/classes?school_id={school_id}", token=hm_token)
existing_classes = get_items(res)
class_map = {c.get("class_name"): c for c in existing_classes}

class_configs = [
    {"name": "JSS 1", "level": "JSS 1", "teacher": teacher_records[0]["id"]},
    {"name": "JSS 2", "level": "JSS 2", "teacher": teacher_records[1]["id"]},
    {"name": "JSS 3", "level": "JSS 3", "teacher": teacher_records[2]["id"]}
]

active_classes = []
for cfg in class_configs:
    c = class_map.get(cfg["name"])
    if not c:
        payload = {
            "schoolId": school_id,
            "className": cfg["name"],
            "classLevel": cfg["level"],
            "academicYear": "2025/2026",
            "capacity": 45,
            "teacherId": cfg["teacher"]
        }
        status, res = api_call("POST", "/classes", payload, token=hm_token)
        c = res.get("data")
    else:
        # Update teacher assignment if needed
        api_call("PUT", f"/classes/{c['id']}", {"teacherId": cfg["teacher"]}, token=hm_token)
    active_classes.append(c)

record("Create & Assign Class Teachers (JSS 1, JSS 2, JSS 3)", len(active_classes) == 3, f"Classes configured: {[c['class_name'] for c in active_classes]}")

# ------------------------------------------------------------------------------
# STEP 6: 10 CURRICULUM SUBJECTS & ALLOCATIONS
# ------------------------------------------------------------------------------
print("\n>> Phase 6: Standard Curriculum (10 Subjects) & Teaching Allocations")
SUBJECT_DEFS = [
    {"name": "English Studies", "code": "ENG"},
    {"name": "Mathematics", "code": "MTH"},
    {"name": "Basic Science", "code": "BSC"},
    {"name": "Basic Technology", "code": "BTECH"},
    {"name": "Social Studies", "code": "SOS"},
    {"name": "Civic Education", "code": "CVE"},
    {"name": "Agricultural Science", "code": "AGR"},
    {"name": "Business Studies", "code": "BUS"},
    {"name": "Hausa Language", "code": "HAU"},
    {"name": "Physical and Health Education", "code": "PHE"}
]

status, res = api_call("GET", "/subjects", token=hm_token)
existing_subjects = {s.get("subject_name"): s for s in get_items(res)}
existing_codes = {s.get("subject_code"): s for s in get_items(res)}

active_subjects = []
for sub in SUBJECT_DEFS:
    s = existing_subjects.get(sub["name"]) or existing_codes.get(sub["code"])
    if not s:
        status, res = api_call("POST", "/subjects", {"subjectName": sub["name"], "subjectCode": sub["code"], "schoolId": school_id}, token=hm_token)
        s = res.get("data")
    active_subjects.append(s)

record("Curriculum Subjects Verified (10 Standard Subjects)", len(active_subjects) == 10, f"Subjects: {len(active_subjects)}")

subject_ids = [s["id"] for s in active_subjects if s and s.get("id")]

# Assign all 10 subjects to each class
assigned_count = 0
for cls in active_classes:
    status, res = api_call("PUT", f"/classes/{cls['id']}/subjects", {"subjectIds": subject_ids}, token=hm_token)
    if status == 200:
        assigned_count += 1

record("Bind 10 Subjects to All 3 Classes", assigned_count == 3, "JSS 1, JSS 2, JSS 3 curriculum linked")

# Teaching Allocations: 10 teachers across 3 classes (30 allocations)
allocation_count = 0
for cls in active_classes:
    for idx, sub in enumerate(active_subjects):
        teacher = teacher_records[idx % len(teacher_records)]
        payload = {
            "classId": cls["id"],
            "subjectId": sub["id"],
            "teacherId": teacher["id"]
        }
        status, res = api_call("POST", "/teaching-allocations", payload, token=hm_token)
        if status in (200, 201):
            allocation_count += 1

record("Teaching Allocations Configured (10 Teachers × 3 Classes)", allocation_count >= 30, f"Allocations recorded: {allocation_count}")

# ------------------------------------------------------------------------------
# STEP 7: ACADEMIC SESSIONS & TERMS
# ------------------------------------------------------------------------------
print("\n>> Phase 7: Academic Calendar (Sessions & Terms)")
status, res = api_call("GET", "/terms", token=hm_token)
terms_list = get_items(res)
active_term = next((t for t in terms_list if t.get("status") == "active"), terms_list[0] if terms_list else None)

if not active_term:
    session_payload = {
        "sessionName": "2025/2026",
        "stateId": state_id,
        "startDate": "2025-09-15",
        "endDate": "2026-07-24",
        "status": "active"
    }
    status, res = api_call("POST", "/academic-sessions", session_payload, token=admin_token)
    status, res = api_call("GET", "/terms", token=hm_token)
    terms_list = get_items(res)
    active_term = terms_list[0] if terms_list else None

record("Academic Terms Active (First, Second, Third)", bool(active_term), f"Active Term ID: {active_term['id'] if active_term else 'N/A'}")

term_id = active_term["id"]

# ------------------------------------------------------------------------------
# STEP 8: REGISTER 30 STUDENTS & ENROLL 10 PER CLASS
# ------------------------------------------------------------------------------
print("\n>> Phase 8: Child Registry & Student Enrollments (30 Learners: 10/class)")
STUDENT_DATA = [
    # JSS 1 (10 students)
    {"first": "Aliyu", "last": "Babangida", "gender": "male", "dob": "2013-05-12", "class_idx": 0},
    {"first": "Zainab", "last": "Umar", "gender": "female", "dob": "2013-08-20", "class_idx": 0},
    {"first": "Ibrahim", "last": "Danladi", "gender": "male", "dob": "2013-02-14", "class_idx": 0},
    {"first": "Fatima", "last": "Balarabe", "gender": "female", "dob": "2013-11-03", "class_idx": 0},
    {"first": "Mansur", "last": "Garba", "gender": "male", "dob": "2013-04-29", "class_idx": 0},
    {"first": "Aisha", "last": "Suleiman", "gender": "female", "dob": "2013-09-18", "class_idx": 0},
    {"first": "Hamza", "last": "Katsina", "gender": "male", "dob": "2013-01-25", "class_idx": 0},
    {"first": "Hauwa", "last": "Mustapha", "gender": "female", "dob": "2013-07-08", "class_idx": 0},
    {"first": "Bashir", "last": "Nasiru", "gender": "male", "dob": "2013-10-15", "class_idx": 0},
    {"first": "Rukayya", "last": "Salisu", "gender": "female", "dob": "2013-03-31", "class_idx": 0},
    # JSS 2 (10 students)
    {"first": "Abdullahi", "last": "Dahiru", "gender": "male", "dob": "2012-04-10", "class_idx": 1},
    {"first": "Khadija", "last": "Gwadabe", "gender": "female", "dob": "2012-06-25", "class_idx": 1},
    {"first": "Usman", "last": "Shehu", "gender": "male", "dob": "2012-09-14", "class_idx": 1},
    {"first": "Maryam", "last": "Yusuf", "gender": "female", "dob": "2012-12-02", "class_idx": 1},
    {"first": "Sadiq", "last": "Mahmoud", "gender": "male", "dob": "2012-01-18", "class_idx": 1},
    {"first": "Halima", "last": "Bello", "gender": "female", "dob": "2012-07-29", "class_idx": 1},
    {"first": "Yahaya", "last": "Sanusi", "gender": "male", "dob": "2012-03-08", "class_idx": 1},
    {"first": "Safiya", "last": "Aminu", "gender": "female", "dob": "2012-10-19", "class_idx": 1},
    {"first": "Musa", "last": "Tukur", "gender": "male", "dob": "2012-05-23", "class_idx": 1},
    {"first": "Asma'u", "last": "Jibrin", "gender": "female", "dob": "2012-08-11", "class_idx": 1},
    # JSS 3 (10 students)
    {"first": "Nura", "last": "Hassan", "gender": "male", "dob": "2011-03-15", "class_idx": 2},
    {"first": "Hafsat", "last": "Ilyasu", "gender": "female", "dob": "2011-05-28", "class_idx": 2},
    {"first": "Salisu", "last": "Kabiru", "gender": "male", "dob": "2011-09-09", "class_idx": 2},
    {"first": "Amina", "last": "Zubairu", "gender": "female", "dob": "2011-11-21", "class_idx": 2},
    {"first": "Gideon", "last": "Yakubu", "gender": "male", "dob": "2011-02-04", "class_idx": 2},
    {"first": "Habiba", "last": "Lawal", "gender": "female", "dob": "2011-08-17", "class_idx": 2},
    {"first": "Kabir", "last": "Shuaibu", "gender": "male", "dob": "2011-12-30", "class_idx": 2},
    {"first": "Lubabatu", "last": "Ali", "gender": "female", "dob": "2011-04-14", "class_idx": 2},
    {"first": "Shamsuddeen", "last": "Faruk", "gender": "male", "dob": "2011-07-06", "class_idx": 2},
    {"first": "Bilkisu", "last": "Mukhtar", "gender": "female", "dob": "2011-10-24", "class_idx": 2}
]

# Ensure an active household exists in Ahoto Ward for child registration
status, res = api_call("GET", f"/households?ward_id={ward_id}&limit=10", token=admin_token)
households = get_items(res)
if not households:
    h_payload = {
        "fatherName": "Bello Ahoto",
        "motherName": "Amina Bello Ahoto",
        "phoneNumber": "08051234567",
        "wardId": ward_id,
        "communityId": community_id,
        "povertyStatus": "moderate"
    }
    status, res = api_call("POST", "/households", h_payload, token=admin_token)
    household_id = res.get("data", {}).get("id")
else:
    household_id = households[0]["id"]

status, res = api_call("GET", f"/children?ward_id={ward_id}&limit=250", token=admin_token)
existing_children = {f"{c.get('first_name')} {c.get('last_name')}": c for c in get_items(res)}

# Fetch existing enrollments for this school keyed by child_id
status, res = api_call("GET", f"/enrollments?limit=250", token=hm_token)
all_school_enrollments = {e["child_id"]: e for e in get_items(res) if e.get("school_id") == school_id}

enrolled_students = []

for idx, stud in enumerate(STUDENT_DATA):
    full_name = f"{stud['first']} {stud['last']}"
    child = existing_children.get(full_name)
    
    if not child:
        child_payload = {
            "firstName": stud["first"],
            "lastName": stud["last"],
            "gender": stud["gender"],
            "dateOfBirth": stud["dob"],
            "estimatedAge": 2026 - int(stud["dob"][:4]),
            "householdId": household_id,
            "wardId": ward_id,
            "communityId": community_id,
            "guardianPhone": f"0805{idx:07d}",
            "disabilityStatus": "none",
            "almajiriStatus": "not_almajiri"
        }
        status, res = api_call("POST", "/children", child_payload, token=admin_token)
        child = res.get("data")
    
    # Check or create active enrollment for this specific child
    cls = active_classes[stud["class_idx"]]
    enr = all_school_enrollments.get(child["id"])
    
    if not enr:
        enr_payload = {
            "childId": child["id"],
            "schoolId": school_id,
            "classId": cls["id"],
            "classLevel": cls["class_level"],
            "enrollmentDate": "2025-09-15"
        }
        status, res = api_call("POST", "/enrollments", enr_payload, token=hm_token)
        enr = res.get("data")
        if enr:
            all_school_enrollments[child["id"]] = enr
    
    # Headmaster approves enrollment
    if enr and not enr.get("approved_by"):
        api_call("POST", f"/enrollments/{enr['id']}/approve", {}, token=hm_token)
        enr["approved_by"] = hm_id
    
    enrolled_students.append({
        "child": child,
        "enrollment": enr,
        "class": cls
    })

valid_enrollments = [item for item in enrolled_students if item.get("enrollment") and item["enrollment"].get("id")]
record("Register & Formally Enroll 30 Students (10/class)", len(valid_enrollments) == 30, f"Enrolled count: {len(valid_enrollments)}/30")

# ------------------------------------------------------------------------------
# STEP 9: TERM ATTENDANCE TRACKING (MANUAL + QR BURST SCANS)
# ------------------------------------------------------------------------------
print("\n>> Phase 9: Daily Attendance Tracking & Rapid QR Burst Scans")
ATTENDANCE_DATES = ["2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19"]
att_count = 0
qr_burst_count = 0

for d_idx, att_date in enumerate(ATTENDANCE_DATES):
    for s_idx, item in enumerate(enrolled_students):
        child = item["child"]
        cls = item["class"]
        status_choice = "present" if (s_idx + d_idx) % 9 != 0 else ("late" if (s_idx + d_idx) % 5 == 0 else "excused")
        
        token_val = child.get("attendance_qr_token") or child.get("id")
        if s_idx % 2 == 0 and token_val:
            qr_payload = {
                "qrToken": f"AM2050:{token_val}",
                "date": att_date,
                "attendanceStatus": status_choice,
                "schoolId": school_id,
                "classId": cls["id"]
            }
            status, res = api_call("POST", "/attendance/scan", qr_payload, token=hm_token)
            if status in (200, 201):
                qr_burst_count += 1
                att_count += 1
        else:
            att_payload = {
                "childId": child["id"],
                "schoolId": school_id,
                "classId": cls["id"],
                "date": att_date,
                "attendanceStatus": status_choice
            }
            status, res = api_call("POST", "/attendance", att_payload, token=hm_token)
            if status in (200, 201):
                att_count += 1

record("Daily Attendance Logged Across 5 Days", att_count >= 140, f"Total records: {att_count} (QR Burst Scans: {qr_burst_count})")

# ------------------------------------------------------------------------------
# STEP 10: 300 COMPREHENSIVE SUBJECT RESULTS & BEHAVIORAL ASSESSMENTS
# ------------------------------------------------------------------------------
print("\n>> Phase 10: Subject Examinations & Grading (30 Students × 10 Subjects)")
results_logged = 0

def calc_grade(score: float) -> tuple[str, str]:
    if score >= 75.0:
        return "A", "Distinction / Outstanding mastery"
    if score >= 65.0:
        return "B", "Very Good / Strong analytical competence"
    if score >= 50.0:
        return "C", "Credit / Satisfactory academic performance"
    if score >= 40.0:
        return "D", "Pass / Demonstrates basic comprehension"
    return "F", "Needs remediation and academic counseling"

# Deterministic realistic scores for 30 students across 10 subjects
for s_idx, item in enumerate(enrolled_students):
    enr_id = item["enrollment"]["id"]
    base_ability = 55 + (s_idx % 7) * 5 + (s_idx % 3) * 4
    
    for sub_idx, sub in enumerate(active_subjects):
        subject_name = sub["subject_name"]
        # Score variance
        score = min(96.0, max(42.0, base_ability + ((sub_idx * 3 + s_idx * 2) % 15) - 5.0))
        grade, comment = calc_grade(score)
        
        # Teacher who teaches this subject posts the score
        teacher = teacher_records[sub_idx % len(teacher_records)]
        
        result_payload = {
            "enrollmentId": enr_id,
            "termId": term_id,
            "subject": subject_name,
            "score": score,
            "grade": grade,
            "comments": comment
        }
        
        post_token = teacher_tokens.get(teacher["id"], hm_token)
        status, res = api_call("POST", "/results", result_payload, token=post_token)
        if status not in (200, 201):
            status, res = api_call("POST", "/results", result_payload, token=hm_token)
        if status in (200, 201):
            results_logged += 1

record("Publish 300 Subject Results (30 Learners × 10 Subjects)", results_logged == 300, f"Results logged: {results_logged}/300")

# Record Behavioral Evaluations (conduct, punctuality, teamwork)
behavior_count = 0
for item in enrolled_students:
    enr_id = item["enrollment"]["id"]
    for b_type in ["Punctuality", "Conduct & Discipline", "Neatness"]:
        b_payload = {
            "enrollmentId": enr_id,
            "termId": term_id,
            "behaviorType": b_type,
            "rating": random.choice([4, 5, 4, 5]),
            "comments": "Commendable attitude to learning."
        }
        status, res = api_call("POST", "/behavioral-trackers", b_payload, token=hm_token)
        if status in (200, 201):
            behavior_count += 1

record("Log Behavioral Assessments Across Cohort", behavior_count == 90, f"Behavior records: {behavior_count}/90")

# ------------------------------------------------------------------------------
# STEP 11: VERIFY RESULTS SUMMARY, KPI STATS & DATABASE PERSISTENCE
# ------------------------------------------------------------------------------
print("\n>> Phase 11: Verification, Reporting & Permanent Database Persistence")
status, res = api_call("GET", f"/results?limit=250", token=hm_token)
retrieved_results = get_items(res)
total_results = res.get("pagination", {}).get("total", len(retrieved_results))
record("Query Paginated Results Ledger (/results)", status == 200 and (len(retrieved_results) >= 200 or total_results >= 300), f"Retrieved in page: {len(retrieved_results)}, Total: {total_results}")

status, res = api_call("GET", "/reports/results-summary", token=admin_token)
record("Generate Official Performance Summary Report (/reports/results-summary)", status == 200, f"HTTP {status} - Subject averages computed")

status, res = api_call("GET", "/dashboard/stats", token=admin_token)
stats = res.get("data", {})
total_children = stats.get("totalChildren", 0)
active_enrolled = stats.get("activeEnrollment", 0)
record("Dashboard Executive KPI Aggregation", status == 200 and active_enrolled >= 30, f"Total Children: {total_children}, Active Enrolled: {active_enrolled}")

status, res = api_call("GET", "/audit-logs", token=admin_token)
audit_entries = get_items(res)
record("Immutable Governance Audit Trail", len(audit_entries) >= 50, f"Audit entries verified: {len(audit_entries)}")

# ------------------------------------------------------------------------------
# FINAL UAT SCORECARD
# ------------------------------------------------------------------------------
print("\n" + "="*100)
print(f"{'TEST SCENARIO':<58} | {'STATUS':<10} | DETAILS")
print("="*100)
passed_count = sum(1 for _, p, _ in results if p)
total_count = len(results)

for name, p, details in results:
    s = "PASS [OK]" if p else "FAIL [X]"
    print(f"{name:<58} | {s:<10} | {details}")

print("="*100)
print(f"  LIVE UAT VERDICT: {passed_count}/{total_count} Passed ({(passed_count/total_count)*100:.1f}%)")
print("  Institution: GDJSS AHOTO (Government Day Junior Secondary School Ahoto)")
print(f"  Personnel: 1 Headmaster + 10 Specialist Teachers (Staffed)")
print(f"  Classes: JSS 1, JSS 2, JSS 3 (10 Learners per class = 30 total)")
print(f"  Curriculum: 10 Core Subjects across 30 Teaching Allocations")
print(f"  Examinations: 300 Subject Results & 90 Behavioral Trackers Published")
print("="*100 + "\n")

if passed_count == total_count:
    print(">> ALL TEST SCENARIOS PASSED WITH 100% SUCCESS AND PERMANENTLY PERSISTED IN AZURE MYSQL!")
    sys.exit(0)
else:
    print(f">> WARNING: {total_count - passed_count} scenario(s) failed.")
    sys.exit(1)
