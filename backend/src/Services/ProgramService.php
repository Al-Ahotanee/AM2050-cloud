<?php
declare(strict_types=1);

namespace AM2050\Services;

use AM2050\Core\Database;
use AM2050\Support\AuditLogger;
use AM2050\Support\IdGenerator;
use AM2050\Support\ScopeFilter;
use AM2050\Support\Ulids;
use PDO;
use RuntimeException;

final class ProgramService
{
    public function __construct(private readonly Database $db, private readonly AuditLogger $audit) {}

    public static function calculateGrade(float $score): string
    {
        if ($score >= 75.0) return "A";
        if ($score >= 65.0) return "B";
        if ($score >= 50.0) return "C";
        if ($score >= 40.0) return "D";
        return "F";
    }

    public function results(array $auth, array $data): array
    {
        foreach (["enrollmentId", "termId", "subject"] as $key) if (!isset($data[$key])) throw new RuntimeException("{$key} is required.");
        $enrollment = $this->enrollmentInScope($auth, (string) $data["enrollmentId"]);
        $classId = (string) $enrollment["class_id"];
        $subject = trim((string) $data["subject"]);
        $termId = (string) $data["termId"];

        $this->assertResultEditAccess($auth, $classId, $subject);
        $this->assertResultNotLocked((string)$data["enrollmentId"], $termId, $subject);
        $this->assertTerm($auth, $termId, $enrollment["state_id"]);
        $this->assertClassSubject($classId, $subject);

        $ca = isset($data["caScore"]) && $data["caScore"] !== "" ? (float) $data["caScore"] : null;
        $exam = isset($data["examScore"]) && $data["examScore"] !== "" ? (float) $data["examScore"] : null;
        if ($ca !== null && $exam !== null) {
            $score = $ca + $exam;
        } elseif (isset($data["score"]) && $data["score"] !== "") {
            $score = (float) $data["score"];
        } else {
            throw new RuntimeException("A score or CA/Exam breakdown is required.");
        }

        if ($score < 0 || $score > 100) throw new RuntimeException("score must be between 0 and 100.");
        $grade = !empty($data["grade"]) ? trim((string)$data["grade"]) : self::calculateGrade($score);
        $comments = $data["comments"] ?? null;
        $status = in_array($data["status"] ?? "draft", ["draft", "submitted"], true) ? $data["status"] : "draft";

        $id = Ulids::make();
        $this->db->pdo()->prepare("INSERT INTO student_results(id,enrollment_id,term_id,subject,score,ca_score,exam_score,grade,comments,status,recorded_by) VALUES(:id,:enrollment,:term,:subject,:score,:ca,:exam,:grade,:comments,:status,:user) ON DUPLICATE KEY UPDATE score=VALUES(score),ca_score=VALUES(ca_score),exam_score=VALUES(exam_score),grade=VALUES(grade),comments=VALUES(comments),recorded_by=VALUES(recorded_by)")->execute([
            "id" => $id, "enrollment" => $data["enrollmentId"], "term" => $termId, "subject" => $subject, "score" => $score,
            "ca" => $ca, "exam" => $exam, "grade" => $grade, "comments" => $comments, "status" => $status, "user" => $auth["id"],
        ]);
        $statement = $this->db->pdo()->prepare("SELECT id FROM student_results WHERE enrollment_id=:enrollment AND term_id=:term AND subject=:subject");
        $statement->execute(["enrollment" => $data["enrollmentId"], "term" => $termId, "subject" => $subject]);
        $record = $this->one("student_results", (string) $statement->fetchColumn());
        $this->audit->record($auth["id"], "UPSERT", "student_result", $record["id"], null, $record);
        return $record;
    }

    public function resultsBatch(array $auth, array $data): array
    {
        $scoresList = $data["scores"] ?? $data["records"] ?? null;
        if (!is_array($scoresList) || empty($scoresList)) throw new RuntimeException("scores list is required.");
        foreach (["classId", "termId", "subject"] as $key) {
            if (empty($data[$key])) throw new RuntimeException("{$key} is required.");
        }
        $classId = (string)$data["classId"];
        $termId = (string)$data["termId"];
        $subject = trim((string)$data["subject"]);
        $this->assertResultEditAccess($auth, $classId, $subject);
        $this->assertClassSubject($classId, $subject);

        $pdo = $this->db->pdo();
        $classSchool = $pdo->prepare("SELECT s.id, w.lga_id, l.state_id FROM school_classes sc INNER JOIN schools s ON s.id=sc.school_id INNER JOIN wards w ON w.id=s.ward_id INNER JOIN lgas l ON l.id=w.lga_id WHERE sc.id=:class");
        $classSchool->execute(["class" => $classId]);
        $schoolInfo = $classSchool->fetch() ?: throw new RuntimeException("Class not found.");
        $this->assertTerm($auth, $termId, $schoolInfo["state_id"]);

        $saved = [];
        $checkStmt = $pdo->prepare("SELECT id, status FROM student_results WHERE enrollment_id=:enr AND term_id=:term AND subject=:sub");
        $upsertStmt = $pdo->prepare("INSERT INTO student_results (id, enrollment_id, term_id, subject, score, ca_score, exam_score, grade, comments, status, recorded_by) VALUES (:id, :enr, :term, :sub, :score, :ca, :exam, :grade, :comments, :status, :user) ON DUPLICATE KEY UPDATE score=VALUES(score), ca_score=VALUES(ca_score), exam_score=VALUES(exam_score), grade=VALUES(grade), comments=VALUES(comments), recorded_by=VALUES(recorded_by)");

        $targetStatus = in_array($data["status"] ?? "draft", ["draft", "submitted"], true) ? $data["status"] : "draft";

        $pdo->beginTransaction();
        try {
            foreach ($scoresList as $item) {
                $enrId = (string)($item["enrollmentId"] ?? "");
                if (!$enrId) continue;

                $checkStmt->execute(["enr" => $enrId, "term" => $termId, "sub" => $subject]);
                $existing = $checkStmt->fetch();
                if ($existing && ($existing["status"] ?? "") === "published") {
                    throw new RuntimeException("Results for enrollment {$enrId} in {$subject} are already published and locked against editing.");
                }

                $ca = isset($item["caScore"]) && $item["caScore"] !== "" ? (float)$item["caScore"] : null;
                $exam = isset($item["examScore"]) && $item["examScore"] !== "" ? (float)$item["examScore"] : null;
                if ($ca !== null && $exam !== null) {
                    $score = $ca + $exam;
                } elseif (isset($item["score"]) && $item["score"] !== "") {
                    $score = (float)$item["score"];
                } else {
                    continue;
                }
                if ($score < 0 || $score > 100) throw new RuntimeException("Total score must be between 0 and 100.");

                $grade = !empty($item["grade"]) ? trim((string)$item["grade"]) : self::calculateGrade($score);
                $comments = !empty($item["comments"]) ? trim((string)$item["comments"]) : null;
                $id = $existing["id"] ?? Ulids::make();

                $upsertStmt->execute([
                    "id" => $id, "enr" => $enrId, "term" => $termId, "sub" => $subject,
                    "score" => $score, "ca" => $ca, "exam" => $exam, "grade" => $grade,
                    "comments" => $comments, "status" => $targetStatus, "user" => $auth["id"]
                ]);
                $saved[] = $id;
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }

        $this->audit->record($auth["id"], "BATCH_UPSERT", "student_results", $classId, null, [
            "classId" => $classId, "termId" => $termId, "subject" => $subject, "savedCount" => count($saved), "status" => $targetStatus
        ]);
        return ["savedCount" => count($saved), "classId" => $classId, "termId" => $termId, "subject" => $subject, "status" => $targetStatus];
    }

    public function submitResults(array $auth, array $data): array
    {
        foreach (["classId", "termId"] as $key) {
            if (empty($data[$key])) throw new RuntimeException("{$key} is required.");
        }
        $classId = (string)$data["classId"];
        $termId = (string)$data["termId"];
        $subject = !empty($data["subject"]) ? trim((string)$data["subject"]) : null;
        if ($subject) {
            $this->assertResultEditAccess($auth, $classId, $subject);
        }
        $pdo = $this->db->pdo();
        $sql = "UPDATE student_results r INNER JOIN enrollments e ON e.id=r.enrollment_id SET r.status='submitted', r.submitted_by=:user, r.submitted_at=NOW() WHERE e.class_id=:class AND r.term_id=:term AND r.status='draft'";
        $params = ["user" => $auth["id"], "class" => $classId, "term" => $termId];
        if ($subject) {
            $sql .= " AND r.subject=:subject";
            $params["subject"] = $subject;
        }
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $count = $stmt->rowCount();
        $this->audit->record($auth["id"], "SUBMIT", "student_results", $classId, null, ["classId" => $classId, "termId" => $termId, "subject" => $subject, "submittedCount" => $count]);
        return ["submittedCount" => $count];
    }

    public function publishResults(array $auth, array $data): array
    {
        foreach (["classId", "termId"] as $key) {
            if (empty($data[$key])) throw new RuntimeException("{$key} is required.");
        }
        $classId = (string)$data["classId"];
        $termId = (string)$data["termId"];
        $subject = !empty($data["subject"]) ? trim((string)$data["subject"]) : null;
        $note = !empty($data["note"]) ? trim((string)$data["note"]) : "Officially published by Headmaster";
        $pdo = $this->db->pdo();
        $sql = "UPDATE student_results r INNER JOIN enrollments e ON e.id=r.enrollment_id SET r.status='published', r.published_by=:user, r.published_at=NOW(), r.published_note=:note WHERE e.class_id=:class AND r.term_id=:term AND r.status IN ('draft', 'submitted')";
        $params = ["user" => $auth["id"], "note" => $note, "class" => $classId, "term" => $termId];
        if ($subject) {
            $sql .= " AND r.subject=:subject";
            $params["subject"] = $subject;
        }
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $count = $stmt->rowCount();
        $this->audit->record($auth["id"], "PUBLISH", "student_results", $classId, null, ["classId" => $classId, "termId" => $termId, "subject" => $subject, "publishedCount" => $count]);
        return ["publishedCount" => $count];
    }

    public function unpublishResults(array $auth, array $data): array
    {
        foreach (["classId", "termId"] as $key) {
            if (empty($data[$key])) throw new RuntimeException("{$key} is required.");
        }
        $classId = (string)$data["classId"];
        $termId = (string)$data["termId"];
        $subject = !empty($data["subject"]) ? trim((string)$data["subject"]) : null;
        $reason = !empty($data["reason"]) ? trim((string)$data["reason"]) : "Reopened for corrections";
        $pdo = $this->db->pdo();
        $sql = "UPDATE student_results r INNER JOIN enrollments e ON e.id=r.enrollment_id SET r.status='draft', r.published_at=NULL, r.published_by=NULL WHERE e.class_id=:class AND r.term_id=:term AND r.status='published'";
        $params = ["class" => $classId, "term" => $termId];
        if ($subject) {
            $sql .= " AND r.subject=:subject";
            $params["subject"] = $subject;
        }
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $count = $stmt->rowCount();
        $this->audit->record($auth["id"], "UNPUBLISH", "student_results", $classId, null, ["classId" => $classId, "termId" => $termId, "subject" => $subject, "reopenedCount" => $count, "reason" => $reason]);
        return ["reopenedCount" => $count];
    }

    public function classReportSheets(array $auth, string $classId, array $query): array
    {
        $termId = trim((string)($query["term_id"] ?? ""));
        if (!$termId) throw new RuntimeException("term_id query parameter is required.");
        $pdo = $this->db->pdo();

        $stmt = $pdo->prepare("SELECT c.id AS class_id, c.class_name, c.class_level, c.academic_year,
                s.id AS school_id, s.school_name, s.school_id AS school_code, s.school_logo,
                w.name AS ward_name, l.name AS lga_name, st.name AS state_name,
                ct.name AS class_teacher_name, hm.name AS headmaster_name
                FROM school_classes c
                INNER JOIN schools s ON s.id=c.school_id
                INNER JOIN wards w ON w.id=s.ward_id
                INNER JOIN lgas l ON l.id=w.lga_id
                INNER JOIN states st ON st.id=l.state_id
                LEFT JOIN users ct ON ct.id=c.teacher_id
                LEFT JOIN users hm ON hm.id=s.headmaster_user_id
                WHERE c.id=:class");
        $stmt->execute(["class" => $classId]);
        $classInfo = $stmt->fetch() ?: throw new RuntimeException("Class not found.");

        if ($auth["role"] === "headmaster" && ($auth["assigned_scope_type"] ?? "") === "school" && ($auth["assigned_scope_id"] ?? "") !== $classInfo["school_id"]) {
            throw new RuntimeException("Class is outside your assigned school.");
        }

        $tStmt = $pdo->prepare("SELECT t.id AS term_id, t.term_name, t.academic_year, t.start_date, t.end_date, t.status AS term_status, a.session_name
                FROM terms t INNER JOIN academic_sessions a ON a.id=t.session_id WHERE t.id=:term");
        $tStmt->execute(["term" => $termId]);
        $termInfo = $tStmt->fetch() ?: throw new RuntimeException("Term not found.");

        $sStmt = $pdo->prepare("SELECT e.id AS enrollment_id, e.enrollment_date, e.enrollment_status,
                c.id AS id, c.id AS child_id, c.child_unique_id, c.child_unique_id AS nin, c.child_unique_id AS am2050_id,
                c.attendance_qr_token, c.first_name, c.last_name, c.gender,
                c.date_of_birth, c.estimated_age, c.photo_url, c.guardian_phone,
                h.household_code, h.father_name, h.mother_name, h.phone_number AS household_phone
                FROM enrollments e
                INNER JOIN children c ON c.id=e.child_id
                LEFT JOIN households h ON h.id=c.household_id
                WHERE e.class_id=:class AND e.enrollment_status='active'
                ORDER BY c.first_name, c.last_name");
        $sStmt->execute(["class" => $classId]);
        $students = $sStmt->fetchAll();

        $subStmt = $pdo->prepare("SELECT s.id, s.subject_name, s.subject_code FROM subjects s INNER JOIN class_subjects cs ON cs.subject_id=s.id WHERE cs.class_id=:class ORDER BY s.subject_name");
        $subStmt->execute(["class" => $classId]);
        $subjects = $subStmt->fetchAll();

        $rStmt = $pdo->prepare("SELECT r.*, e.id AS enrollment_id, e.child_id, u.name AS recorded_by_name
                FROM student_results r
                INNER JOIN enrollments e ON e.id=r.enrollment_id
                LEFT JOIN users u ON u.id=r.recorded_by
                WHERE e.class_id=:class AND r.term_id=:term");
        $rStmt->execute(["class" => $classId, "term" => $termId]);
        $rawResults = $rStmt->fetchAll();

        $subjectStats = [];
        foreach ($subjects as $sub) {
            $name = $sub["subject_name"];
            $subjectScores = [];
            foreach ($rawResults as $r) {
                if ($r["subject"] === $name) {
                    $subjectScores[] = (float)$r["score"];
                }
            }
            $count = count($subjectScores);
            $subjectStats[$name] = [
                "count" => $count,
                "min" => $count > 0 ? min($subjectScores) : null,
                "max" => $count > 0 ? max($subjectScores) : null,
                "avg" => $count > 0 ? round(array_sum($subjectScores) / $count, 1) : null,
            ];
        }

        $attStmt = $pdo->prepare("SELECT child_id, attendance_status, COUNT(*) as cnt FROM attendance WHERE class_id=:class AND date >= :start AND date <= :end GROUP BY child_id, attendance_status");
        $attStmt->execute(["class" => $classId, "start" => $termInfo["start_date"], "end" => $termInfo["end_date"]]);
        $attRows = $attStmt->fetchAll();
        $attByChild = [];
        foreach ($attRows as $ar) {
            $cid = $ar["child_id"];
            if (!isset($attByChild[$cid])) $attByChild[$cid] = ["present" => 0, "late" => 0, "excused" => 0, "total" => 0];
            $st = $ar["attendance_status"];
            $cnt = (int)$ar["cnt"];
            if (isset($attByChild[$cid][$st])) $attByChild[$cid][$st] += $cnt;
            $attByChild[$cid]["total"] += $cnt;
        }

        $btStmt = $pdo->prepare("SELECT b.*, e.child_id FROM behavioral_trackers b INNER JOIN enrollments e ON e.id=b.enrollment_id WHERE e.class_id=:class AND b.term_id=:term");
        $btStmt->execute(["class" => $classId, "term" => $termId]);
        $btRows = $btStmt->fetchAll();
        $behaviorsByChild = [];
        foreach ($btRows as $b) {
            $behaviorsByChild[$b["child_id"]][] = $b;
        }

        $resultsByEnrollment = [];
        foreach ($rawResults as $r) {
            $resultsByEnrollment[$r["enrollment_id"]][] = $r;
        }

        $compiledStudents = [];
        foreach ($students as $stu) {
            $enrId = $stu["enrollment_id"];
            $stuResults = $resultsByEnrollment[$enrId] ?? [];
            $totalScore = 0.0;
            $subjectCount = count($stuResults);

            $decoratedResults = [];
            foreach ($stuResults as $resRow) {
                $totalScore += (float)$resRow["score"];
                $subName = $resRow["subject"];
                $st = $subjectStats[$subName] ?? ["min" => null, "max" => null, "avg" => null];
                $decoratedResults[] = array_merge($resRow, [
                    "class_min" => $st["min"],
                    "class_max" => $st["max"],
                    "class_avg" => $st["avg"],
                ]);
            }

            $avgScore = $subjectCount > 0 ? round($totalScore / $subjectCount, 2) : 0.0;
            $overallGrade = self::calculateGrade($avgScore);

            $attData = $attByChild[$stu["child_id"]] ?? ["present" => 0, "late" => 0, "excused" => 0, "total" => 0];
            $attRate = $attData["total"] > 0 ? round(($attData["present"] / $attData["total"]) * 100, 1) : 100.0;

            $hasPublished = count(array_filter($stuResults, fn($x) => ($x["status"] ?? "") === "published")) > 0;
            $hasSubmitted = count(array_filter($stuResults, fn($x) => ($x["status"] ?? "") === "submitted")) > 0;
            $reportStatus = $hasPublished ? "published" : ($hasSubmitted ? "submitted" : "draft");

            $compiledStudents[] = [
                "student" => $stu,
                "enrollmentId" => $enrId,
                "results" => $decoratedResults,
                "behaviors" => $behaviorsByChild[$stu["child_id"]] ?? [],
                "attendance" => array_merge($attData, ["rate" => $attRate]),
                "summary" => [
                    "totalScore" => round($totalScore, 1),
                    "maxObtainable" => $subjectCount * 100,
                    "subjectCount" => $subjectCount,
                    "averageScore" => $avgScore,
                    "overallGrade" => $overallGrade,
                    "decision" => $avgScore >= 40.0 ? "PASSED" : "NEEDS COUNSELING",
                    "status" => $reportStatus,
                ]
            ];
        }

        usort($compiledStudents, fn($a, $b) => $b["summary"]["averageScore"] <=> $a["summary"]["averageScore"]);
        $totalCount = count($compiledStudents);
        foreach ($compiledStudents as $index => &$item) {
            $rank = $index + 1;
            $suffix = match($rank % 10) {
                1 => $rank % 100 === 11 ? "th" : "st",
                2 => $rank % 100 === 12 ? "th" : "nd",
                3 => $rank % 100 === 13 ? "th" : "rd",
                default => "th"
            };
            $item["summary"]["rank"] = $rank;
            $item["summary"]["positionText"] = "{$rank}{$suffix} of {$totalCount}";
        }
        unset($item);

        $subjectNames = array_values(array_unique(array_filter(array_map(fn($s) => is_array($s) ? ($s["subject_name"] ?? "") : (string)$s, $subjects))));

        return [
            "class" => $classInfo,
            "term" => $termInfo,
            "subjects" => $subjectNames,
            "registeredSubjects" => $subjects,
            "subjectStats" => $subjectStats,
            "students" => $compiledStudents,
        ];
    }

    public function enrollmentReportSheet(array $auth, string $enrollmentId, array $query): array
    {
        $termId = trim((string)($query["term_id"] ?? ""));
        if (!$termId) throw new RuntimeException("term_id query parameter is required.");
        $pdo = $this->db->pdo();
        $stmt = $pdo->prepare("SELECT class_id FROM enrollments WHERE id=:id");
        $stmt->execute(["id" => $enrollmentId]);
        $classId = $stmt->fetchColumn() ?: throw new RuntimeException("Enrollment not found.");

        $classReport = $this->classReportSheets($auth, (string)$classId, ["term_id" => $termId]);
        $studentSheet = null;
        foreach ($classReport["students"] as $s) {
            if ($s["enrollmentId"] === $enrollmentId) {
                $studentSheet = $s;
                break;
            }
        }
        if (!$studentSheet) throw new RuntimeException("Student not found in this class report.");

        return [
            "class" => $classReport["class"],
            "term" => $classReport["term"],
            "subjects" => $classReport["subjects"],
            "subjectStats" => $classReport["subjectStats"],
            "sheet" => $studentSheet,
        ];
    }

    public function listResults(array $auth, array $query): array
    {
        $from = 'student_results r INNER JOIN enrollments e ON e.id=r.enrollment_id INNER JOIN schools s ON s.id=e.school_id INNER JOIN children c ON c.id=e.child_id INNER JOIN terms t ON t.id=r.term_id';
        return $this->scopedRegister($auth, $from, 's.ward_id', 'e.school_id', 'e.class_id', 'r.*,c.child_unique_id,c.first_name,c.last_name,s.school_name,t.term_name,t.academic_year', 'r.created_at DESC', $query);
    }

    public function behavior(array $auth, array $data): array
    {
        foreach (['enrollmentId', 'termId', 'behaviorType', 'rating'] as $key) if (!isset($data[$key])) throw new RuntimeException("{$key} is required.");
        $enrollment = $this->enrollmentInScope($auth, (string) $data['enrollmentId']);
        $rating = (int) $data['rating'];
        if ($rating < 1 || $rating > 5) throw new RuntimeException('rating must be between 1 and 5.');
        $this->assertTerm($auth, (string) $data['termId'], $enrollment['state_id']);
        $id = Ulids::make();
        $this->db->pdo()->prepare('INSERT INTO behavioral_trackers(id,enrollment_id,term_id,behavior_type,rating,comments,recorded_by) VALUES(:id,:enrollment,:term,:type,:rating,:comments,:user)')->execute([
            'id' => $id, 'enrollment' => $data['enrollmentId'], 'term' => $data['termId'], 'type' => trim((string) $data['behaviorType']), 'rating' => $rating, 'comments' => $data['comments'] ?? null, 'user' => $auth['id'],
        ]);
        $record = $this->one('behavioral_trackers', $id);
        $this->audit->record($auth['id'], 'CREATE', 'behavioral_tracker', $id, null, $record);
        return $record;
    }

    public function listBehavior(array $auth, array $query): array
    {
        $from = 'behavioral_trackers b INNER JOIN enrollments e ON e.id=b.enrollment_id INNER JOIN schools s ON s.id=e.school_id INNER JOIN children c ON c.id=e.child_id INNER JOIN terms t ON t.id=b.term_id';
        return $this->scopedRegister($auth, $from, 's.ward_id', 'e.school_id', 'e.class_id', 'b.*,c.child_unique_id,c.first_name,c.last_name,s.school_name,t.term_name,t.academic_year', 'b.created_at DESC', $query);
    }

    public function defaulterFollowup(array $auth,string $childId,array $data):array { $outcome=(string)($data['outcome']??'');if(!in_array($outcome,['contacted','home_visit','returned','referred','unreachable'],true))throw new RuntimeException('A valid defaulter follow-up outcome is required.');$stmt=$this->db->pdo()->prepare("SELECT e.id,e.school_id,e.class_id,s.ward_id FROM enrollments e INNER JOIN schools s ON s.id=e.school_id WHERE e.child_id=:child AND e.enrollment_status='active' LIMIT 1");$stmt->execute(['child'=>$childId]);$enrollment=$stmt->fetch()?:throw new RuntimeException('The child has no active enrollment for follow-up.');[$scope,$params]=$this->educationScope($auth,'s.ward_id','e.school_id','e.class_id');if($scope!==''){$check=$this->db->pdo()->prepare('SELECT 1 FROM enrollments e INNER JOIN schools s ON s.id=e.school_id WHERE e.id=:id'.$scope);$check->execute(['id'=>$enrollment['id'],...$params]);if(!$check->fetch())throw new RuntimeException('The child is outside your follow-up scope.');}$id=Ulids::make();$this->db->pdo()->prepare('INSERT INTO defaulter_followups(id,child_id,outcome,notes,next_follow_up_date,followed_by) VALUES(:id,:child,:outcome,:notes,:next,:user)')->execute(['id'=>$id,'child'=>$childId,'outcome'=>$outcome,'notes'=>$data['notes']??null,'next'=>$data['nextFollowUpDate']??null,'user'=>$auth['id']]);$record=$this->one('defaulter_followups',$id);$this->audit->record($auth['id'],'FOLLOW_UP','defaulter',$childId,null,$record);return$record; }
    public function submitSchoolChildReferral(array $auth,array $data):array{$school=(string)($data['schoolId']??'');$name=trim((string)($data['reportedName']??''));if($school===''||$name==='')throw new RuntimeException('School and child name are required.');$this->assertReferralSchool($auth,$school);$gender=in_array($data['reportedGender']??'unknown',['male','female','unknown'],true)?$data['reportedGender']:'unknown';$id=Ulids::make();$this->db->pdo()->prepare('INSERT INTO school_child_referrals(id,school_id,reported_name,reported_age,reported_gender,guardian_phone,notes,submitted_by) VALUES(:id,:school,:name,:age,:gender,:phone,:notes,:by)')->execute(['id'=>$id,'school'=>$school,'name'=>$name,'age'=>isset($data['reportedAge'])&&is_numeric($data['reportedAge'])?(int)$data['reportedAge']:null,'gender'=>$gender,'phone'=>$data['guardianPhone']??null,'notes'=>$data['notes']??null,'by'=>$auth['id']]);$record=$this->one('school_child_referrals',$id);$this->audit->record($auth['id'],'SUBMIT','school_child_referral',$id,null,$record);return$record;}
    public function schoolChildReferrals(array $auth):array{$sql='SELECT r.*,s.school_name,u.name AS submitted_by_name FROM school_child_referrals r INNER JOIN schools s ON s.id=r.school_id INNER JOIN users u ON u.id=r.submitted_by';$params=[];if(in_array($auth['role'],['headmaster','teacher'],true)){$sql.=' WHERE r.school_id=:school';$params=['school'=>$this->referralSchoolId($auth)];}elseif(!in_array($auth['role'],['super_admin','program_admin'],true)){[$scope,$scopeParams]=ScopeFilter::byWard($auth,'s.ward_id');$sql.=' WHERE 1=1'.$scope;$params=$scopeParams;}$sql.=" ORDER BY FIELD(r.status,'pending','registered','could_not_locate'),r.created_at DESC";$stmt=$this->db->pdo()->prepare($sql);$stmt->execute($params);return$stmt->fetchAll();}
    public function resolveSchoolChildReferral(array $auth,string $id,array $data):array{$before=$this->one('school_child_referrals',$id);$status=(string)($data['status']??'registered');if(!in_array($status,['registered','could_not_locate'],true))throw new RuntimeException('Use registered or could_not_locate.');if($status==='registered'&&(empty($data['childId'])||empty($data['householdId'])))throw new RuntimeException('Registered resolution requires the created child and mapped household IDs.');$stmt=$this->db->pdo()->prepare('SELECT s.ward_id FROM schools s WHERE s.id=:id');$stmt->execute(['id'=>$before['school_id']]);$this->assertWard($auth,(string)$stmt->fetchColumn());$this->db->pdo()->prepare('UPDATE school_child_referrals SET status=:status,resolved_by=:by,resolved_at=NOW(),household_id=:household,converted_child_id=:child WHERE id=:id')->execute(['status'=>$status,'by'=>$auth['id'],'household'=>$data['householdId']??null,'child'=>$data['childId']??null,'id'=>$id]);$after=$this->one('school_child_referrals',$id);$this->audit->record($auth['id'],'RESOLVE','school_child_referral',$id,$before,$after);return$after;}

    public function terms(array $auth): array
    {
        $scopeType = $auth['assigned_scope_type'] ?? null;
        $scopeId = $auth['assigned_scope_id'] ?? null;
        $sql = 'SELECT t.*,a.session_name,a.state_id FROM terms t INNER JOIN academic_sessions a ON a.id=t.session_id';
        $params = [];
        if ($scopeType === 'school') { $sql .= ' WHERE a.state_id=(SELECT l.state_id FROM schools s INNER JOIN wards w ON w.id=s.ward_id INNER JOIN lgas l ON l.id=w.lga_id WHERE s.id=:scope_id)'; $params = ['scope_id' => $scopeId]; }
        elseif ($scopeType === 'class') { $sql .= ' WHERE a.state_id=(SELECT l.state_id FROM school_classes c INNER JOIN schools s ON s.id=c.school_id INNER JOIN wards w ON w.id=s.ward_id INNER JOIN lgas l ON l.id=w.lga_id WHERE c.id=:scope_id)'; $params = ['scope_id' => $scopeId]; }
        elseif ($scopeType === 'ward') { $sql .= ' WHERE a.state_id=(SELECT l.state_id FROM wards w INNER JOIN lgas l ON l.id=w.lga_id WHERE w.id=:scope_id)'; $params = ['scope_id' => $scopeId]; }
        elseif ($scopeType === 'lga') { $sql .= ' WHERE a.state_id=(SELECT state_id FROM lgas WHERE id=:scope_id)'; $params = ['scope_id' => $scopeId]; }
        elseif ($scopeType === 'state') { $sql .= ' WHERE a.state_id=:scope_id'; $params = ['scope_id' => $scopeId]; }
        $statement = $this->db->pdo()->prepare($sql . ' ORDER BY a.start_date DESC,t.start_date ASC');
        $statement->execute($params);
        return $statement->fetchAll();
    }

    public function tsangaya(array $auth, array $data): array
    {
        foreach (['tsangayaName', 'wardId', 'communityId'] as $key) if (empty($data[$key])) throw new RuntimeException("{$key} is required.");
        $this->assertWard($auth, (string) $data['wardId']); $this->assertCommunityForWard((string)$data['communityId'],(string)$data['wardId']);
        $id = Ulids::make(); $code = IdGenerator::nextCode($this->db->pdo(), 'tsangaya', 'AM2050-TSY-', 4);
        $this->db->pdo()->prepare('INSERT INTO tsangaya_schools(id,tsangaya_id,tsangaya_name,mallam_name,ward_id,community_id,registration_status,number_of_pupils_reported,integrated_school_id) VALUES(:id,:code,:name,:mallam,:ward,:community,:status,:pupils,:school)')->execute([
            'id'=>$id, 'code'=>$code, 'name'=>$data['tsangayaName'], 'mallam'=>$data['mallamName']??null, 'ward'=>$data['wardId'], 'community'=>$data['communityId'], 'status'=>$data['registrationStatus']??'unregistered', 'pupils'=>(int)($data['numberOfPupilsReported']??0), 'school'=>$data['integratedSchoolId']??null,
        ]);
        $record=$this->one('tsangaya_schools',$id); $this->audit->record($auth['id'],'CREATE','tsangaya_school',$id,null,$record); return $record;
    }

    public function survey(array $auth, array $data): array
    {
        foreach (['householdId', 'surveyDate'] as $key) if (empty($data[$key])) throw new RuntimeException("{$key} is required.");
        $this->assertHousehold($auth, (string) $data['householdId']); $leads=is_array($data['reportedChildren']??null)?$data['reportedChildren']:[];
        $id=Ulids::make(); return $this->db->transaction(function(PDO $pdo)use($auth,$data,$leads,$id){$pdo->prepare('INSERT INTO household_survey_events(id,household_id,surveyor_id,survey_date,notes,newborns_reported,unregistered_children_reported) VALUES(:id,:household,:user,:date,:notes,:newborns,:unregistered)')->execute(['id'=>$id,'household'=>$data['householdId'],'user'=>$auth['id'],'date'=>$data['surveyDate'],'notes'=>$data['notes']??null,'newborns'=>(int)($data['newbornsReported']??0),'unregistered'=>max((int)($data['unregisteredChildrenReported']??0),count($leads))]);$insert=$pdo->prepare("INSERT INTO unregistered_child_reports(id,survey_event_id,household_id,approximate_first_name,approximate_age,gender,status) VALUES(:id,:survey,:household,:name,:age,:gender,'reported')");foreach($leads as$lead){if(!is_array($lead)||trim((string)($lead['approximateFirstName']??''))==='')continue;$gender=in_array($lead['gender']??'unknown',['male','female','unknown'],true)?$lead['gender']:'unknown';$insert->execute(['id'=>Ulids::make(),'survey'=>$id,'household'=>$data['householdId'],'name'=>trim((string)$lead['approximateFirstName']),'age'=>isset($lead['approximateAge'])&&is_numeric($lead['approximateAge'])?(int)$lead['approximateAge']:null,'gender'=>$gender]);}$record=$this->one('household_survey_events',$id);$this->audit->record($auth['id'],'CREATE','household_survey_event',$id,null,['survey'=>$record,'reported_children'=>count($leads)]);return$record;});
    }

    public function cohort(array $auth,array $data):array { foreach(['name','cohortType','startDate'] as $key) if(empty($data[$key])) throw new RuntimeException("{$key} is required."); $id=Ulids::make(); $this->db->pdo()->prepare('INSERT INTO cohorts(id,name,description,cohort_type,start_date,status,owner_scope_type,owner_scope_id,created_by) VALUES(:id,:name,:description,:type,:start,:status,:scopeType,:scopeId,:user)')->execute(['id'=>$id,'name'=>$data['name'],'description'=>$data['description']??null,'type'=>$data['cohortType'],'start'=>$data['startDate'],'status'=>'active','scopeType'=>$auth['assigned_scope_type']??null,'scopeId'=>$auth['assigned_scope_id']??null,'user'=>$auth['id']]); $record=$this->one('cohorts',$id); $this->audit->record($auth['id'],'CREATE','cohort',$id,null,$record); return $record; }
    public function addCohortMember(array $auth,string $cohort,array $data):array { if(empty($data['childId'])) throw new RuntimeException('childId is required.');$this->cohortOwned($auth,$cohort);$id=Ulids::make();$this->db->pdo()->prepare('INSERT INTO cohort_members(id,cohort_id,child_id) VALUES(:id,:cohort,:child) ON DUPLICATE KEY UPDATE removed_at=NULL,removed_by=NULL')->execute(['id'=>$id,'cohort'=>$cohort,'child'=>$data['childId']]);$stmt=$this->db->pdo()->prepare('SELECT * FROM cohort_members WHERE cohort_id=:cohort AND child_id=:child');$stmt->execute(['cohort'=>$cohort,'child'=>$data['childId']]);$record=$stmt->fetch();$this->audit->record($auth['id'],'ASSIGN','cohort_member',$record['id'],null,$record);return$record; }
    public function removeCohortMember(array $auth,string $cohort,string $member):array{$this->cohortOwned($auth,$cohort);$stmt=$this->db->pdo()->prepare('SELECT * FROM cohort_members WHERE id=:id AND cohort_id=:cohort');$stmt->execute(['id'=>$member,'cohort'=>$cohort]);$before=$stmt->fetch()?:throw new RuntimeException('Cohort member not found.');$this->db->pdo()->prepare('UPDATE cohort_members SET removed_at=NOW(),removed_by=:user WHERE id=:id')->execute(['user'=>$auth['id'],'id'=>$member]);$after=$this->one('cohort_members',$member);$this->audit->record($auth['id'],'REMOVE','cohort_member',$member,$before,$after);return$after;}
    public function closeCohort(array $auth,string $id):array{$before=$this->cohortOwned($auth,$id);if($before['status']!=='active')throw new RuntimeException('Only active cohorts can be closed.');$this->db->pdo()->prepare("UPDATE cohorts SET status='completed',closed_at=NOW(),closed_by=:user WHERE id=:id")->execute(['user'=>$auth['id'],'id'=>$id]);$after=$this->one('cohorts',$id);$this->audit->record($auth['id'],'CLOSE','cohort',$id,$before,$after);return$after;}
    public function transferCohort(array $auth,string $id,array $data):array{$before=$this->cohortOwned($auth,$id);$type=(string)($data['ownerScopeType']??'');$scope=(string)($data['ownerScopeId']??'');$tables=['state'=>'states','lga'=>'lgas','ward'=>'wards','school'=>'schools','class'=>'school_classes'];if(!isset($tables[$type])||$scope==='')throw new RuntimeException('A valid geographic or education owner scope is required.');$stmt=$this->db->pdo()->prepare('SELECT id FROM '.$tables[$type].' WHERE id=:id');$stmt->execute(['id'=>$scope]);if(!$stmt->fetchColumn())throw new RuntimeException('The proposed cohort owner scope does not exist.');$this->db->pdo()->prepare('UPDATE cohorts SET owner_scope_type=:type,owner_scope_id=:scope WHERE id=:id')->execute(['type'=>$type,'scope'=>$scope,'id'=>$id]);$after=$this->one('cohorts',$id);$this->audit->record($auth['id'],'TRANSFER','cohort',$id,$before,$after);return$after;}
    public function delegateCohort(array $auth,string $id,array $data):array{$before=$this->cohortOwned($auth,$id);$user=(string)($data['userId']??'');if($user==='')throw new RuntimeException('A supervisor user is required.');$stmt=$this->db->pdo()->prepare("SELECT id FROM users WHERE id=:id AND role IN ('program_admin','lga_supervisor','ward_supervisor') AND is_active=1");$stmt->execute(['id'=>$user]);if(!$stmt->fetchColumn())throw new RuntimeException('The delegate must be an active programme or supervisory user.');$this->db->pdo()->prepare('UPDATE cohorts SET delegated_user_id=:delegate,delegated_by=:by,delegated_at=NOW() WHERE id=:id')->execute(['delegate'=>$user,'by'=>$auth['id'],'id'=>$id]);$after=$this->one('cohorts',$id);$this->audit->record($auth['id'],'DELEGATE','cohort',$id,$before,$after);return$after;}
    public function listCohorts(array $auth):array{$sql='SELECT c.*,COUNT(CASE WHEN cm.removed_at IS NULL THEN cm.id END) AS member_count FROM cohorts c LEFT JOIN cohort_members cm ON cm.cohort_id=c.id';$params=[];if(!in_array($auth['role'],['super_admin','program_admin'],true)){$sql.=' WHERE c.created_by=:user';$params=['user'=>$auth['id']];}$sql.=' GROUP BY c.id ORDER BY c.start_date DESC';$stmt=$this->db->pdo()->prepare($sql);$stmt->execute($params);return$stmt->fetchAll();}
    public function cohortProgress(array $auth,string $id):array{$this->cohortOwned($auth,$id);$stmt=$this->db->pdo()->prepare("SELECT c.*,COUNT(DISTINCT cm.child_id) AS member_count,COUNT(DISTINCT CASE WHEN e.enrollment_status='active' THEN cm.child_id END) AS active_enrollment,ROUND(AVG(CASE WHEN a.date>=DATE_SUB(CURDATE(),INTERVAL 30 DAY) THEN a.attendance_status IN ('present','late') END)*100,2) AS attendance_rate,ROUND(AVG(r.score),2) AS average_score FROM cohorts c LEFT JOIN cohort_members cm ON cm.cohort_id=c.id AND cm.removed_at IS NULL LEFT JOIN enrollments e ON e.child_id=cm.child_id AND e.enrollment_status='active' LEFT JOIN attendance a ON a.child_id=cm.child_id LEFT JOIN student_results r ON r.enrollment_id=e.id WHERE c.id=:id GROUP BY c.id");$stmt->execute(['id'=>$id]);return$stmt->fetch()?:throw new RuntimeException('Cohort not found.');}
    public function guardianChildren(array $auth):array{$phone=(string)($auth['phone']??'');if($phone==='')throw new RuntimeException('Guardian phone identity is unavailable.');$stmt=$this->db->pdo()->prepare("SELECT c.id,c.child_unique_id,c.first_name,c.last_name,c.date_of_birth,c.gender,c.child_status,e.id AS enrollment_id,e.enrollment_status,s.school_name,sc.class_name FROM children c LEFT JOIN enrollments e ON e.child_id=c.id AND e.enrollment_status='active' LEFT JOIN schools s ON s.id=e.school_id LEFT JOIN school_classes sc ON sc.id=e.class_id WHERE c.guardian_phone=:phone ORDER BY c.first_name,c.last_name");$stmt->execute(['phone'=>$phone]);$children=$stmt->fetchAll();foreach($children as&$child){$attendance=$this->db->pdo()->prepare('SELECT date,attendance_status FROM attendance WHERE child_id=:id ORDER BY date DESC LIMIT 30');$attendance->execute(['id'=>$child['id']]);$child['attendance']=$attendance->fetchAll();$results=$this->db->pdo()->prepare('SELECT r.subject,r.score,r.grade,t.term_name,t.academic_year FROM student_results r INNER JOIN enrollments e ON e.id=r.enrollment_id INNER JOIN terms t ON t.id=r.term_id WHERE e.child_id=:id ORDER BY r.created_at DESC');$results->execute(['id'=>$child['id']]);$child['results']=$results->fetchAll();$incentives=$this->db->pdo()->prepare('SELECT month,attendance_rate,eligibility_status,payment_status,disbursement_date FROM incentives WHERE child_id=:id ORDER BY month DESC');$incentives->execute(['id'=>$child['id']]);$child['incentives']=$incentives->fetchAll();}return$children;}

    public function incentiveCompute(array $auth,array $data):array { if(empty($data['month'])) throw new RuntimeException('month is required.'); $rawThresh=$this->db->pdo()->query("SELECT rule_value FROM program_rules WHERE rule_key='incentiveAttendanceThreshold'")->fetchColumn(); $threshold=$rawThresh!==false&&$rawThresh!==null?(float)json_decode((string)$rawThresh,true):80.0; $stmt=$this->db->pdo()->prepare("SELECT c.id,COALESCE(AVG(at.attendance_status IN ('present','late'))*100,0) rate FROM children c LEFT JOIN attendance at ON at.child_id=c.id AND DATE_FORMAT(at.date,'%Y-%m-01')=:month GROUP BY c.id"); $stmt->execute(['month'=>$data['month']]); $insert=$this->db->pdo()->prepare('INSERT INTO incentives(id,child_id,month,attendance_rate,eligibility_status) VALUES(:id,:child,:month,:rate,:eligibility) ON DUPLICATE KEY UPDATE attendance_rate=VALUES(attendance_rate),eligibility_status=VALUES(eligibility_status)'); $count=0; foreach($stmt->fetchAll() as $row){$insert->execute(['id'=>Ulids::make(),'child'=>$row['id'],'month'=>$data['month'],'rate'=>$row['rate'],'eligibility'=>(float)$row['rate']>=$threshold?'eligible':'ineligible']);$count++;}$this->audit->record($auth['id'],'COMPUTE','incentive',$data['month'],null,['records'=>$count]);return['computed'=>$count,'threshold'=>$threshold]; }

    public function listCompliance(array $auth,array $query):array { return $this->wardRegister($auth,'compliance_flags cf','cf.ward_id','cf.*',"CASE cf.status WHEN 'open' THEN 1 WHEN 'in_review' THEN 2 ELSE 3 END,cf.sla_due_date ASC",$query); }
    public function createCompliance(array $auth,array $data):array { foreach(['flagType','entityType','entityId','wardId'] as $key)if(empty($data[$key]))throw new RuntimeException("{$key} is required.");$this->assertWard($auth,(string)$data['wardId']);$id=Ulids::make();$this->db->pdo()->prepare('INSERT INTO compliance_flags(id,flag_type,entity_type,entity_id,ward_id,status,sla_due_date) VALUES(:id,:type,:entity_type,:entity_id,:ward,:status,:due)')->execute(['id'=>$id,'type'=>$data['flagType'],'entity_type'=>$data['entityType'],'entity_id'=>$data['entityId'],'ward'=>$data['wardId'],'status'=>$data['status']??'open','due'=>$data['slaDueDate']??null]);$record=$this->one('compliance_flags',$id);$this->audit->record($auth['id'],'CREATE','compliance_flag',$id,null,$record);return$record; }
    public function updateCompliance(array $auth,string $id,array $data):array { $before=$this->one('compliance_flags',$id);$this->assertWard($auth,(string)$before['ward_id']);$allowed=['status','slaDueDate'];$sets=[];$params=['id'=>$id];if(array_key_exists('status',$data)){$sets[]='status=:status';$params['status']=$data['status'];}if(array_key_exists('slaDueDate',$data)){$sets[]='sla_due_date=:slaDueDate';$params['slaDueDate']=$data['slaDueDate'];}if($sets===[])throw new RuntimeException('No supported compliance fields were supplied.');$this->db->pdo()->prepare('UPDATE compliance_flags SET '.implode(',',$sets).' WHERE id=:id')->execute($params);$after=$this->one('compliance_flags',$id);$this->audit->record($auth['id'],'UPDATE','compliance_flag',$id,$before,$after);return$after; }
    public function listIncentives(array $auth,array $query):array { $from='incentives i INNER JOIN children c ON c.id=i.child_id LEFT JOIN households h ON h.id=c.household_id';return $this->wardRegister($auth,$from,'COALESCE(h.ward_id,c.ward_id)',"i.*,c.child_unique_id,c.first_name,c.last_name,(SELECT rule_value FROM program_rules WHERE rule_key='incentiveAmount' LIMIT 1) AS configured_amount",'i.month DESC,i.created_at DESC',$query); }
    public function approveIncentive(array $auth,string $id,array $data):array { $before=$this->one('incentives',$id);if($before['eligibility_status']!=='eligible')throw new RuntimeException('Only eligible incentives can be approved.');$status=$data['paymentStatus']??'approved';if(!in_array($status,['approved','rejected'],true))throw new RuntimeException('paymentStatus must be approved or rejected.');$this->db->pdo()->prepare('UPDATE incentives SET payment_status=:status,approved_by=:user WHERE id=:id')->execute(['status'=>$status,'user'=>$auth['id'],'id'=>$id]);$after=$this->one('incentives',$id);$this->audit->record($auth['id'],'APPROVE','incentive',$id,$before,$after);return$after; }
    public function disburseIncentive(array $auth,string $id,array $data):array { if(empty($data['disbursementReference']))throw new RuntimeException('disbursementReference is required.');$before=$this->one('incentives',$id);if($before['payment_status']!=='approved')throw new RuntimeException('Only approved incentives can be marked disbursed.');$this->db->pdo()->prepare("UPDATE incentives SET payment_status='disbursed',disbursed_by=:user,disbursement_date=NOW(),disbursement_reference=:reference WHERE id=:id")->execute(['user'=>$auth['id'],'reference'=>$data['disbursementReference'],'id'=>$id]);$after=$this->one('incentives',$id);$this->audit->record($auth['id'],'DISBURSE','incentive',$id,$before,$after);return$after; }
    public function listTsangaya(array $auth, array $query): array { return $this->wardRegister($auth, 'tsangaya_schools t LEFT JOIN schools s ON s.id=t.integrated_school_id LEFT JOIN communities cm ON cm.id=t.community_id', 't.ward_id', 't.*,s.school_name AS integrated_school_name,cm.name AS community_name', 't.tsangaya_name', $query); }
    public function updateTsangaya(array $auth, string $id, array $data): array { $before=$this->tsangayaInScope($auth,$id);$ward=(string)($data['wardId']??$before['ward_id']);$community=(string)($data['communityId']??$before['community_id']);if($community==='')throw new RuntimeException('A Tsangaya community is required.');$this->assertWard($auth,$ward);$this->assertCommunityForWard($community,$ward);$allowed=['registrationStatus'=>'registration_status','integratedSchoolId'=>'integrated_school_id','mallamName'=>'mallam_name','numberOfPupilsReported'=>'number_of_pupils_reported','wardId'=>'ward_id','communityId'=>'community_id'];$sets=[];$params=['id'=>$id];foreach($allowed as$key=>$column)if(array_key_exists($key,$data)){$sets[]="{$column}=:{$key}";$params[$key]=$data[$key];}if($sets===[])throw new RuntimeException('No supported Tsangaya fields were supplied.');$this->db->pdo()->prepare('UPDATE tsangaya_schools SET '.implode(',',$sets).' WHERE id=:id')->execute($params);$after=$this->one('tsangaya_schools',$id);$this->audit->record($auth['id'],'UPDATE','tsangaya_school',$id,$before,$after);return$after; }
    public function listAlmajiriLinks(array $auth,array $query):array { $from='almajiri_links al INNER JOIN tsangaya_schools t ON t.id=al.tsangaya_id INNER JOIN children c ON c.id=al.child_id';return $this->wardRegister($auth,$from,'t.ward_id','al.*,t.tsangaya_name,c.child_unique_id,c.first_name,c.last_name','al.updated_at DESC',$query); }
    public function almajiriLink(array $auth,array $data):array { foreach(['childId','tsangayaId'] as $key)if(empty($data[$key]))throw new RuntimeException("{$key} is required.");$this->tsangayaInScope($auth,(string)$data['tsangayaId']);$id=Ulids::make();$this->db->pdo()->prepare('INSERT INTO almajiri_links(id,child_id,tsangaya_id,current_status,welfare_flag,welfare_notes) VALUES(:id,:child,:tsangaya,:status,:flag,:notes)')->execute(['id'=>$id,'child'=>$data['childId'],'tsangaya'=>$data['tsangayaId'],'status'=>$data['currentStatus']??'active','flag'=>(bool)($data['welfareFlag']??false),'notes'=>$data['welfareNotes']??null]);$record=$this->one('almajiri_links',$id);if(!empty($record['welfare_flag']))$this->raiseWelfareCompliance($auth,$record);$this->audit->record($auth['id'],'CREATE','almajiri_link',$id,null,$record);return$record; }
    public function updateAlmajiriLink(array $auth,string $id,array $data):array{$before=$this->one('almajiri_links',$id);$this->tsangayaInScope($auth,(string)$before['tsangaya_id']);$allowed=['currentStatus'=>'current_status','welfareFlag'=>'welfare_flag','welfareNotes'=>'welfare_notes'];$sets=[];$params=['id'=>$id];foreach($allowed as$key=>$column)if(array_key_exists($key,$data)){$sets[]="{$column}=:{$key}";$params[$key]=$key==='welfareFlag'?((bool)$data[$key]?1:0):$data[$key];}if($sets===[])throw new RuntimeException('No supported Almajiri link fields were supplied.');$this->db->pdo()->prepare('UPDATE almajiri_links SET '.implode(',',$sets).' WHERE id=:id')->execute($params);$after=$this->one('almajiri_links',$id);if(!empty($after['welfare_flag']))$this->raiseWelfareCompliance($auth,$after);$this->audit->record($auth['id'],'UPDATE','almajiri_link',$id,$before,$after);return$after;}
    public function listSurveys(array $auth,array $query):array { $from='household_survey_events hs INNER JOIN households h ON h.id=hs.household_id';return $this->wardRegister($auth,$from,'h.ward_id','hs.*,h.household_code,h.father_name,h.mother_name','hs.survey_date DESC',$query); }
    private function wardRegister(array $auth,string $from,string $wardColumn,string $select,string $order,array $query):array { [$page,$limit]=[max(1,(int)($query['page']??1)),min(250,max(1,(int)($query['limit']??100)))];$offset=($page-1)*$limit;[$scope,$params]=$this->fieldWardScope($auth,$wardColumn);$where=' WHERE 1=1'.$scope;$pdo=$this->db->pdo();$count=$pdo->prepare('SELECT COUNT(*) FROM '.$from.$where);$count->execute($params);$total=(int)$count->fetchColumn();$stmt=$pdo->prepare('SELECT '.$select.' FROM '.$from.$where.' ORDER BY '.$order.' LIMIT :limit OFFSET :offset');foreach($params as$key=>$value)$stmt->bindValue(':'.$key,$value);$stmt->bindValue(':limit',$limit,PDO::PARAM_INT);$stmt->bindValue(':offset',$offset,PDO::PARAM_INT);$stmt->execute();return['data'=>$stmt->fetchAll(),'page'=>$page,'limit'=>$limit,'total'=>$total]; }
    private function fieldWardScope(array $auth,string $wardColumn):array { return in_array($auth['role'],['mobilizer','almajiri_liaison'],true)?['',[]]:ScopeFilter::byWard($auth,$wardColumn); }
    private function tsangayaInScope(array $auth,string $id):array { $record=$this->one('tsangaya_schools',$id);[$scope,$params]=$this->fieldWardScope($auth,'id');if($scope!==''){$params['id']=$record['ward_id'];$check=$this->db->pdo()->prepare('SELECT id FROM wards WHERE id=:id'.$scope);$check->execute($params);if(!$check->fetch())throw new RuntimeException('Tsangaya school is outside your scope.');}return$record; }
    private function raiseWelfareCompliance(array $auth,array $link):void { $tsangaya=$this->one('tsangaya_schools',$link['tsangaya_id']);$existing=$this->db->pdo()->prepare("SELECT id FROM compliance_flags WHERE entity_type='almajiri_link' AND entity_id=:id AND status IN ('open','in_review')");$existing->execute(['id'=>$link['id']]);if($existing->fetch())return;$this->db->pdo()->prepare("INSERT INTO compliance_flags(id,flag_type,entity_type,entity_id,ward_id,status,sla_due_date) VALUES(:id,'welfare_flag','almajiri_link',:entity,:ward,'open',DATE_ADD(CURDATE(), INTERVAL 7 DAY))")->execute(['id'=>Ulids::make(),'entity'=>$link['id'],'ward'=>$tsangaya['ward_id']]); }
    private function scopedRegister(array $auth,string $from,string $wardColumn,string $schoolColumn,string $classColumn,string $select,string $order,array $query):array { [$page,$limit]=[max(1,(int)($query['page']??1)),min(250,max(1,(int)($query['limit']??100)))];$offset=($page-1)*$limit;[$scope,$params]=$this->educationScope($auth,$wardColumn,$schoolColumn,$classColumn);$where=' WHERE 1=1'.$scope;$pdo=$this->db->pdo();$count=$pdo->prepare('SELECT COUNT(*) FROM '.$from.$where);$count->execute($params);$total=(int)$count->fetchColumn();$statement=$pdo->prepare('SELECT '.$select.' FROM '.$from.$where.' ORDER BY '.$order.' LIMIT :limit OFFSET :offset');foreach($params as$key=>$value)$statement->bindValue(':'.$key,$value);$statement->bindValue(':limit',$limit,PDO::PARAM_INT);$statement->bindValue(':offset',$offset,PDO::PARAM_INT);$statement->execute();return['data'=>$statement->fetchAll(),'page'=>$page,'limit'=>$limit,'total'=>$total]; }
    private function educationScope(array $auth,string $wardColumn,string $schoolColumn,string $classColumn):array { $type=$auth['assigned_scope_type']??null;$scope=$auth['assigned_scope_id']??null;if(in_array($auth['role'],['super_admin','program_admin'],true))return['',[]];return match($type){'school'=>[" AND {$schoolColumn}=:scope_id",['scope_id'=>$scope]],'class'=>[" AND {$classColumn}=:scope_id",['scope_id'=>$scope]],default=>ScopeFilter::byWard($auth,$wardColumn)}; }
    private function enrollmentInScope(array $auth,string $id):array { $statement=$this->db->pdo()->prepare('SELECT e.*,s.ward_id,w.lga_id,l.state_id FROM enrollments e INNER JOIN schools s ON s.id=e.school_id INNER JOIN wards w ON w.id=s.ward_id INNER JOIN lgas l ON l.id=w.lga_id WHERE e.id=:id');$statement->execute(['id'=>$id]);$record=$statement->fetch()?:throw new RuntimeException('Enrollment not found.');[$scope,$params]=$this->educationScope($auth,'ward_id','school_id','class_id');if($scope!==''){$check=$this->db->pdo()->prepare('SELECT 1 FROM enrollments e INNER JOIN schools s ON s.id=e.school_id WHERE e.id=:id'.str_replace(['ward_id','school_id','class_id'],['s.ward_id','e.school_id','e.class_id'],$scope));$check->execute(['id'=>$id,...$params]);if(!$check->fetch())throw new RuntimeException('Enrollment is outside your scope.');}return$record; }
    private function assertTerm(array $auth,string $term,string $stateId):void { $stmt=$this->db->pdo()->prepare('SELECT a.state_id FROM terms t INNER JOIN academic_sessions a ON a.id=t.session_id WHERE t.id=:id');$stmt->execute(['id'=>$term]);$termState=$stmt->fetchColumn();if(!$termState)throw new RuntimeException('Term not found.');if($termState!==$stateId)throw new RuntimeException('Selected term does not belong to the school state.'); }
    private function assertClassSubject(?string $classId,string $subject):void { if(!$classId)throw new RuntimeException('An assigned class is required to record results.');$stmt=$this->db->pdo()->prepare('SELECT 1 FROM class_subjects cs INNER JOIN subjects s ON s.id=cs.subject_id WHERE cs.class_id=:class AND s.subject_name=:subject');$stmt->execute(['class'=>$classId,'subject'=>trim($subject)]);if(!$stmt->fetch())throw new RuntimeException('Subject is not registered for the selected class.'); }
    private function assertWard(array $auth,string $ward):void { [$scope,$params]=ScopeFilter::byWard($auth,'id');if($scope==='')return;$params['id']=$ward;$stmt=$this->db->pdo()->prepare('SELECT id FROM wards WHERE id=:id'.$scope);$stmt->execute($params);if(!$stmt->fetch())throw new RuntimeException('Selected ward is outside your scope.'); }
    private function assertCommunityForWard(string $community,string $ward):void{$stmt=$this->db->pdo()->prepare('SELECT id FROM communities WHERE id=:community AND ward_id=:ward');$stmt->execute(['community'=>$community,'ward'=>$ward]);if(!$stmt->fetch())throw new RuntimeException('Choose an existing community within the selected ward.');}
    private function assertHousehold(array $auth,string $household):void { $stmt=$this->db->pdo()->prepare('SELECT ward_id FROM households WHERE id=:id');$stmt->execute(['id'=>$household]);$ward=$stmt->fetchColumn();if(!$ward)throw new RuntimeException('Household not found.');$this->assertWard($auth,$ward); }
    private function referralSchoolId(array $auth):string{if(($auth['assigned_scope_type']??null)==='school')return(string)$auth['assigned_scope_id'];if(($auth['assigned_scope_type']??null)==='class'){$stmt=$this->db->pdo()->prepare('SELECT school_id FROM school_classes WHERE id=:id');$stmt->execute(['id'=>$auth['assigned_scope_id']]);return(string)($stmt->fetchColumn()?:throw new RuntimeException('Assigned class has no school.'));}throw new RuntimeException('A school or class scope is required.');}
    private function assertReferralSchool(array $auth,string $school):void{if(in_array($auth['role'],['headmaster','teacher'],true)&&$this->referralSchoolId($auth)!==$school)throw new RuntimeException('Selected school is outside your assigned scope.');}
    private function cohortOwned(array $auth,string $id):array{$record=$this->one('cohorts',$id);if(!in_array($auth['role'],['super_admin','program_admin'],true)&&$record['created_by']!==$auth['id']&&($record['delegated_user_id']??null)!==$auth['id'])throw new RuntimeException('This cohort is not owned by your programme account.');return$record;}
    private function assertResultEditAccess(array $auth, string $classId, string $subject): void
    {
        if (in_array($auth['role'], ['super_admin', 'program_admin'], true)) {
            return;
        }
        $pdo = $this->db->pdo();
        if ($auth['role'] === 'headmaster') {
            $stmt = $pdo->prepare('SELECT school_id FROM school_classes WHERE id=:class');
            $stmt->execute(['class' => $classId]);
            $schoolId = $stmt->fetchColumn();
            if (!$schoolId) throw new RuntimeException('Class not found.');
            if (($auth['assigned_scope_type'] ?? null) === 'school' && ($auth['assigned_scope_id'] ?? null) !== $schoolId) {
                throw new RuntimeException('Selected class is outside your assigned school.');
            }
            return;
        }
        if ($auth['role'] === 'teacher') {
            $teacherId = $auth['id'];
            // 1. Is this teacher the assigned Class Teacher for this class?
            $stmt = $pdo->prepare('SELECT teacher_id FROM school_classes WHERE id=:class');
            $stmt->execute(['class' => $classId]);
            $classTeacherId = $stmt->fetchColumn();
            if ($classTeacherId && $classTeacherId === $teacherId) {
                return; // Class Teacher can edit all subjects for their assigned class
            }
            // 2. Is this teacher the allocated Subject Teacher for this specific subject?
            $alloc = $pdo->prepare('SELECT 1 FROM teaching_allocations ta INNER JOIN subjects s ON s.id=ta.subject_id WHERE ta.class_id=:class AND s.subject_name=:subject AND ta.teacher_id=:teacher AND ta.is_active=1');
            $alloc->execute(['class' => $classId, 'subject' => trim($subject), 'teacher' => $teacherId]);
            if ($alloc->fetch()) {
                return; // Allocated subject teacher
            }
            throw new RuntimeException("Access denied: You are neither the Class Teacher nor the allocated Subject Teacher for '{$subject}' in this class.");
        }
        throw new RuntimeException('You do not have permission to manage student results.');
    }

    private function assertResultNotLocked(string $enrollmentId, string $termId, string $subject): void
    {
        $stmt = $this->db->pdo()->prepare('SELECT status FROM student_results WHERE enrollment_id=:enr AND term_id=:term AND subject=:sub');
        $stmt->execute(['enr' => $enrollmentId, 'term' => $termId, 'sub' => trim($subject)]);
        $status = $stmt->fetchColumn();
        if ($status === 'published') {
            throw new RuntimeException("Results for '{$subject}' in this term have already been officially published by the Headmaster and are locked against further modification.");
        }
    }

    private function one(string $table,string $id):array { $statement=$this->db->pdo()->prepare('SELECT * FROM '.$table.' WHERE id=:id');$statement->execute(['id'=>$id]);return$statement->fetch()?:throw new RuntimeException('Record not found.'); }
}
