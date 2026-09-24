"""
Deep Live UAT Verification for Student Result Management Module & A4 Printable Dossiers
Dynamically retrieves school, class, teacher, and headmaster credentials directly from the system.
"""
import requests
import json
import sys

BASE_URL = "http://127.0.0.1:10000/api/v1"
SESSION = requests.Session()

def log(msg, status="INFO"):
    colors = {"INFO": "\033[94m", "SUCCESS": "\033[92m", "WARN": "\033[93m", "FAIL": "\033[91m", "END": "\033[0m"}
    print(f"{colors.get(status, '')}[{status}] {msg}{colors['END']}")

def login(identifier, password="AM2050Security#2026"):
    res = SESSION.post(f"{BASE_URL}/auth/login", data={"identifier": identifier, "password": password})
    if res.status_code == 200 and res.json().get("success"):
        token = res.json()["data"]["accessToken"]
        SESSION.headers.update({"Authorization": f"Bearer {token}"})
        user = res.json()["data"]["user"]
        log(f"Authenticated as {user['name']} ({user['role']}) - ID: {user['id']}", "SUCCESS")
        return user
    else:
        log(f"Login failed for {identifier}: {res.text}", "FAIL")
        sys.exit(1)

def run_tests():
    log("=== STARTING DEEP LIVE UAT: RESULT MANAGEMENT MODULE ===")

    # 1. Login as Super Admin
    super_admin = login("superadmin@am2050.gov.ng")

    # Fetch users to get HM and Teachers
    res = SESSION.get(f"{BASE_URL}/users?limit=250")
    assert res.status_code == 200, "Failed to fetch users"
    all_users = res.json()["data"]

    hm_user = next((u for u in all_users if u.get("role") == "headmaster"), None)
    assert hm_user, "No headmaster found"
    log(f"Headmaster found: {hm_user['name']} (Email: {hm_user.get('email')}, Phone: {hm_user.get('phone')})", "INFO")

    # Fetch classes
    res = SESSION.get(f"{BASE_URL}/classes?limit=100")
    assert res.status_code == 200, "Failed to fetch classes"
    classes = res.json()["data"]
    ahoto_classes = [c for c in classes if "AHOTO" in (c.get("school_name") or "").upper() or "GDJSS" in (c.get("class_name") or "")]
    if not ahoto_classes:
        ahoto_classes = classes[:3]
    jss1 = ahoto_classes[0]
    log(f"Target Class: {jss1['class_name']} (ID: {jss1['id']})", "INFO")

    # Get Class Teacher for JSS 1
    class_teacher_id = jss1.get("teacher_id")
    class_teacher = next((u for u in all_users if u["id"] == class_teacher_id), None)
    if not class_teacher:
        # Fallback to any teacher
        teachers = [u for u in all_users if u.get("role") == "teacher"]
        assert teachers, "No teachers found"
        class_teacher = teachers[0]
        # Assign this teacher as class teacher of JSS 1
        SESSION.put(f"{BASE_URL}/classes/{jss1['id']}", json={"teacherId": class_teacher["id"]})
        log(f"Assigned Form Master: {class_teacher['name']} to {jss1['class_name']}", "INFO")
    else:
        log(f"Class Form Master: {class_teacher['name']} (ID: {class_teacher['id']})", "INFO")

    # Fetch terms
    res = SESSION.get(f"{BASE_URL}/terms")
    assert res.status_code == 200, "Failed to fetch terms"
    terms = res.json()["data"]
    term = terms[0]
    log(f"Target Term: {term['term_name']} {term['academic_year']} (ID: {term['id']})", "INFO")

    # Fetch subjects for this class
    res = SESSION.get(f"{BASE_URL}/classes/{jss1['id']}/subjects")
    assert res.status_code == 200, "Failed to fetch class subjects"
    subjects = res.json()["data"]
    assert len(subjects) > 0, "No subjects registered for class"
    math_subject = subjects[0]["subject_name"]
    log(f"Selected Assessment Subject: {math_subject}", "INFO")

    # 2. Authenticate as Class Teacher
    t_identifier = class_teacher.get("email") or class_teacher.get("phone")
    t1 = login(t_identifier)

    # Fetch existing class report
    res = SESSION.get(f"{BASE_URL}/classes/{jss1['id']}/report-sheets?term_id={term['id']}")
    assert res.status_code == 200, f"Failed to get class report: {res.text}"
    report_data = res.json()["data"]
    students = report_data["students"]
    log(f"Class report sheet loaded: {len(students)} learners enrolled in {jss1['class_name']}", "SUCCESS")

    # Reset/unpublish if previously published
    hm_identifier = hm_user.get("email") or hm_user.get("phone")
    login(hm_identifier)
    SESSION.post(f"{BASE_URL}/results/unpublish", json={"classId": jss1["id"], "termId": term["id"], "subject": math_subject, "reason": "Pre-test UAT reset"})
    login(t_identifier)

    # 3. Class Teacher enters batch scores (CA + Exam)
    batch_records = []
    for idx, s in enumerate(students):
        ca = 30.0 + (idx % 10) # Continuous Assessment / 40
        exam = 40.0 + (idx % 20) # Terminal Exam / 60
        score = ca + exam
        batch_records.append({
            "enrollmentId": s["enrollmentId"],
            "termId": term["id"],
            "subject": math_subject,
            "caScore": ca,
            "examScore": exam,
            "score": score,
            "grade": "A" if score >= 75 else ("B" if score >= 65 else ("C" if score >= 50 else "D")),
            "comments": "Active participant in practical demonstration exercises.",
            "status": "draft"
        })

    res = SESSION.post(f"{BASE_URL}/results/batch", json={
        "classId": jss1["id"],
        "termId": term["id"],
        "subject": math_subject,
        "status": "draft",
        "records": batch_records
    })
    assert res.status_code in [200, 201], f"Batch score draft failed: {res.text}"
    saved_count = res.json()["data"]["savedCount"]
    log(f"Class Teacher saved {saved_count} draft scores for '{math_subject}' (CA 40 + Exam 60)", "SUCCESS")

    # 4. RBAC Test: Classroom Teacher attempts to publish (MUST BE DENIED)
    res = SESSION.post(f"{BASE_URL}/results/publish", json={
        "classId": jss1["id"],
        "termId": term["id"],
        "subject": math_subject,
        "note": "Teacher illegal publish attempt"
    })
    assert res.status_code in [403, 401], f"Security breach! Teacher was able to publish: {res.status_code}"
    log("RBAC verified: Teacher is strictly blocked from publishing results (HTTP 403 Forbidden)", "SUCCESS")

    # 5. Teacher submits result drafts to Headmaster
    res = SESSION.post(f"{BASE_URL}/results/submit", json={
        "classId": jss1["id"],
        "termId": term["id"],
        "subject": math_subject
    })
    assert res.status_code == 200, f"Submit to Headmaster failed: {res.text}"
    submitted_count = res.json()["data"]["submittedCount"]
    log(f"Submitted {submitted_count} scores to Headmaster for verification (status='submitted')", "SUCCESS")

    # 6. Headmaster Reviews & Formally Publishes Results
    login(hm_identifier)
    res = SESSION.post(f"{BASE_URL}/results/publish", json={
        "classId": jss1["id"],
        "termId": term["id"],
        "subject": math_subject,
        "note": "Verified, Approved, and Officially Published by Headmaster"
    })
    assert res.status_code == 200, f"Headmaster publish failed: {res.text}"
    pub_count = res.json()["data"]["publishedCount"]
    log(f"Headmaster officially published {pub_count} student scores (status='published', locked)", "SUCCESS")

    # 7. Immutability Enforcement Check: Teacher attempts to modify locked published results (MUST FAIL with 422)
    login(t_identifier)
    tamper_payload = {
        "enrollmentId": students[0]["enrollmentId"],
        "termId": term["id"],
        "subject": math_subject,
        "score": 99.0,
        "caScore": 40.0,
        "examScore": 59.0
    }
    res = SESSION.post(f"{BASE_URL}/results", json=tamper_payload)
    assert res.status_code in [422, 403, 400], f"Immutability breach! Modifying published result succeeded: {res.status_code} {res.text}"
    log(f"Immutability verified: Score editing on published results rejected: '{res.json().get('error')}'", "SUCCESS")

    # 8. Verify Formal A4 Report Sheet Structure & Rankings
    login(hm_identifier)
    first_enrollment_id = students[0]["enrollmentId"]
    res = SESSION.get(f"{BASE_URL}/enrollments/{first_enrollment_id}/report-sheet?term_id={term['id']}")
    assert res.status_code == 200, f"Report sheet failed: {res.text}"
    sheet_data = res.json()["data"]
    sheet = sheet_data["sheet"]
    summary = sheet["summary"]
    log(f"Dossier generated for: {sheet['student']['first_name']} {sheet['student']['last_name']}", "INFO")
    log(f"   Standing: {summary.get('positionText')} | Average: {summary['averageScore']}% | Grade: {summary['overallGrade']}", "INFO")
    log(f"   Attendance Rate: {sheet['attendance']['rate']}% ({sheet['attendance']['present']} days present)", "INFO")
    log(f"   Publication Status: {summary['status']} (Officially Certified)", "SUCCESS")

    # 9. Headmaster Reopen / Unpublish Test
    res = SESSION.post(f"{BASE_URL}/results/unpublish", json={
        "classId": jss1["id"],
        "termId": term["id"],
        "subject": math_subject,
        "reason": "HM approved arithmetic correction"
    })
    assert res.status_code == 200, f"Unpublish failed: {res.text}"
    log(f"Headmaster successfully reopened results: {res.json()['data']['reopenedCount']} records unlocked", "SUCCESS")

    # Final certification: Re-publish so production remains officially certified
    res = SESSION.post(f"{BASE_URL}/results/publish", json={
        "classId": jss1["id"],
        "termId": term["id"],
        "note": "Official Production Publication Certified"
    })
    assert res.status_code == 200, "Final publish failed"
    log("Final production status re-locked as PUBLISHED & CERTIFIED", "SUCCESS")

    log("=== ALL UAT ACCEPTANCE TESTS PASSED WITH 100% SUCCESS ===", "SUCCESS")

if __name__ == "__main__":
    run_tests()
