<?php
declare(strict_types=1);

namespace AM2050\Services;

use AM2050\Core\Database;
use AM2050\Support\AuditLogger;
use AM2050\Support\ScopeFilter;
use AM2050\Support\Ulids;
use AM2050\Validation\Validator;
use PDO;
use RuntimeException;

/** Source-linked longitudinal child history. Operational tables remain the system of record. */
final class ChildJourneyService
{
    public function __construct(private readonly Database $database, private readonly AuditLogger $audit) {}

    public function children(array $auth, array $query): array
    {
        [$page, $limit, $offset] = Validator::page($query);
        $search = trim((string) ($query['search'] ?? ''));
        [$scope, $params] = $this->childScope($auth, 'c', 'h');
        $where = ' WHERE 1=1' . $scope;
        if ($search !== '') {
            $where .= ' AND (c.child_unique_id LIKE :search OR c.first_name LIKE :search OR c.last_name LIKE :search)';
            $params['search'] = "%{$search}%";
        }
        if (!empty($query['class_id'])) {
            $where .= ' AND js.active_class_id = :class_filter';
            $params['class_filter'] = $query['class_id'];
        }
        if (!empty($query['school_id'])) {
            $where .= ' AND js.active_school_id = :school_filter';
            $params['school_filter'] = $query['school_id'];
        }
        if (!empty($query['gender']) && in_array($query['gender'], ['male', 'female'], true)) {
            $where .= ' AND c.gender = :gender_filter';
            $params['gender_filter'] = $query['gender'];
        }

        $from = ' FROM children c LEFT JOIN households h ON h.id=c.household_id LEFT JOIN child_journey_summaries js ON js.child_id=c.id LEFT JOIN schools s ON s.id=js.active_school_id LEFT JOIN school_classes sc ON sc.id=js.active_class_id';
        $pdo = $this->database->pdo();
        $count = $pdo->prepare('SELECT COUNT(*)' . $from . $where);
        $count->execute($params);
        $total = (int) $count->fetchColumn();
        $statement = $pdo->prepare('SELECT c.id,c.child_unique_id,c.first_name,c.last_name,c.photo_url,c.gender,c.child_status,js.current_stage,js.next_action,js.last_event_at,s.school_name,sc.class_name' . $from . $where . ' ORDER BY COALESCE(js.last_event_at,c.created_at) DESC,c.last_name,c.first_name LIMIT :limit OFFSET :offset');
        foreach ($params as $key => $value) { $statement->bindValue(':' . $key, $value); }
        $statement->bindValue(':limit', $limit, PDO::PARAM_INT);
        $statement->bindValue(':offset', $offset, PDO::PARAM_INT);
        $statement->execute();
        return ['data' => $statement->fetchAll(), 'page' => $page, 'limit' => $limit, 'total' => $total];
    }

    public function journey(array $auth, string $childId, array $query): array
    {
        $child = $this->assertAccessibleChild($auth, $childId);
        $pdo = $this->database->pdo();

        $syncRequested = filter_var($query['sync'] ?? false, FILTER_VALIDATE_BOOLEAN);
        if ($syncRequested) {
            $this->syncChild($childId);
        } else {
            $chk = $pdo->prepare('SELECT 1 FROM child_journey_events WHERE child_id = :cid LIMIT 1');
            $chk->execute(['cid' => $childId]);
            if ($chk->fetch() === false) {
                $this->syncChild($childId);
            }
        }
        $eventTypes = array_values(array_filter(array_map('trim', explode(',', (string) ($query['types'] ?? '')))));
        $cursor = trim((string) ($query['cursor'] ?? ''));
        $limit = min(50, max(5, (int) ($query['limit'] ?? 20)));
        $params = ['child' => $childId, 'limit' => $limit + 1];
        $where = ' WHERE e.child_id=:child';
        if (($auth['role'] ?? '') === 'guardian') { $where .= ' AND e.guardian_visible=1'; }
        if ($eventTypes !== []) {
            $allowed = ['registration','household','enrollment','attendance','learning','support','referral','transition'];
            $eventTypes = array_values(array_intersect($eventTypes, $allowed));
            if ($eventTypes !== []) {
                $slots=[];
                foreach ($eventTypes as $index => $type) { $key='type'.$index; $slots[]=':'.$key; $params[$key]=$type.'_%'; }
                $where .= ' AND (' . implode(' OR ', array_map(static fn(string $slot): string => 'e.event_type LIKE '.$slot, $slots)) . ')';
            }
        }
        if ($cursor !== '') {
            [$time, $id] = array_pad(explode('|', base64_decode($cursor, true) ?: '', 2), 2, '');
            if ($time !== '' && $id !== '') { $where .= ' AND (e.occurred_at < :cursor_time OR (e.occurred_at = :cursor_time AND e.id < :cursor_id))'; $params['cursor_time']=$time; $params['cursor_id']=$id; }
        }
        $statement = $pdo->prepare('SELECT e.id,e.event_type,e.occurred_at,e.recorded_at,e.source_type,e.source_id,e.summary,e.event_details,e.guardian_visible FROM child_journey_events e' . $where . ' ORDER BY e.occurred_at DESC,e.id DESC LIMIT :limit');
        foreach ($params as $key => $value) { $statement->bindValue(':'.$key, $value, $key === 'limit' ? PDO::PARAM_INT : PDO::PARAM_STR); }
        $statement->execute();
        $rows = $statement->fetchAll();
        $hasMore = count($rows) > $limit;
        if ($hasMore) { array_pop($rows); }
        $events = array_map(function (array $row) use ($auth): array {
            $family = explode('_', (string) $row['event_type'])[0];
            return [
                'id' => $row['id'], 'type' => $row['event_type'], 'family' => $family,
                'occurredAt' => $row['occurred_at'], 'recordedAt' => $row['recorded_at'], 'summary' => $row['summary'],
                'details' => json_decode((string) ($row['event_details'] ?? '{}'), true) ?: [],
                'sourceType' => $row['source_type'], 'canOpenSource' => ($auth['role'] ?? '') !== 'guardian' && in_array($row['source_type'], ['child','enrollment','attendance_period','result_period','incentive','referral'], true),
            ];
        }, $rows);

        $summary = $pdo->prepare('SELECT js.current_stage,js.next_action,js.last_event_at,s.school_name,sc.class_name FROM child_journey_summaries js LEFT JOIN schools s ON s.id=js.active_school_id LEFT JOIN school_classes sc ON sc.id=js.active_class_id WHERE js.child_id=:child');
        $summary->execute(['child'=>$childId]);
        $summaryData = $summary->fetch() ?: ['current_stage'=>'registered','next_action'=>'Review child record','last_event_at'=>$child['created_at'],'school_name'=>null,'class_name'=>null];

        // Cumulative Attendance Metrics
        $attCalc = $pdo->prepare("SELECT COUNT(*) AS total_days, SUM(attendance_status IN ('present', 'late')) AS attended_days, SUM(attendance_status = 'absent') AS absent_days FROM attendance WHERE child_id = :child");
        $attCalc->execute(['child' => $childId]);
        $attStats = $attCalc->fetch() ?: ['total_days' => 0, 'attended_days' => 0, 'absent_days' => 0];
        $totalDays = (int)($attStats['total_days'] ?? 0);
        $attendedDays = (int)($attStats['attended_days'] ?? 0);
        $attendanceRate = $totalDays > 0 ? round(($attendedDays / $totalDays) * 100, 1) : 100.0;

        // Academic Results
        $resCalc = $pdo->prepare("SELECT overall_average, overall_grade, position, academic_year, t.term_name FROM student_term_results tr LEFT JOIN terms t ON t.id = tr.term_id WHERE tr.child_id = :child ORDER BY tr.created_at DESC LIMIT 1");
        $resCalc->execute(['child' => $childId]);
        $latestExam = $resCalc->fetch();

        // Active Placement
        $enrInfo = $pdo->prepare("SELECT e.*, s.school_name, sc.class_name FROM enrollments e INNER JOIN schools s ON s.id = e.school_id LEFT JOIN school_classes sc ON sc.id = e.class_id WHERE e.child_id = :child AND e.enrollment_status = 'active' LIMIT 1");
        $enrInfo->execute(['child' => $childId]);
        $activeEnr = $enrInfo->fetch();

        $clearedGates = 1 + (!empty($activeEnr) ? 1 : 0) + ($totalDays > 0 ? 1 : 0) + (!empty($latestExam) ? 1 : 0);

        $nextCursor = null;
        if ($hasMore && $events !== []) { $last=$events[count($events)-1]; $nextCursor=base64_encode($last['occurredAt'].'|'.$last['id']); }
        $this->audit->record($auth['id'], 'VIEW_JOURNEY', 'child', $childId, null, ['eventCount'=>count($events), 'guardianView'=>($auth['role']??'')==='guardian']);

        return [
            'child' => [
                'id' => $child['id'],
                'registrationId' => $child['child_unique_id'],
                'name' => trim($child['first_name'] . ' ' . $child['last_name']),
                'firstName' => $child['first_name'],
                'lastName' => $child['last_name'],
                'photoUrl' => $child['photo_url'],
                'gender' => $child['gender'],
                'dob' => $child['date_of_birth'] ?? null,
                'estimatedAge' => $child['estimated_age'] ?? null,
                'guardianPhone' => $child['guardian_phone'] ?? null,
                'guardianName' => trim(($child['father_name'] ?? '') . ' ' . ($child['mother_name'] ?? '')),
                'householdCode' => $child['household_code'] ?? null,
                'wardName' => $child['ward_name'] ?? null,
                'communityName' => $child['community_name'] ?? null,
                'qrToken' => $child['attendance_qr_token'] ?? null,
            ],
            'summary' => [
                'currentStage' => $summaryData['current_stage'],
                'nextAction' => $summaryData['next_action'],
                'lastEventAt' => $summaryData['last_event_at'],
                'schoolName' => $summaryData['school_name'] ?? $activeEnr['school_name'] ?? null,
                'className' => $summaryData['class_name'] ?? $activeEnr['class_name'] ?? null,
                'overallAttendanceRate' => $attendanceRate,
                'totalSchoolDays' => $totalDays,
                'attendedDays' => $attendedDays,
                'academicAverage' => $latestExam ? (float)$latestExam['overall_average'] : null,
                'latestGrade' => $latestExam['overall_grade'] ?? null,
                'latestPosition' => $latestExam['position'] ?? null,
                'clearedGates' => $clearedGates,
                'retentionStatus' => ($attendanceRate < 75 || ($attStats['absent_days'] ?? 0) >= 3) ? 'at_risk' : 'optimal',
            ],
            'events' => $events,
            'nextCursor' => $nextCursor
        ];
    }

    public function backfill(?string $actorId = null): array
    {
        $pdo=$this->database->pdo(); $run=Ulids::make();
        $pdo->prepare('INSERT INTO child_journey_backfill_runs(id,started_by) VALUES(:id,:actor)')->execute(['id'=>$run,'actor'=>$actorId]);
        try {
            $ids=$pdo->query('SELECT id FROM children ORDER BY created_at,id')->fetchAll(PDO::FETCH_COLUMN); $processed=0;
            foreach ($ids as $childId) { $this->syncChild((string) $childId); $processed++; }
            $pdo->prepare("UPDATE child_journey_backfill_runs SET status='completed',completed_at=NOW(),processed_count=:count WHERE id=:id")->execute(['count'=>$processed,'id'=>$run]);
            return ['runId'=>$run,'processed'=>$processed];
        } catch (\Throwable $error) {
            $pdo->prepare("UPDATE child_journey_backfill_runs SET status='failed',completed_at=NOW(),error_message=:error WHERE id=:id")->execute(['error'=>mb_substr($error->getMessage(),0,2000),'id'=>$run]);
            throw $error;
        }
    }

    private function assertAccessibleChild(array $auth, string $childId): array
    {
        [$scope,$params]=$this->childScope($auth,'c','h'); $params['child']=$childId;
        $statement=$this->database->pdo()->prepare(
            'SELECT c.id, c.child_unique_id, c.first_name, c.last_name, c.photo_url, c.gender, 
                    c.date_of_birth, c.estimated_age, c.guardian_phone, c.attendance_qr_token, c.created_at,
                    h.household_code, h.father_name, h.mother_name,
                    w.name AS ward_name, cm.name AS community_name
             FROM children c 
             LEFT JOIN households h ON h.id=c.household_id 
             LEFT JOIN wards w ON w.id=c.ward_id
             LEFT JOIN communities cm ON cm.id=h.community_id
             WHERE c.id=:child'.$scope.' LIMIT 1'
        );
        $statement->execute($params); return $statement->fetch() ?: throw new RuntimeException('Child Journey record not found or not authorised.');
    }

    private function childScope(array $auth, string $childAlias, string $householdAlias): array
    {
        $role=$auth['role']??''; $scopeId=$auth['assigned_scope_id']??null;
        if (in_array($role,['super_admin','program_admin'],true)) return ['',[]];
        if ($role==='guardian') return [" AND {$childAlias}.guardian_phone=:guardian_phone",['guardian_phone'=>$auth['phone']??'']];
        if (($auth['assigned_scope_type']??'')==='school') return [" AND EXISTS (SELECT 1 FROM enrollments je WHERE je.child_id={$childAlias}.id AND je.school_id=:scope_id)",['scope_id'=>$scopeId]];
        if (($auth['assigned_scope_type']??'')==='class') return [" AND EXISTS (SELECT 1 FROM enrollments je WHERE je.child_id={$childAlias}.id AND je.class_id=:scope_id)",['scope_id'=>$scopeId]];
        return ScopeFilter::byWard($auth,"COALESCE({$householdAlias}.ward_id,{$childAlias}.ward_id)");
    }

    private function syncChild(string $childId): void
    {
        $pdo=$this->database->pdo();
        $child=$pdo->prepare('SELECT c.*,h.household_code,h.father_name,h.mother_name FROM children c LEFT JOIN households h ON h.id=c.household_id WHERE c.id=:id'); $child->execute(['id'=>$childId]); $record=$child->fetch();
        if (!$record) return;
        $this->upsert($childId,'registration_created',$record['created_at'],'child',$record['id'],'registration', 'Child registration completed.', ['registrationId'=>$record['child_unique_id']], true, $record['registered_by']);
        if ($record['household_id']) $this->upsert($childId,'household_linked',$record['created_at'],'household',$record['household_id'],'household-link','Linked to household '.$record['household_code'].'.',[],true,$record['registered_by']);
        if ($record['guardian_phone']) $this->upsert($childId,'registration_guardian_confirmed',$record['updated_at'],'child',$record['id'],'guardian-confirmed','Guardian contact recorded for this child.',[],true,null);
        $al=$pdo->prepare('SELECT al.*,ts.tsangaya_name FROM almajiri_links al INNER JOIN tsangaya_schools ts ON ts.id=al.tsangaya_id WHERE al.child_id=:child'); $al->execute(['child'=>$childId]);
        foreach($al->fetchAll() as $link){$this->upsert($childId,'registration_tsangaya_linked',$link['created_at'],'almajiri_link',$link['id'],'tsangaya:'.$link['id'],'Linked to Tsangaya school '.$link['tsangaya_name'].'.',['status'=>$link['current_status']],false,null);}
        $en=$pdo->prepare('SELECT e.*,s.school_name,sc.class_name FROM enrollments e INNER JOIN schools s ON s.id=e.school_id LEFT JOIN school_classes sc ON sc.id=e.class_id WHERE e.child_id=:child');$en->execute(['child'=>$childId]);$enrollments=$en->fetchAll();
        $active=null;
        foreach($enrollments as $row){$type='enrollment_'.($row['enrollment_status']==='active'?'confirmed':$row['enrollment_status']);$title=$row['enrollment_status']==='active'?'Enrolled at ':ucfirst($row['enrollment_status']).' from ';$this->upsert($childId,$type,$row['enrollment_date'],'enrollment',$row['id'],'enrollment:'.$row['id'],$title.$row['school_name'].($row['class_name']?' · '.$row['class_name']:'.'),['school'=>$row['school_name'],'class'=>$row['class_name'],'status'=>$row['enrollment_status']],true,$row['approved_by']);if($row['enrollment_status']==='active')$active=$row;}
        $attendance=$pdo->prepare("SELECT DATE_FORMAT(a.date,'%Y-%m-01') AS period_start,MAX(a.date) AS period_end,a.school_id,a.class_id,s.school_name,sc.class_name,COUNT(*) AS recorded_days,SUM(a.attendance_status IN ('present','late')) AS attended_days FROM attendance a INNER JOIN schools s ON s.id=a.school_id LEFT JOIN school_classes sc ON sc.id=a.class_id WHERE a.child_id=:child GROUP BY period_start,a.school_id,a.class_id,s.school_name,sc.class_name");$attendance->execute(['child'=>$childId]);foreach($attendance->fetchAll() as $row){$rate=$row['recorded_days']?(int)round(((int)$row['attended_days']/(int)$row['recorded_days'])*100):0;$this->upsert($childId,'attendance_period_summary',$row['period_end'],'attendance_period',null,'attendance:'.$row['school_id'].':'.($row['class_id']??'none').':'.$row['period_start'],'Attendance recorded: '.$rate.'% across '.$row['recorded_days'].' school days.',['rate'=>$rate,'recordedDays'=>(int)$row['recorded_days'],'school'=>$row['school_name'],'class'=>$row['class_name'],'periodStart'=>$row['period_start']],true,null);}
        
        $termResults = $pdo->prepare('SELECT tr.*, t.term_name FROM student_term_results tr LEFT JOIN terms t ON t.id = tr.term_id WHERE tr.child_id = :child');
        $termResults->execute(['child' => $childId]);
        $trRows = $termResults->fetchAll();
        foreach ($trRows as $row) {
            $tName = $row['term_name'] ?? 'Term Examination';
            $ay = $row['academic_year'];
            $avg = (float)$row['overall_average'];
            $grade = $row['overall_grade'];
            $pos = $row['position'];
            $subjects = json_decode((string)($row['subjects_data'] ?? '[]'), true) ?: [];
            $subCount = count($subjects);
            $summary = "Examinations recorded for {$tName} {$ay}: Average {$avg}% (Grade {$grade}) across {$subCount} subjects" . ($pos ? ", Position {$pos}." : ".");
            $this->upsert(
                $childId,
                'learning_term_results',
                $row['updated_at'] ?: $row['created_at'],
                'result_period',
                $row['id'],
                'term_results:' . $row['id'],
                $summary,
                [
                    'term' => $tName,
                    'academicYear' => $ay,
                    'averageScore' => $avg,
                    'grade' => $grade,
                    'position' => $pos,
                    'subjectCount' => $subCount,
                    'subjects' => $subjects,
                    'status' => $row['status']
                ],
                true,
                $row['created_by'] ?? null
            );
        }

        if (empty($trRows)) {
            $results=$pdo->prepare('SELECT r.enrollment_id,r.term_id,MAX(r.updated_at) AS occurred_at,t.term_name,t.academic_year,COUNT(*) AS subject_count,ROUND(AVG(r.score),2) AS average_score FROM student_results r INNER JOIN terms t ON t.id=r.term_id INNER JOIN enrollments e ON e.id=r.enrollment_id WHERE e.child_id=:child GROUP BY r.enrollment_id,r.term_id,t.term_name,t.academic_year');$results->execute(['child'=>$childId]);foreach($results->fetchAll() as $row){$this->upsert($childId,'learning_term_results',$row['occurred_at'],'result_period',null,'results:'.$row['enrollment_id'].':'.$row['term_id'],'Results recorded for '.$row['term_name'].' '.$row['academic_year'].': average '.$row['average_score'].' across '.$row['subject_count'].' subjects.',['term'=>$row['term_name'],'academicYear'=>$row['academic_year'],'averageScore'=>$row['average_score'],'subjectCount'=>(int)$row['subject_count']],true,null);}
        }
        $behaviour=$pdo->prepare('SELECT b.enrollment_id,b.term_id,MAX(b.created_at) AS occurred_at,t.term_name,t.academic_year,COUNT(*) AS record_count FROM behavioral_trackers b INNER JOIN terms t ON t.id=b.term_id INNER JOIN enrollments e ON e.id=b.enrollment_id WHERE e.child_id=:child GROUP BY b.enrollment_id,b.term_id,t.term_name,t.academic_year');$behaviour->execute(['child'=>$childId]);foreach($behaviour->fetchAll() as $row){$this->upsert($childId,'learning_support_recorded',$row['occurred_at'],'behaviour_period',null,'behaviour:'.$row['enrollment_id'].':'.$row['term_id'],'Learning and wellbeing support record updated for '.$row['term_name'].' '.$row['academic_year'].'.',['term'=>$row['term_name'],'academicYear'=>$row['academic_year'],'recordCount'=>(int)$row['record_count']],false,null);}
        $incentives=$pdo->prepare('SELECT * FROM incentives WHERE child_id=:child');$incentives->execute(['child'=>$childId]);foreach($incentives->fetchAll() as $row){$date=$row['disbursement_date']?:$row['created_at'];$type=$row['payment_status']==='disbursed'?'support_incentive_disbursed':'support_incentive_reviewed';$summary=$row['payment_status']==='disbursed'?'Education support recorded as disbursed.':'Education support eligibility reviewed.';$this->upsert($childId,$type,$date,'incentive',$row['id'],'incentive:'.$row['id'],$summary,['status'=>$row['payment_status'],'type'=>$row['incentive_type']],$row['payment_status']==='disbursed',null);}
        $referrals=$pdo->prepare('SELECT u.* FROM unregistered_child_reports u WHERE u.converted_child_id=:child');$referrals->execute(['child'=>$childId]);foreach($referrals->fetchAll() as $row){$this->upsert($childId,'referral_registry_resolved',$row['updated_at'],'referral',$row['id'],'referral:'.$row['id'],'Child-not-in-register report resolved through registration.',['status'=>$row['status']],false,null);}
        $flags=$pdo->prepare("SELECT * FROM compliance_flags WHERE entity_type='child' AND entity_id=:child");$flags->execute(['child'=>$childId]);foreach($flags->fetchAll() as $row){$this->upsert($childId,'support_compliance_'.($row['status']==='resolved'?'resolved':'reviewed'),$row['updated_at'],'compliance',$row['id'],'compliance:'.$row['id'],'Programme follow-up record '.str_replace('_',' ',$row['status']).'.',['status'=>$row['status']],false,null);}
        $stage=$record['child_status']!=='active'?'transition_'.(string)$record['child_status']:($active?'active_learning':'awaiting_enrollment');$next=$stage==='active_learning'?'Maintain attendance and record the next term result.':($stage==='awaiting_enrollment'?'Review the child for school enrollment.':'Review the child transition and record verified follow-up.');$last=$pdo->prepare('SELECT MAX(occurred_at) FROM child_journey_events WHERE child_id=:child');$last->execute(['child'=>$childId]);$lastAt=$last->fetchColumn()?:$record['created_at'];$pdo->prepare('INSERT INTO child_journey_summaries(child_id,current_stage,next_action,active_school_id,active_class_id,last_event_at) VALUES(:child,:stage,:next,:school,:class,:last) ON DUPLICATE KEY UPDATE current_stage=VALUES(current_stage),next_action=VALUES(next_action),active_school_id=VALUES(active_school_id),active_class_id=VALUES(active_class_id),last_event_at=VALUES(last_event_at)')->execute(['child'=>$childId,'stage'=>$stage,'next'=>$next,'school'=>$active['school_id']??null,'class'=>$active['class_id']??null,'last'=>$lastAt]);
    }

    private function upsert(string $childId,string $type,string $occurredAt,string $sourceType,?string $sourceId,string $sourceKey,string $summary,array $details,bool $guardianVisible,?string $actorId): void
    { $this->database->pdo()->prepare('INSERT INTO child_journey_events(id,child_id,event_type,occurred_at,source_type,source_id,source_key,summary,event_details,guardian_visible,actor_user_id) VALUES(:id,:child,:type,:occurred,:sourceType,:sourceId,:sourceKey,:summary,:details,:guardian,:actor) ON DUPLICATE KEY UPDATE occurred_at=VALUES(occurred_at),summary=VALUES(summary),event_details=VALUES(event_details),guardian_visible=VALUES(guardian_visible),actor_user_id=COALESCE(VALUES(actor_user_id),actor_user_id)')->execute(['id'=>Ulids::make(),'child'=>$childId,'type'=>$type,'occurred'=>$occurredAt,'sourceType'=>$sourceType,'sourceId'=>$sourceId,'sourceKey'=>$sourceKey,'summary'=>$summary,'details'=>json_encode($details,JSON_THROW_ON_ERROR),'guardian'=>$guardianVisible?1:0,'actor'=>$actorId]); }
}
