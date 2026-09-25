<?php
declare(strict_types=1);
namespace AM2050\Services;
use AM2050\Core\Database; use AM2050\Support\AuditLogger; use AM2050\Support\IdGenerator; use AM2050\Support\ScopeFilter; use AM2050\Support\Ulids; use PDO; use RuntimeException;

final class EducationService {
  public function __construct(private readonly Database $db,private readonly AuditLogger $audit,private readonly ?CloudinaryService $cloudinary = null){}
  public function schools(array $auth,array $query):array{return $this->scopedList($auth,'schools s LEFT JOIN communities cm ON cm.id=s.community_id','s.ward_id','s.id',null,'s.*,cm.name AS community_name','s.school_name',$query);}
  public function createSchool(array $auth,array $data):array{foreach(['schoolName','schoolType','ownership','wardId','communityId'] as $key){if(empty($data[$key]))throw new RuntimeException("{$key} is required.");}if(!in_array($data['schoolType'],['formal','tsangaya','non_formal','primary','secondary','integrated','islamiyya'],true))throw new RuntimeException('Choose a supported school type.');if(!in_array($data['ownership'],['public','government','private','faith_based','community'],true))throw new RuntimeException('Choose a supported school ownership type.');$this->assertWard($auth,$data['wardId']);$this->assertCommunityForWard($auth,(string)$data['communityId'],(string)$data['wardId']);return $this->db->transaction(function(PDO $pdo)use($auth,$data){$id=Ulids::make();$code=IdGenerator::nextCode($pdo,'school','AM2050-SCH-',4);$pdo->prepare('INSERT INTO schools (id,school_id,school_name,school_type,ownership,ward_id,community_id,headmaster_user_id,total_capacity) VALUES (:id,:code,:name,:type,:ownership,:ward,:community,:headmaster,:capacity)')->execute(['id'=>$id,'code'=>$code,'name'=>$data['schoolName'],'type'=>$data['schoolType'],'ownership'=>$data['ownership'],'ward'=>$data['wardId'],'community'=>$data['communityId'],'headmaster'=>$data['headmasterUserId']??null,'capacity'=>(int)($data['totalCapacity']??0)]);$r=$this->one($pdo,'schools',$id);$this->audit->record($auth['id'],'CREATE','school',$id,null,$r);return $r;});}
  public function classes(array $auth,array $query):array{$from='school_classes c INNER JOIN schools s ON s.id=c.school_id';return $this->scopedList($auth,$from,'s.ward_id','s.id','c.id','c.*,s.school_name','c.class_name',$query);}
  public function createClass(array $auth,array $data):array{foreach(['schoolId','className','academicYear'] as $key){if(empty($data[$key]))throw new RuntimeException("{$key} is required.");}$this->assertSchool($auth,$data['schoolId']);return $this->db->transaction(function(PDO $pdo)use($auth,$data){$id=Ulids::make();$code=IdGenerator::nextCode($pdo,'class','AM2050-CLS-',6);$pdo->prepare('INSERT INTO school_classes (id,class_code,class_name,school_id,teacher_id,class_level,capacity,academic_year) VALUES (:id,:code,:name,:school,:teacher,:level,:capacity,:year)')->execute(['id'=>$id,'code'=>$code,'name'=>$data['className'],'school'=>$data['schoolId'],'teacher'=>$data['teacherId']??null,'level'=>$data['classLevel']??'Primary 1','capacity'=>(int)($data['capacity']??40),'year'=>$data['academicYear']]);$r=$this->one($pdo,'school_classes',$id);$this->audit->record($auth['id'],'CREATE','class',$id,null,$r);return $r;});}
  public function updateSchool(array $auth,string $id,array $data):array{$before=$this->one($this->db->pdo(),'schools',$id);$this->assertSchool($auth,$id);$ward=(string)($data['wardId']??$before['ward_id']);$community=(string)($data['communityId']??$before['community_id']);if($community==='')throw new RuntimeException('A school community is required.');$this->assertWard($auth,$ward);$this->assertCommunityForWard($auth,$community,$ward);$map=['schoolName'=>'school_name','schoolType'=>'school_type','ownership'=>'ownership','wardId'=>'ward_id','communityId'=>'community_id','headmasterUserId'=>'headmaster_user_id','totalCapacity'=>'total_capacity','isActive'=>'is_active'];$sets=[];$params=['id'=>$id];foreach($map as$key=>$column){if(!array_key_exists($key,$data))continue;if($key==='headmasterUserId'&&$data[$key]!==null)$this->assertUserRole((string)$data[$key],'headmaster');$sets[]=$column.'=:'.$key;$params[$key]=$key==='totalCapacity'?(int)$data[$key]:($key==='isActive'?(int)(bool)$data[$key]:$data[$key]);}if($sets===[])throw new RuntimeException('No supported school fields were supplied.');$this->db->pdo()->prepare('UPDATE schools SET '.implode(',',$sets).' WHERE id=:id')->execute($params);$after=$this->one($this->db->pdo(),'schools',$id);$this->audit->record($auth['id'],($data['isActive']??true)===false?'DEACTIVATE':'UPDATE','school',$id,$before,$after);return$after;}
  public function updateClass(array $auth,string $id,array $data):array{$before=$this->one($this->db->pdo(),'school_classes',$id);$this->assertClass($auth,$id);$map=['className'=>'class_name','teacherId'=>'teacher_id','classLevel'=>'class_level','capacity'=>'capacity','academicYear'=>'academic_year','isActive'=>'is_active'];$sets=[];$params=['id'=>$id];foreach($map as$key=>$column){if(!array_key_exists($key,$data))continue;if($key==='teacherId'&&$data[$key]!==null)$this->assertUserRole((string)$data[$key],'teacher');$sets[]=$column.'=:'.$key;$params[$key]=$key==='capacity'?(int)$data[$key]:$data[$key];}if($sets===[])throw new RuntimeException('No supported class fields were supplied.');$this->db->pdo()->prepare('UPDATE school_classes SET '.implode(',',$sets).' WHERE id=:id')->execute($params);$after=$this->one($this->db->pdo(),'school_classes',$id);$this->audit->record($auth['id'],($data['isActive']??true)===false?'DEACTIVATE':'UPDATE','class',$id,$before,$after);return$after;}
  public function updateSchoolLogo(array $auth,string $id,array $data):array{$before=$this->one($this->db->pdo(),'schools',$id);$this->assertSchool($auth,$id);$logo=$this->normaliseImageData((string)($data['schoolLogo']??''));if($logo&&$this->cloudinary!==null&&$this->cloudinary->isConfigured()){$uploaded=$this->cloudinary->uploadImage($logo,'am2050/schools',$id);if($uploaded!==null)$logo=$uploaded;}$this->db->pdo()->prepare('UPDATE schools SET school_logo=:logo WHERE id=:id')->execute(['logo'=>$logo,'id'=>$id]);$after=$this->one($this->db->pdo(),'schools',$id);$this->audit->record($auth['id'],'UPDATE','school_logo',$id,['school_logo'=>$before['school_logo']??null],['school_logo'=>$logo]);return$after;}
  public function transferDestinations(array $auth,array $query):array{$search=trim((string)($query['search']??''));$limit=min(40,max(1,(int)($query['limit']??20)));$source=$auth['assigned_scope_type']==='school'?$auth['assigned_scope_id']:null;if(!$source)throw new RuntimeException('An assigned school is required to search transfer destinations.');$sql='SELECT d.id,d.school_id,d.school_name,d.school_type,w.name AS ward_name,cm.name AS community_name FROM schools d INNER JOIN wards w ON w.id=d.ward_id INNER JOIN communities cm ON cm.id=d.community_id WHERE d.is_active=1 AND d.id<>:sourceExcluded AND w.lga_id=(SELECT w2.lga_id FROM schools s2 INNER JOIN wards w2 ON w2.id=s2.ward_id WHERE s2.id=:sourceLga)';$params=['sourceExcluded'=>$source,'sourceLga'=>$source];if($search!==''){$sql.=' AND (d.school_name LIKE :searchName OR d.school_id LIKE :searchCode OR cm.name LIKE :searchCommunity OR w.name LIKE :searchWard)';$term='%'.$search.'%';$params['searchName']=$term;$params['searchCode']=$term;$params['searchCommunity']=$term;$params['searchWard']=$term;}$sql.=' ORDER BY d.school_name LIMIT :limit';$stmt=$this->db->pdo()->prepare($sql);foreach($params as$key=>$value)$stmt->bindValue(':'.$key,$value);$stmt->bindValue(':limit',$limit,PDO::PARAM_INT);$stmt->execute();return$stmt->fetchAll();}
  public function ownCertificateSignature(array $auth):array{$stmt=$this->db->pdo()->prepare('SELECT signature_data FROM users WHERE id=:id');$stmt->execute(['id'=>$auth['id']]);return['signatureData'=>$stmt->fetchColumn()?:null];}
  public function updateOwnCertificateSignature(array $auth,array $data):array{$before=$this->ownCertificateSignature($auth);$signature=$this->normaliseImageData((string)($data['signatureData']??''),'signature');if($signature&&$this->cloudinary!==null&&$this->cloudinary->isConfigured()){$uploaded=$this->cloudinary->uploadImage($signature,'am2050/signatures',$auth['id']);if($uploaded!==null)$signature=$uploaded;}$this->db->pdo()->prepare('UPDATE users SET signature_data=:signature WHERE id=:id')->execute(['signature'=>$signature,'id'=>$auth['id']]);$after=['signatureData'=>$signature];$this->audit->record($auth['id'],'UPDATE','certificate_signature',$auth['id'],['present'=>$before['signatureData']!==null],['present'=>$signature!==null]);return$after;}
  public function applyCertificateSignature(array $auth,string $id,array $data):array{$type=(string)($data['certificateType']??'');if(!in_array($type,['enrollment','transfer','withdrawal'],true))throw new RuntimeException('Choose an enrollment, transfer, or withdrawal certificate.');$before=$this->one($this->db->pdo(),'enrollments',$id);$this->assertSchool($auth,$before['school_id']);$actorField=$type==='enrollment'?'approved_by':'transitioned_by';$signatureField=$type==='enrollment'?'approved_signature_data':'transition_signature_data';if(($before[$actorField]??null)!==$auth['id'])throw new RuntimeException('Only the authorised Headmaster who recorded this certificate action can apply a signature.');if(($type==='transfer'&&$before['enrollment_status']!=='transferred')||($type==='withdrawal'&&$before['enrollment_status']!=='withdrawn'))throw new RuntimeException('This certificate is not available for signature in its current status.');$signature=$this->ownCertificateSignature($auth)['signatureData'];if(!$signature)throw new RuntimeException('Upload your certificate signature before applying it.');$this->db->pdo()->prepare('UPDATE enrollments SET '.$signatureField.'=:signature WHERE id=:id')->execute(['signature'=>$signature,'id'=>$id]);$after=$this->one($this->db->pdo(),'enrollments',$id);$this->audit->record($auth['id'],'APPLY_SIGNATURE','enrollment_certificate',$id,['certificateType'=>$type,'signed'=>!empty($before[$signatureField])],['certificateType'=>$type,'signed'=>true]);return$this->enrollmentDocumentRecord($auth,$id);}
  public function guardianCertificateAlerts(array $auth):array{$stmt=$this->db->pdo()->prepare('SELECT a.id,a.certificate_type,a.title,a.message,a.is_read,a.created_at,c.first_name,c.last_name,c.child_unique_id FROM guardian_certificate_alerts a INNER JOIN children c ON c.id=a.child_id WHERE a.guardian_user_id=:guardian ORDER BY a.is_read ASC,a.created_at DESC');$stmt->execute(['guardian'=>$auth['id']]);return$stmt->fetchAll();}
  public function readGuardianCertificateAlert(array $auth,string $id):array{$stmt=$this->db->pdo()->prepare('SELECT * FROM guardian_certificate_alerts WHERE id=:id AND guardian_user_id=:guardian');$stmt->execute(['id'=>$id,'guardian'=>$auth['id']]);$before=$stmt->fetch()?:throw new RuntimeException('Certificate alert not found.');$this->db->pdo()->prepare('UPDATE guardian_certificate_alerts SET is_read=1,read_at=COALESCE(read_at,NOW()) WHERE id=:id AND guardian_user_id=:guardian')->execute(['id'=>$id,'guardian'=>$auth['id']]);$stmt->execute(['id'=>$id,'guardian'=>$auth['id']]);$after=$stmt->fetch();$this->audit->record($auth['id'],'READ','guardian_certificate_alert',$id,['is_read'=>(bool)$before['is_read']],['is_read'=>true]);return$after;}
  public function subjects(array $auth):array{$school=($auth['assigned_scope_type']??null)==='school'?$auth['assigned_scope_id']:null;$sql='SELECT subjects.* FROM subjects WHERE is_active=1';$params=[];if($school!==null){$sql.=' AND (school_id IS NULL OR school_id=:school)';$params['school']=$school;}$sql.=' ORDER BY subject_name';$stmt=$this->db->pdo()->prepare($sql);$stmt->execute($params);return$stmt->fetchAll();}
  public function classSubjects(array $auth,string $classId):array{$this->assertClass($auth,$classId);$stmt=$this->db->pdo()->prepare('SELECT s.* FROM subjects s INNER JOIN class_subjects cs ON cs.subject_id=s.id WHERE cs.class_id=:class ORDER BY s.subject_name');$stmt->execute(['class'=>$classId]);return $stmt->fetchAll();}
  public function createSubject(array $auth,array $data):array{if(empty($data['subjectName'])||empty($data['subjectCode']))throw new RuntimeException('subjectName and subjectCode are required.');$school=($auth['assigned_scope_type']??null)==='school'?$auth['assigned_scope_id']:($data['schoolId']??null);if($school!==null)$this->assertSchool($auth,$school);$id=Ulids::make();$this->db->pdo()->prepare('INSERT INTO subjects (id,subject_name,subject_code,school_id) VALUES (:id,:name,:code,:school)')->execute(['id'=>$id,'name'=>trim($data['subjectName']),'code'=>strtoupper(trim($data['subjectCode'])),'school'=>$school]);$r=$this->one($this->db->pdo(),'subjects',$id);$this->audit->record($auth['id'],'CREATE','subject',$id,null,$r);return $r;}
  public function replaceClassSubjects(array $auth,string $classId,array $subjectIds):array{$this->assertClass($auth,$classId);return $this->db->transaction(function(PDO $pdo)use($auth,$classId,$subjectIds){$before=$pdo->prepare('SELECT subject_id FROM class_subjects WHERE class_id=:id');$before->execute(['id'=>$classId]);$old=$before->fetchAll();$pdo->prepare('DELETE FROM class_subjects WHERE class_id=:id')->execute(['id'=>$classId]);$insert=$pdo->prepare('INSERT INTO class_subjects (id,class_id,subject_id) VALUES (:id,:class,:subject)');foreach(array_unique($subjectIds)as$subjectId){$insert->execute(['id'=>Ulids::make(),'class'=>$classId,'subject'=>$subjectId]);}$after=$pdo->prepare('SELECT s.* FROM subjects s INNER JOIN class_subjects cs ON cs.subject_id=s.id WHERE cs.class_id=:id');$after->execute(['id'=>$classId]);$value=$after->fetchAll();$this->audit->record($auth['id'],'UPDATE','class_subjects',$classId,['subjects'=>$old],['subjects'=>$value]);return $value;});}
  public function teachingAllocations(array $auth,array $query):array{$pdo=$this->db->pdo();$scope=$auth['assigned_scope_type']??null;$params=[];$where=' WHERE ta.is_active=1';if($auth['role']==='teacher'){$where.=' AND ta.teacher_id=:teacher';$params['teacher']=$auth['id'];}elseif($scope==='school'){$where.=' AND c.school_id=:school';$params['school']=$auth['assigned_scope_id'];}elseif($scope==='class'){$where.=' AND c.id=:class';$params['class']=$auth['assigned_scope_id'];}else{[$geo,$geoParams]=ScopeFilter::byWard($auth,'s.ward_id');$where.=$geo;$params=array_merge($params,$geoParams);}if(!empty($query['classId'])){$this->assertClass($auth,$query['classId']);$where.=' AND c.id=:requested_class';$params['requested_class']=$query['classId'];}$stmt=$pdo->prepare('SELECT ta.*,c.class_name,c.class_level,c.school_id,s.school_name,sub.subject_name,sub.subject_code,u.name AS teacher_name FROM teaching_allocations ta INNER JOIN school_classes c ON c.id=ta.class_id INNER JOIN schools s ON s.id=c.school_id INNER JOIN subjects sub ON sub.id=ta.subject_id INNER JOIN users u ON u.id=ta.teacher_id'.$where.' ORDER BY s.school_name,c.class_name,sub.subject_name');$stmt->execute($params);return$stmt->fetchAll();}
  public function saveTeachingAllocation(array $auth,array $data):array{foreach(['classId','subjectId','teacherId'] as$key)if(empty($data[$key]))throw new RuntimeException("{$key} is required.");$this->assertClass($auth,$data['classId']);$pdo=$this->db->pdo();$subject=$pdo->prepare('SELECT cs.subject_id FROM class_subjects cs WHERE cs.class_id=:class AND cs.subject_id=:subject');$subject->execute(['class'=>$data['classId'],'subject'=>$data['subjectId']]);if(!$subject->fetch())throw new RuntimeException('Assign the subject to the class before allocating a teacher.');$teacher=$pdo->prepare('SELECT id,role,is_active FROM users WHERE id=:id');$teacher->execute(['id'=>$data['teacherId']]);$teacherRecord=$teacher->fetch();if(!$teacherRecord||$teacherRecord['role']!=='teacher'||!(bool)$teacherRecord['is_active'])throw new RuntimeException('Select an active Teacher account.');$before=$pdo->prepare('SELECT * FROM teaching_allocations WHERE class_id=:class AND subject_id=:subject');$before->execute(['class'=>$data['classId'],'subject'=>$data['subjectId']]);$old=$before->fetch()?:null;$id=$old['id']??Ulids::make();$pdo->prepare('INSERT INTO teaching_allocations (id,class_id,subject_id,teacher_id,assigned_by,is_active) VALUES (:id,:class,:subject,:teacher,:by,1) ON DUPLICATE KEY UPDATE teacher_id=VALUES(teacher_id),assigned_by=VALUES(assigned_by),is_active=1')->execute(['id'=>$id,'class'=>$data['classId'],'subject'=>$data['subjectId'],'teacher'=>$data['teacherId'],'by'=>$auth['id']]);$after=$this->teachingAllocation($pdo,$id);$this->audit->record($auth['id'],$old?'UPDATE':'CREATE','teaching_allocation',$id,$old,$after);return$after;}
  public function removeTeachingAllocation(array $auth,string $id):void{$pdo=$this->db->pdo();$before=$this->teachingAllocation($pdo,$id);$this->assertClass($auth,$before['class_id']);$pdo->prepare('UPDATE teaching_allocations SET is_active=0 WHERE id=:id')->execute(['id'=>$id]);$this->audit->record($auth['id'],'DEACTIVATE','teaching_allocation',$id,$before,['is_active'=>false]);}
  public function createSession(array $auth,array $data):array{foreach(['sessionName','stateId','startDate','endDate']as$key){if(empty($data[$key]))throw new RuntimeException("{$key} is required.");}return $this->db->transaction(function(PDO $pdo)use($auth,$data){$id=Ulids::make();$pdo->prepare('INSERT INTO academic_sessions (id,session_name,state_id,start_date,end_date,status,created_by) VALUES (:id,:name,:state,:start,:end,:status,:by)')->execute(['id'=>$id,'name'=>$data['sessionName'],'state'=>$data['stateId'],'start'=>$data['startDate'],'end'=>$data['endDate'],'status'=>$data['status']??'upcoming','by'=>$auth['id']]);$terms=[['First Term',$data['startDate']],['Second Term',$data['startDate']],['Third Term',$data['startDate']]];$insert=$pdo->prepare('INSERT INTO terms (id,term_name,academic_year,start_date,end_date,status,session_id) VALUES (:id,:term,:year,:start,:end,:status,:session)');foreach($terms as[$term,$start]){$insert->execute(['id'=>Ulids::make(),'term'=>$term,'year'=>$data['sessionName'],'start'=>$start,'end'=>$data['endDate'],'status'=>$data['status']??'upcoming','session'=>$id]);}$r=$this->one($pdo,'academic_sessions',$id);$this->audit->record($auth['id'],'CREATE','academic_session',$id,null,$r);return $r;});}
  public function updateSession(array $auth,string $id,array $data):array{$before=$this->one($this->db->pdo(),'academic_sessions',$id);$map=['sessionName'=>'session_name','startDate'=>'start_date','endDate'=>'end_date','status'=>'status'];$sets=[];$params=['id'=>$id];foreach($map as$key=>$column){if(array_key_exists($key,$data)){$sets[]=$column.'=:'.$key;$params[$key]=$data[$key];}}if($sets===[])throw new RuntimeException('No supported session fields were supplied.');return $this->db->transaction(function(PDO $pdo)use($auth,$id,$data,$before,$sets,$params){$pdo->prepare('UPDATE academic_sessions SET '.implode(',',$sets).' WHERE id=:id')->execute($params);if(array_key_exists('status',$data))$pdo->prepare('UPDATE terms SET status=:status WHERE session_id=:id')->execute(['status'=>$data['status'],'id'=>$id]);$after=$this->one($pdo,'academic_sessions',$id);$this->audit->record($auth['id'],'UPDATE','academic_session',$id,$before,$after);return$after;});}
  public function enrollments(array $auth,array $query):array{$from='enrollments e INNER JOIN schools s ON s.id=e.school_id INNER JOIN children c ON c.id=e.child_id LEFT JOIN school_classes sc ON sc.id=e.class_id LEFT JOIN households h ON h.id=c.household_id LEFT JOIN wards w ON w.id=COALESCE(h.ward_id,c.ward_id) LEFT JOIN communities cm ON cm.id=h.community_id LEFT JOIN users au ON au.id=e.approved_by LEFT JOIN users tu ON tu.id=e.transitioned_by';return $this->scopedList($auth,$from,'s.ward_id','s.id','e.class_id','e.*,c.child_unique_id,c.attendance_qr_token,c.first_name,c.last_name,c.gender,c.date_of_birth,c.estimated_age,c.photo_url,c.guardian_phone,h.household_code,h.father_name,h.mother_name,h.phone_number AS household_phone,w.name AS ward_name,cm.name AS community_name,s.school_name,s.school_logo,sc.class_name,au.name AS approved_by_name,tu.name AS transitioned_by_name','e.enrollment_date DESC',$query);}
  public function createEnrollment(array $auth,array $data):array{foreach(['childId','schoolId','classLevel','enrollmentDate']as$key){if(empty($data[$key]))throw new RuntimeException("{$key} is required.");}$this->assertSchool($auth,$data['schoolId']);if(!empty($data['classId']))$this->assertClassForSchool($auth,$data['classId'],$data['schoolId']);$this->assertChildInSchoolScope($auth,$data['childId'],$data['schoolId']);$stmt=$this->db->pdo()->prepare("SELECT id FROM enrollments WHERE child_id=:child AND enrollment_status='active'");$stmt->execute(['child'=>$data['childId']]);if($stmt->fetch())throw new RuntimeException('Child already has an active enrollment.');$id=Ulids::make();$this->db->pdo()->prepare('INSERT INTO enrollments (id,child_id,school_id,class_id,class_level,enrollment_date) VALUES (:id,:child,:school,:class,:level,:date)')->execute(['id'=>$id,'child'=>$data['childId'],'school'=>$data['schoolId'],'class'=>$data['classId']??null,'level'=>$data['classLevel'],'date'=>$data['enrollmentDate']]);$r=$this->one($this->db->pdo(),'enrollments',$id);$this->audit->record($auth['id'],'CREATE','enrollment',$id,null,$r);return $r;}
  public function approveEnrollment(array $auth,string $id):array{$record=$this->one($this->db->pdo(),'enrollments',$id);$this->assertSchool($auth,$record['school_id']);$this->db->pdo()->prepare('UPDATE enrollments SET approved_by=:user,approved_at=CURRENT_TIMESTAMP WHERE id=:id')->execute(['user'=>$auth['id'],'id'=>$id]);$after=$this->one($this->db->pdo(),'enrollments',$id);$this->audit->record($auth['id'],'APPROVE','enrollment',$id,$record,$after);return $after;}
  public function transitionEnrollment(array $auth,string $id,array $data):array{$before=$this->one($this->db->pdo(),'enrollments',$id);$this->assertSchool($auth,$before['school_id']);if($before['enrollment_status']!=='active')throw new RuntimeException('Only an active enrollment can be transferred or withdrawn.');$status=(string)($data['status']??'');if(!in_array($status,['transferred','withdrawn'],true))throw new RuntimeException('Choose transfer or withdrawal.');$reason=trim((string)($data['reason']??''));$date=(string)($data['effectiveDate']??'');$receiving=trim((string)($data['receivingSchoolName']??''));$receivingId=trim((string)($data['receivingSchoolId']??''));if($reason===''||!preg_match('/^\d{4}-\d{2}-\d{2}$/',$date))throw new RuntimeException('Provide a transition reason and effective date.');if($status==='transferred'&&$receivingId!==''){$dest=$this->registeredTransferDestination($auth,$receivingId);$receiving=$dest['school_name'];}if($status==='transferred'&&$receiving==='')throw new RuntimeException('Select a registered receiving school or record the unlisted school name for a transfer certificate.');return $this->db->transaction(function(PDO $pdo)use($auth,$id,$status,$reason,$date,$receiving,$receivingId,$before){$pdo->prepare('UPDATE enrollments SET enrollment_status=:status,transition_reason=:reason,transition_effective_date=:date,receiving_school_name=:receiving,receiving_school_id=:receivingId,transitioned_by=:actor,transitioned_at=CURRENT_TIMESTAMP WHERE id=:id')->execute(['status'=>$status,'reason'=>$reason,'date'=>$date,'receiving'=>$status==='transferred'?$receiving:null,'receivingId'=>$status==='transferred'&&$receivingId!==''?$receivingId:null,'actor'=>$auth['id'],'id'=>$id]);$after=$this->one($pdo,'enrollments',$id);$this->createGuardianCertificateAlert($pdo,$auth,$after,$status);$this->audit->record($auth['id'],strtoupper($status),'enrollment',$id,$before,$after);return$this->enrollmentDocumentRecord($auth,$id);});}
  public function outputEnrollmentDocument(array $auth,string $id,string $type):never{$record=$this->enrollmentDocumentRecord($auth,$id);if($type==='transfer'&&$record['enrollment_status']!=='transferred')throw new RuntimeException('A transfer certificate is available only after a recorded transfer.');if($type==='withdrawal'&&$record['enrollment_status']!=='withdrawn')throw new RuntimeException('A withdrawal certificate is available only after a recorded withdrawal.');$signature=$type==='enrollment'?($record['approved_signature_data']??null):($record['transition_signature_data']??null);if($signature){$this->renderSignedEnrollmentPdf($record,$type,(string)$signature);}$this->renderEnrollmentPdf($record,$type);}
  public function attendance(array $auth, array $query): array {
    $from = 'attendance a INNER JOIN schools s ON s.id=a.school_id INNER JOIN children c ON c.id=a.child_id LEFT JOIN school_classes sc ON sc.id=a.class_id LEFT JOIN users u ON u.id=a.recorded_by';
    [$scope, $params] = $this->scopeForEducation($auth, 's.ward_id', 's.id', 'a.class_id');
    $where = ' WHERE 1=1' . $scope;

    if (!empty($query['date'])) {
        $where .= ' AND a.date = :f_date';
        $params['f_date'] = $query['date'];
    }
    if (!empty($query['class_id']) || !empty($query['classId'])) {
        $where .= ' AND a.class_id = :f_class';
        $params['f_class'] = $query['class_id'] ?? $query['classId'];
    }
    if (!empty($query['school_id']) || !empty($query['schoolId'])) {
        $where .= ' AND a.school_id = :f_school';
        $params['f_school'] = $query['school_id'] ?? $query['schoolId'];
    }
    if (!empty($query['attendance_status']) || !empty($query['status'])) {
        $where .= ' AND a.attendance_status = :f_status';
        $params['f_status'] = $query['attendance_status'] ?? $query['status'];
    }
    if (!empty($query['search'])) {
        $where .= ' AND (c.first_name LIKE :f_q OR c.last_name LIKE :f_q OR c.child_unique_id LIKE :f_q)';
        $params['f_q'] = '%' . trim((string)$query['search']) . '%';
    }

    $page = max(1, (int)($query['page'] ?? 1));
    $limit = min(500, max(1, (int)($query['limit'] ?? 50)));
    $offset = ($page - 1) * $limit;

    $pdo = $this->db->pdo();
    $count = $pdo->prepare('SELECT COUNT(*) FROM ' . $from . $where);
    $count->execute($params);
    $total = (int)$count->fetchColumn();

    $select = 'a.*, c.child_unique_id, c.first_name, c.last_name, c.gender, c.photo_url, c.guardian_phone, s.school_name, sc.class_name, sc.class_level, u.name AS recorded_by_name';
    $stmt = $pdo->prepare('SELECT ' . $select . ' FROM ' . $from . $where . ' ORDER BY a.date DESC, sc.class_name ASC, c.last_name ASC LIMIT :limit OFFSET :offset');
    foreach ($params as $k => $v) $stmt->bindValue(':' . $k, $v);
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();

    return ['data' => $stmt->fetchAll(), 'page' => $page, 'limit' => $limit, 'total' => $total];
  }

  public function recordAttendance(array $auth,array $data):array{
    foreach(['childId','schoolId','date']as$key){if(empty($data[$key]))throw new RuntimeException("{$key} is required.");}
    $this->assertSchool($auth,$data['schoolId']);
    if(!empty($data['classId']))$this->assertClassForSchool($auth,$data['classId'],$data['schoolId']);
    if(($auth['assigned_scope_type']??null)==='class'&&empty($data['classId']))throw new RuntimeException('A class is required for class-scoped attendance.');
    $this->assertChildInSchoolScope($auth,$data['childId'],$data['schoolId']);
    $pdo=$this->db->pdo();
    $lookup=$pdo->prepare('SELECT id FROM attendance WHERE child_id=:child AND date=:date');
    $lookup->execute(['child'=>$data['childId'],'date'=>$data['date']]);
    $id=$lookup->fetchColumn()?:Ulids::make();
    $notes = !empty($data['notes']) ? mb_substr(trim((string)$data['notes']), 0, 255) : null;
    $pdo->prepare('INSERT INTO attendance (id,child_id,school_id,class_id,date,attendance_status,notes,scanned_by,recorded_by) VALUES (:id,:child,:school,:class,:date,:status,:notes,:scanner,:recorder) ON DUPLICATE KEY UPDATE school_id=VALUES(school_id),class_id=VALUES(class_id),attendance_status=VALUES(attendance_status),notes=VALUES(notes),scanned_by=VALUES(scanned_by),recorded_by=VALUES(recorded_by)')->execute([
      'id'=>$id,
      'child'=>$data['childId'],
      'school'=>$data['schoolId'],
      'class'=>$data['classId']??null,
      'date'=>$data['date'],
      'status'=>$data['attendanceStatus']??'present',
      'notes'=>$notes,
      'scanner'=>$data['scannedBy']??null,
      'recorder'=>$auth['id']
    ]);
    $r=$this->one($pdo,'attendance',$id);
    $this->audit->record($auth['id'],'UPSERT','attendance',$id,null,$r);
    return $r;
  }

  public function batchRecordAttendance(array $auth, array $data): array {
    $schoolId = (string)($data['schoolId'] ?? '');
    $classId = (string)($data['classId'] ?? '');
    $date = (string)($data['date'] ?? date('Y-m-d'));
    $records = (array)($data['records'] ?? []);
    if (!$schoolId || !$date) {
        throw new RuntimeException('School ID and Date are required.');
    }
    $this->assertSchool($auth, $schoolId);
    if ($classId !== '') {
        $this->assertClassForSchool($auth, $classId, $schoolId);
    }
    if (empty($records)) {
        throw new RuntimeException('No attendance records provided in batch.');
    }

    $pdo = $this->db->pdo();
    $savedCount = 0;
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare(
            'INSERT INTO attendance (id, child_id, school_id, class_id, date, attendance_status, notes, recorded_by)
             VALUES (:id, :child, :school, :class, :date, :status, :notes, :user)
             ON DUPLICATE KEY UPDATE
                school_id = VALUES(school_id),
                class_id = VALUES(class_id),
                attendance_status = VALUES(attendance_status),
                notes = VALUES(notes),
                recorded_by = VALUES(recorded_by)'
        );

        foreach ($records as $row) {
            $childId = (string)($row['childId'] ?? '');
            if (!$childId) continue;
            $rawStatus = (string)($row['attendanceStatus'] ?? $row['status'] ?? 'present');
            $status = in_array($rawStatus, ['present', 'absent', 'late', 'excused'], true) ? $rawStatus : 'present';
            $notes = !empty($row['notes']) ? mb_substr(trim((string)$row['notes']), 0, 255) : null;
            $id = Ulids::make();

            $stmt->execute([
                'id' => $id,
                'child' => $childId,
                'school' => $schoolId,
                'class' => $classId !== '' ? $classId : null,
                'date' => $date,
                'status' => $status,
                'notes' => $notes,
                'user' => $auth['id'],
            ]);
            $savedCount++;
        }
        $pdo->commit();
    } catch (\Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    $this->audit->record($auth['id'], 'BATCH_UPSERT', 'attendance', $classId ?: $schoolId, null, [
        'date' => $date,
        'schoolId' => $schoolId,
        'classId' => $classId,
        'savedCount' => $savedCount
    ]);

    return [
        'savedCount' => $savedCount,
        'date' => $date,
        'schoolId' => $schoolId,
        'classId' => $classId
    ];
  }

  public function scanAttendance(array $auth, array $data): array {
    $raw = trim((string)($data['qrToken'] ?? $data['token'] ?? ''));
    if (str_starts_with($raw, 'AM2050:')) {
      $token = substr($raw, 7);
    } else {
      $token = $raw;
    }
    if ($token === '') {
      throw new RuntimeException('QR code token is empty.');
    }

    $pdo = $this->db->pdo();
    $childStmt = $pdo->prepare(
      'SELECT id, child_unique_id, first_name, last_name, photo_url, gender 
       FROM children 
       WHERE attendance_qr_token = :t1 OR child_unique_id = :t2 OR id = :t3 
       LIMIT 1'
    );
    $childStmt->execute(['t1' => $token, 't2' => $token, 't3' => $token]);
    $child = $childStmt->fetch();
    if (!$child) {
      $childStmt->execute(['t1' => $raw, 't2' => $raw, 't3' => $raw]);
      $child = $childStmt->fetch();
    }
    if (!$child) {
      throw new RuntimeException("This QR code ({$raw}) does not match an active AM2050 child record.");
    }
    $childId = $child['id'];

    $placement = $pdo->prepare(
      "SELECT e.school_id, e.class_id, s.school_name, sc.class_name 
       FROM enrollments e 
       INNER JOIN schools s ON s.id = e.school_id 
       LEFT JOIN school_classes sc ON sc.id = e.class_id 
       WHERE e.child_id = :child AND e.enrollment_status = 'active' 
       ORDER BY e.enrollment_date DESC LIMIT 1"
    );
    $placement->execute(['child' => $childId]);
    $enrollment = $placement->fetch();
    if (!$enrollment) {
      throw new RuntimeException("Child {$child['first_name']} {$child['last_name']} has no active school enrollment.");
    }

    if (!empty($data['schoolId']) && (string)$data['schoolId'] !== $enrollment['school_id']) {
      throw new RuntimeException('The scanned child is not enrolled in the selected school.');
    }

    $res = $this->recordAttendance($auth, [
      'childId' => $childId,
      'schoolId' => $enrollment['school_id'],
      'classId' => $enrollment['class_id'],
      'date' => $data['date'] ?? date('Y-m-d'),
      'attendanceStatus' => $data['attendanceStatus'] ?? 'present',
      'notes' => $data['notes'] ?? 'QR Verified Roll-Call',
      'scannedBy' => $auth['id']
    ]);

    $res['child'] = [
      'id' => $child['id'],
      'child_unique_id' => $child['child_unique_id'],
      'name' => trim($child['first_name'] . ' ' . $child['last_name']),
      'first_name' => $child['first_name'],
      'last_name' => $child['last_name'],
      'photo_url' => $child['photo_url'],
      'gender' => $child['gender'],
      'school_name' => $enrollment['school_name'],
      'class_name' => $enrollment['class_name'],
    ];

    return $res;
  }

  public function attendanceMatrix(array $auth, array $query): array {
    $classId = (string)($query['class_id'] ?? $query['classId'] ?? '');
    if (!$classId) {
        throw new RuntimeException('Class ID is required for attendance register.');
    }
    $this->assertClass($auth, $classId);

    $granularity = strtolower((string)($query['granularity'] ?? 'month'));
    $pdo = $this->db->pdo();

    $classStmt = $pdo->prepare(
        'SELECT sc.*, s.school_name, s.ward_id, u.name AS teacher_name
         FROM school_classes sc
         INNER JOIN schools s ON s.id = sc.school_id
         LEFT JOIN users u ON u.id = sc.teacher_id
         WHERE sc.id = :id'
    );
    $classStmt->execute(['id' => $classId]);
    $classInfo = $classStmt->fetch();
    if (!$classInfo) {
        throw new RuntimeException('Class not found.');
    }

    $schoolDays = [];
    $periodLabel = '';
    $startDate = '';
    $endDate = '';

    if ($granularity === 'day') {
        $date = (string)($query['date'] ?? date('Y-m-d'));
        $startDate = $date;
        $endDate = $date;
        $schoolDays = [$date];
        $periodLabel = date('l, d F Y', strtotime($date));
    } elseif ($granularity === 'week') {
        $refDate = (string)($query['date'] ?? $query['week_start'] ?? date('Y-m-d'));
        $ts = strtotime($refDate);
        $mon = date('Y-m-d', strtotime('monday this week', $ts));
        $fri = date('Y-m-d', strtotime('friday this week', $ts));
        $startDate = $mon;
        $endDate = $fri;
        for ($i = 0; $i < 5; $i++) {
            $schoolDays[] = date('Y-m-d', strtotime("{$mon} + {$i} days"));
        }
        $periodLabel = 'Week ' . date('W', $ts) . ' (' . date('d M', strtotime($mon)) . ' – ' . date('d M Y', strtotime($fri)) . ')';
    } elseif ($granularity === 'term') {
        $termName = (string)($query['term'] ?? 'First Term');
        $academicYear = (string)($query['academic_year'] ?? '2025/2026');
        $tStmt = $pdo->prepare('SELECT * FROM terms WHERE term_name = :tname AND academic_year = :ayear LIMIT 1');
        $tStmt->execute(['tname' => $termName, 'ayear' => $academicYear]);
        $termRow = $tStmt->fetch();
        if ($termRow) {
            $startDate = $termRow['start_date'];
            $endDate = $termRow['end_date'];
        } else {
            $startDate = '2025-09-15';
            $endDate = '2025-12-19';
        }
        // Fetch all distinct recorded attendance dates in this class during the term
        $distinctDatesStmt = $pdo->prepare('SELECT DISTINCT date FROM attendance WHERE class_id = :cid AND date BETWEEN :start AND :end ORDER BY date ASC');
        $distinctDatesStmt->execute(['cid' => $classId, 'start' => $startDate, 'end' => $endDate]);
        $recDates = $distinctDatesStmt->fetchAll(PDO::FETCH_COLUMN);
        $schoolDays = !empty($recDates) ? $recDates : [$startDate];
        $periodLabel = "{$termName} {$academicYear} Register";
    } elseif ($granularity === 'year' || $granularity === 'session') {
        $academicYear = (string)($query['academic_year'] ?? '2025/2026');
        $startDate = '2025-09-01';
        $endDate = '2026-07-31';
        $distinctDatesStmt = $pdo->prepare('SELECT DISTINCT date FROM attendance WHERE class_id = :cid AND date BETWEEN :start AND :end ORDER BY date ASC');
        $distinctDatesStmt->execute(['cid' => $classId, 'start' => $startDate, 'end' => $endDate]);
        $recDates = $distinctDatesStmt->fetchAll(PDO::FETCH_COLUMN);
        $schoolDays = !empty($recDates) ? $recDates : [$startDate];
        $periodLabel = "Academic Session {$academicYear} Register";
    } else {
        // Default: month
        $granularity = 'month';
        $month = (string)($query['month'] ?? date('Y-m'));
        if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
            $month = date('Y-m');
        }
        $startDate = "{$month}-01";
        $daysInMonth = (int)date('t', strtotime($startDate));
        $endDate = date('Y-m-d', strtotime("{$startDate} + " . ($daysInMonth - 1) . " days"));
        for ($i = 1; $i <= $daysInMonth; $i++) {
            $dayStr = sprintf('%s-%02d', $month, $i);
            $w = (int)date('w', strtotime($dayStr));
            if ($w >= 1 && $w <= 5) {
                $schoolDays[] = $dayStr;
            }
        }
        $periodLabel = date('F Y', strtotime($startDate));
    }

    $enrStmt = $pdo->prepare(
        "SELECT e.id AS enrollment_id, c.id AS child_id, c.child_unique_id, c.first_name, c.last_name, c.gender, c.photo_url, c.attendance_qr_token
         FROM enrollments e
         INNER JOIN children c ON c.id = e.child_id
         WHERE e.class_id = :class_id AND e.enrollment_status = 'active'
         ORDER BY c.gender ASC, c.last_name ASC, c.first_name ASC"
    );
    $enrStmt->execute(['class_id' => $classId]);
    $students = $enrStmt->fetchAll();

    $attStmt = $pdo->prepare(
        'SELECT a.child_id, a.date, a.attendance_status, a.notes, a.created_at, u.name AS recorded_by_name
         FROM attendance a
         LEFT JOIN users u ON u.id = a.recorded_by
         WHERE a.class_id = :class_id AND a.date BETWEEN :start AND :end'
    );
    $attStmt->execute(['class_id' => $classId, 'start' => $startDate, 'end' => $endDate]);
    $attRows = $attStmt->fetchAll();

    $attMap = [];
    foreach ($attRows as $row) {
        $cid = $row['child_id'];
        $d = $row['date'];
        $attMap[$cid][$d] = [
            'status' => $row['attendance_status'],
            'notes' => $row['notes'],
            'scannedAt' => $row['created_at'],
            'recordedByName' => $row['recorded_by_name'],
        ];
        // Ensure day is in schoolDays if attendance was recorded on that day
        if (!in_array($d, $schoolDays, true)) {
            $schoolDays[] = $d;
        }
    }
    sort($schoolDays);

    $matrixRows = [];
    foreach ($students as $stu) {
        $cid = $stu['child_id'];
        $daysData = [];
        $present = 0; $absent = 0; $late = 0; $excused = 0;
        foreach ($schoolDays as $day) {
            $rec = $attMap[$cid][$day] ?? null;
            if ($rec) {
                $st = $rec['status'];
                $daysData[$day] = [
                    'status' => $st,
                    'notes' => $rec['notes'],
                    'scannedAt' => $rec['scannedAt'] ?? null,
                    'recordedByName' => $rec['recordedByName'] ?? null,
                ];
                if ($st === 'present') $present++;
                elseif ($st === 'late') $late++;
                elseif ($st === 'absent') $absent++;
                elseif ($st === 'excused') $excused++;
            } else {
                $daysData[$day] = null;
            }
        }
        $totalRecorded = $present + $late + $absent + $excused;
        $rate = $totalRecorded > 0 ? round((($present + $late) / $totalRecorded) * 100, 1) : 100.0;

        $matrixRows[] = [
            'student' => $stu,
            'attendance' => $daysData,
            'summary' => [
                'present' => $present,
                'late' => $late,
                'absent' => $absent,
                'excused' => $excused,
                'totalRecorded' => $totalRecorded,
                'attendanceRate' => $rate,
                'isChronic' => ($totalRecorded >= 5 && $rate < 75.0) || $absent >= 4
            ]
        ];
    }

    return [
        'class' => $classInfo,
        'granularity' => $granularity,
        'periodLabel' => $periodLabel,
        'startDate' => $startDate,
        'endDate' => $endDate,
        'schoolDays' => $schoolDays,
        'totalSchoolDays' => count($schoolDays),
        'students' => $matrixRows
    ];
  }

  public function attendanceStats(array $auth, array $query): array {
    $schoolId = (string)($query['school_id'] ?? $query['schoolId'] ?? (($auth['assigned_scope_type'] ?? '') === 'school' ? $auth['assigned_scope_id'] : ''));
    $classId = (string)($query['class_id'] ?? $query['classId'] ?? '');
    $date = (string)($query['date'] ?? date('Y-m-d'));
    $pdo = $this->db->pdo();

    $whereClass = '';
    $params = ['date' => $date];
    if ($classId !== '') {
        $whereClass = ' AND a.class_id = :class_id';
        $params['class_id'] = $classId;
    } elseif ($schoolId !== '') {
        $whereClass = ' AND a.school_id = :school_id';
        $params['school_id'] = $schoolId;
    }

    $stmt = $pdo->prepare(
        "SELECT a.attendance_status, COUNT(*) as count
         FROM attendance a
         WHERE a.date = :date {$whereClass}
         GROUP BY a.attendance_status"
    );
    $stmt->execute($params);
    $counts = ['present' => 0, 'late' => 0, 'absent' => 0, 'excused' => 0];
    foreach ($stmt->fetchAll() as $row) {
        $counts[$row['attendance_status']] = (int)$row['count'];
    }
    $totalMarked = array_sum($counts);
    $rate = $totalMarked > 0 ? round((($counts['present'] + $counts['late']) / $totalMarked) * 100, 1) : 0;

    $enrWhere = '';
    $enrParams = [];
    if ($classId !== '') {
        $enrWhere = ' AND class_id = :class_id';
        $enrParams['class_id'] = $classId;
    } elseif ($schoolId !== '') {
        $enrWhere = ' AND school_id = :school_id';
        $enrParams['school_id'] = $schoolId;
    }
    $enrStmt = $pdo->prepare("SELECT COUNT(*) FROM enrollments WHERE enrollment_status = 'active' {$enrWhere}");
    $enrStmt->execute($enrParams);
    $totalEnrolled = (int)$enrStmt->fetchColumn();

    $genderStmt = $pdo->prepare(
        "SELECT c.gender, a.attendance_status, COUNT(*) as count
         FROM attendance a
         INNER JOIN children c ON c.id = a.child_id
         WHERE a.date = :date {$whereClass}
         GROUP BY c.gender, a.attendance_status"
    );
    $genderStmt->execute($params);
    $genderStats = [
        'male' => ['present' => 0, 'absent' => 0, 'rate' => 100],
        'female' => ['present' => 0, 'absent' => 0, 'rate' => 100]
    ];
    foreach ($genderStmt->fetchAll() as $row) {
        $g = strtolower($row['gender'] ?? 'male');
        if (isset($genderStats[$g])) {
            if ($row['attendance_status'] === 'present' || $row['attendance_status'] === 'late') {
                $genderStats[$g]['present'] += (int)$row['count'];
            } else {
                $genderStats[$g]['absent'] += (int)$row['count'];
            }
        }
    }
    foreach (['male', 'female'] as $g) {
        $t = $genderStats[$g]['present'] + $genderStats[$g]['absent'];
        $genderStats[$g]['rate'] = $t > 0 ? round(($genderStats[$g]['present'] / $t) * 100, 1) : 100.0;
    }

    $fourteenDaysAgo = date('Y-m-d', strtotime('-14 days'));
    $chronicParams = ['since' => $fourteenDaysAgo];
    $chronicWhere = '';
    if ($classId !== '') {
        $chronicWhere = ' AND a.class_id = :class_id';
        $chronicParams['class_id'] = $classId;
    } elseif ($schoolId !== '') {
        $chronicWhere = ' AND a.school_id = :school_id';
        $chronicParams['school_id'] = $schoolId;
    }

    $chronicStmt = $pdo->prepare(
        "SELECT c.id, c.child_unique_id, c.first_name, c.last_name, c.gender, c.guardian_phone,
                sc.class_name, COUNT(CASE WHEN a.attendance_status = 'absent' THEN 1 END) as absent_count,
                COUNT(a.id) as total_days
         FROM attendance a
         INNER JOIN children c ON c.id = a.child_id
         LEFT JOIN school_classes sc ON sc.id = a.class_id
         WHERE a.date >= :since {$chronicWhere}
         GROUP BY c.id, c.child_unique_id, c.first_name, c.last_name, c.gender, c.guardian_phone, sc.class_name
         HAVING absent_count >= 2
         ORDER BY absent_count DESC
         LIMIT 20"
    );
    $chronicStmt->execute($chronicParams);
    $chronicStudents = $chronicStmt->fetchAll();

    return [
        'date' => $date,
        'totalEnrolled' => $totalEnrolled,
        'totalMarked' => $totalMarked,
        'rate' => $rate,
        'counts' => $counts,
        'gender' => $genderStats,
        'chronicWarnings' => $chronicStudents
    ];
  }
  private function enrollmentDocumentRecord(array $auth,string $id):array{$sql='SELECT e.*,c.child_unique_id,c.first_name,c.last_name,c.photo_url,c.guardian_phone,h.household_code,h.father_name,h.mother_name,h.phone_number AS household_phone,w.name AS ward_name,cm.name AS community_name,s.school_name,s.school_id AS school_registry_code,s.school_logo,sc.class_name,au.name AS approved_by_name,tu.name AS transitioned_by_name FROM enrollments e INNER JOIN schools s ON s.id=e.school_id INNER JOIN children c ON c.id=e.child_id LEFT JOIN school_classes sc ON sc.id=e.class_id LEFT JOIN households h ON h.id=c.household_id LEFT JOIN wards w ON w.id=COALESCE(h.ward_id,c.ward_id) LEFT JOIN communities cm ON cm.id=h.community_id LEFT JOIN users au ON au.id=e.approved_by LEFT JOIN users tu ON tu.id=e.transitioned_by WHERE e.id=:id';$stmt=$this->db->pdo()->prepare($sql);$stmt->execute(['id'=>$id]);$record=$stmt->fetch();if(!$record)throw new RuntimeException('Enrollment record not found.');$this->assertSchool($auth,$record['school_id']);return $record;}
  private function normaliseImageData(string $value,string $label='school logo'):?string{if($value==='')return null;if(str_starts_with($value,'http://')||str_starts_with($value,'https://'))return $value;if(!preg_match('#^data:image/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\s]+)$#',$value,$m))throw new RuntimeException('Use a PNG, JPEG, or WebP '.$label.'.');$binary=base64_decode(preg_replace('/\s+/','',$m[2]),true);if($binary===false||strlen($binary)>1500000||@getimagesizefromstring($binary)===false)throw new RuntimeException('Use a valid '.$label.' image no larger than 1.5 MB.');return'data:image/'.($m[1]==='jpg'?'jpeg':$m[1]).';base64,'.base64_encode($binary);}
  private function registeredTransferDestination(array $auth,string $id):array{$stmt=$this->db->pdo()->prepare('SELECT d.id,d.school_name FROM schools d INNER JOIN wards w ON w.id=d.ward_id WHERE d.id=:id AND d.is_active=1 AND w.lga_id=(SELECT w2.lga_id FROM schools s2 INNER JOIN wards w2 ON w2.id=s2.ward_id WHERE s2.id=:source)');$stmt->execute(['id'=>$id,'source'=>$auth['assigned_scope_id']]);return$stmt->fetch()?:throw new RuntimeException('The selected receiving school is not an active registered transfer destination in your LGA.');}
  private function createGuardianCertificateAlert(PDO $pdo,array $auth,array $enrollment,string $status):void{$type=$status==='transferred'?'transfer':'withdrawal';$child=$pdo->prepare('SELECT id,guardian_phone FROM children WHERE id=:id');$child->execute(['id'=>$enrollment['child_id']]);$child=$child->fetch();if(!$child||empty($child['guardian_phone']))return;$guardian=$pdo->prepare("SELECT id FROM users WHERE role='guardian' AND is_active=1 AND phone=:phone");$guardian->execute(['phone'=>$child['guardian_phone']]);$guardianId=$guardian->fetchColumn();if(!$guardianId)return;$title=$type==='transfer'?'School placement certificate available':'School placement update available';$message=$type==='transfer'?'A school transfer certificate is available for your linked child. Contact the school or AM2050 field team if you need support.':'A school placement withdrawal certificate is available for your linked child. Contact the school or AM2050 field team if you need support.';$pdo->prepare('INSERT INTO guardian_certificate_alerts(id,guardian_user_id,child_id,enrollment_id,certificate_type,title,message,created_by) VALUES(:id,:guardian,:child,:enrollment,:type,:title,:message,:actor) ON DUPLICATE KEY UPDATE title=VALUES(title),message=VALUES(message)')->execute(['id'=>Ulids::make(),'guardian'=>$guardianId,'child'=>$child['id'],'enrollment'=>$enrollment['id'],'type'=>$type,'title'=>$title,'message'=>$message,'actor'=>$auth['id']]);$this->audit->record($auth['id'],'CREATE','guardian_certificate_alert',$enrollment['id'],null,['certificateType'=>$type,'guardianNotified'=>true]);}
  private function renderEnrollmentPdf(array $record,string $type):never{$title=match($type){'transfer'=>'Transfer Certificate','withdrawal'=>'Withdrawal Certificate',default=>'Formal School Enrollment Record'};$child=$record['first_name'].' '.$record['last_name'];$approval=$record['approved_by_name']?($record['approved_by_name'].' · '.($record['approved_at']?date('d F Y',strtotime($record['approved_at'])):'Approval date not recorded')):'Approval pending';$transition=$type==='transfer'?'This certificate confirms that the learner was formally transferred from '.$record['school_name'].' to '.($record['receiving_school_name']?:'the recorded receiving school').'.':($type==='withdrawal'?'This certificate confirms that the learner was formally withdrawn from '.$record['school_name'].'.':'This record confirms the learner’s authorised school placement.');$photo=$record['photo_url']?'<img class="photo" src="'.$this->esc($record['photo_url']).'">':'<div class="photo blank">CHILD<br>PHOTO</div>';$logo=$record['school_logo']?'<img class="school-logo" src="'.$this->esc($record['school_logo']).'">':'<div class="school-logo mark">AM<br>2050</div>';$extra=$type==='enrollment'?'<tr><td>Headmaster approval</td><td>'.$this->esc($approval).'</td></tr>':'<tr><td>Effective transition date</td><td>'.$this->esc($record['transition_effective_date']?date('d F Y',strtotime($record['transition_effective_date'])):'Not recorded').'</td></tr><tr><td>Reason / context</td><td>'.$this->esc($record['transition_reason']?:'Not recorded').'</td></tr><tr><td>Authorised by</td><td>'.$this->esc($record['transitioned_by_name']?:'Not recorded').'</td></tr>'.($type==='transfer'?'<tr><td>Receiving school</td><td>'.$this->esc($record['receiving_school_name']?:'Not recorded').'</td></tr>':'');$html='<!doctype html><html><head><style>@page{size:A4;margin:10mm}body{font-family:DejaVu Sans,sans-serif;color:#123148;font-size:10px}.paper{border:2px solid #123148;min-height:273mm}.head{padding:14px 16px;border-bottom:5px solid #167a4c;position:relative}.brand{font-size:24px;font-weight:bold;letter-spacing:2px}.strap,.label{font-size:8px;color:#167a4c;font-weight:bold;letter-spacing:1px;text-transform:uppercase}.school-logo{position:absolute;right:16px;top:14px;width:28mm;height:28mm;object-fit:contain;border:1px solid #c7d2cc}.mark{display:block;text-align:center;padding-top:8mm;font-weight:bold}.photo{float:right;width:28mm;height:35mm;margin:0 0 4mm 8mm;object-fit:cover;border:1px solid #718592}.blank{display:block;text-align:center;padding-top:12mm;font-size:8px;color:#718592}.reference{display:table;width:100%;border-bottom:1px solid #c7d2cc}.reference div{display:table-cell;padding:9px 12px;border-right:1px solid #c7d2cc}.reference div:last-child{border:0}.body{padding:14px 16px}.identity{min-height:39mm;border-bottom:1px solid #d8e0da;padding-bottom:10px}.identity h1{font-size:24px;margin:5px 0}.notice{clear:both;margin:10px 0;padding:9px 10px;border-left:4px solid #c88b25;background:#fbf2df;line-height:1.5}.section{margin-top:11px;border:1px solid #bccbc1}.section h2{margin:0;padding:7px 10px;background:#e7f4eb;border-bottom:1px solid #bccbc1;font-size:11px}.data{width:100%;border-collapse:collapse}.data td{width:50%;padding:8px 10px;border-right:1px solid #d6e0d8;border-bottom:1px solid #d6e0d8;vertical-align:top}.data tr:last-child td{border-bottom:0}.data td:last-child{border-right:0}.sig{display:table;width:100%;margin-top:28px}.sig div{display:table-cell;width:33%;padding-top:7px;border-top:1px solid #123148;font-size:8px;color:#617985}.foot{margin-top:18px;padding:8px 16px;border-top:1px solid #cfd9d2;background:#f5f7f4;font-size:7px;color:#617985;text-transform:uppercase}</style></head><body><div class="paper"><header class="head">'.$logo.'<div class="brand">AM2050</div><div class="strap">Arewa Mission 2050 · Official school record</div><h2>'.$this->esc($title).'</h2></header><div class="reference"><div><span class="label">Enrollment reference</span><br>'.$this->esc($record['id']).'</div><div><span class="label">School register</span><br>'.$this->esc($record['school_registry_code']).'</div><div><span class="label">Record condition</span><br>'.$this->esc(ucfirst($record['enrollment_status'])).'</div></div><div class="body"><div class="identity">'.$photo.'<span class="label">Enrolled learner</span><h1>'.$this->esc($child).'</h1><strong>'.$this->esc($record['child_unique_id']).'</strong><p>'.$this->esc($transition).'</p></div><div class="notice">This is a confidential AM2050 institutional document. It is derived from the authorised school enrollment record and should be retained within approved education support processes.</div><section class="section"><h2>Child and household information</h2><table class="data"><tr><td><span class="label">Household reference</span><br>'.$this->esc($record['household_code']?:'Not recorded').'</td><td><span class="label">Parent or guardian</span><br>'.$this->esc(trim(($record['father_name']??'').' / '.($record['mother_name']??''),' / ')).'</td></tr><tr><td><span class="label">Guardian contact</span><br>'.$this->esc($record['guardian_phone']?:($record['household_phone']?:'Not recorded')).'</td><td><span class="label">Ward / community</span><br>'.$this->esc(($record['ward_name']?:'Not recorded').' / '.($record['community_name']?:'Not recorded')).'</td></tr></table></section><section class="section"><h2>School placement and authorisation</h2><table class="data"><tr><td><span class="label">School</span><br>'.$this->esc($record['school_name']).'</td><td><span class="label">Class / level</span><br>'.$this->esc(($record['class_name']?:'Not recorded').' / '.$record['class_level']).'</td></tr><tr><td><span class="label">Enrollment date</span><br>'.$this->esc(date('d F Y',strtotime($record['enrollment_date']))).'</td><td><span class="label">Enrollment condition</span><br>'.$this->esc(ucfirst($record['enrollment_status'])).'</td></tr>'.$extra.'</table></section><div class="sig"><div>Headmaster signature / date</div><div>Parent or guardian signature / date</div><div>AM2050 verification / date</div></div></div><footer class="foot">AM2050 · Arewa Mission 2050 · Confidential '.strtoupper($this->esc($title)).'</footer></div></body></html>';$filename='am2050-'.($type==='enrollment'?'enrollment-record':$type.'-certificate').'-'.preg_replace('/[^A-Z0-9-]/','',strtoupper($record['child_unique_id'])).'.pdf';header('Content-Type: application/pdf');header('Content-Disposition: attachment; filename="'.$filename.'"');$pdf=new \Dompdf\Dompdf();$pdf->loadHtml($html);$pdf->setPaper('A4','portrait');$pdf->render();echo$pdf->output();exit;}
  private function scopedList(array $auth,string $from,string $wardColumn,string $schoolColumn,?string $classColumn,string $select,string $order,array $query):array{[$page,$limit,$offset]=[max(1,(int)($query['page']??1)),min(500,max(1,(int)($query['limit']??25))),0];$offset=($page-1)*$limit;[$scope,$params]=$this->scopeForEducation($auth,$wardColumn,$schoolColumn,$classColumn);$where=' WHERE 1=1'.$scope;$pdo=$this->db->pdo();$count=$pdo->prepare('SELECT COUNT(*) FROM '.$from.$where);$count->execute($params);$total=(int)$count->fetchColumn();$stmt=$pdo->prepare('SELECT '.$select.' FROM '.$from.$where.' ORDER BY '.$order.' LIMIT :limit OFFSET :offset');foreach($params as$k=>$v)$stmt->bindValue(':'.$k,$v);$stmt->bindValue(':limit',$limit,PDO::PARAM_INT);$stmt->bindValue(':offset',$offset,PDO::PARAM_INT);$stmt->execute();return['data'=>$stmt->fetchAll(),'page'=>$page,'limit'=>$limit,'total'=>$total];}
  private function one(PDO $pdo,string $table,string $id):array{$stmt=$pdo->prepare('SELECT * FROM '.$table.' WHERE id=:id');$stmt->execute(['id'=>$id]);return $stmt->fetch()?:throw new RuntimeException('Record not found.');}
  private function teachingAllocation(PDO $pdo,string $id):array{$stmt=$pdo->prepare('SELECT * FROM teaching_allocations WHERE id=:id');$stmt->execute(['id'=>$id]);return$stmt->fetch()?:throw new RuntimeException('Teaching allocation not found.');}
  private function assertWard(array $auth,string $ward):void{[$sql,$params]=ScopeFilter::byWard($auth,'id');if($sql==='')return;$params['id']=$ward;$stmt=$this->db->pdo()->prepare('SELECT id FROM wards WHERE id=:id'.$sql);$stmt->execute($params);if(!$stmt->fetch())throw new RuntimeException('Selected ward is outside your scope.');}
  private function assertCommunityForWard(array $auth,string $community,string $ward):void{$stmt=$this->db->pdo()->prepare('SELECT id FROM communities WHERE id=:community AND ward_id=:ward');$stmt->execute(['community'=>$community,'ward'=>$ward]);if(!$stmt->fetch())throw new RuntimeException('Choose an existing community within the selected ward.');$this->assertWard($auth,$ward);}
  private function scopeForEducation(array $auth,string $wardColumn,string $schoolColumn,?string $classColumn):array{$scope=$auth['assigned_scope_id']??null;return match($auth['assigned_scope_type']??null){'school'=>[" AND {$schoolColumn} = :scope_id",['scope_id'=>$scope]],'class'=>$classColumn!==null?[" AND {$classColumn} = :scope_id",['scope_id'=>$scope]]:[" AND {$schoolColumn} = (SELECT school_id FROM school_classes WHERE id = :scope_id)",['scope_id'=>$scope]],default=>ScopeFilter::byWard($auth,$wardColumn)};}
  private function assertSchool(array $auth,string $school):void{$stmt=$this->db->pdo()->prepare('SELECT ward_id FROM schools WHERE id=:id');$stmt->execute(['id'=>$school]);$ward=$stmt->fetchColumn();if(!$ward)throw new RuntimeException('School not found.');$scope=$auth['assigned_scope_id']??null;if(($auth['assigned_scope_type']??null)==='school'&&$scope!==$school)throw new RuntimeException('Selected school is outside your scope.');if(($auth['assigned_scope_type']??null)==='class'){$classSchool=$this->db->pdo()->prepare('SELECT school_id FROM school_classes WHERE id=:id');$classSchool->execute(['id'=>$scope]);if($classSchool->fetchColumn()!==$school)throw new RuntimeException('Selected school is outside your class scope.');}if(!in_array($auth['assigned_scope_type']??null,['school','class'],true))$this->assertWard($auth,$ward);}
  private function assertClassForSchool(array $auth,string $class,string $school):void{$stmt=$this->db->pdo()->prepare('SELECT school_id FROM school_classes WHERE id=:id');$stmt->execute(['id'=>$class]);$classSchool=$stmt->fetchColumn();if(!$classSchool)throw new RuntimeException('Class not found.');if($classSchool!==$school)throw new RuntimeException('Selected class does not belong to the selected school.');if(($auth['assigned_scope_type']??null)==='class'&&($auth['assigned_scope_id']??null)!==$class)throw new RuntimeException('Selected class is outside your scope.');}
  private function assertClass(array $auth,string $class):void{$stmt=$this->db->pdo()->prepare('SELECT school_id FROM school_classes WHERE id=:id');$stmt->execute(['id'=>$class]);$school=$stmt->fetchColumn();if(!$school)throw new RuntimeException('Class not found.');$this->assertSchool($auth,$school);if(($auth['assigned_scope_type']??null)==='class'&&($auth['assigned_scope_id']??null)!==$class)throw new RuntimeException('Selected class is outside your scope.');}
  private function assertChildInSchoolScope(array $auth,string $child,string $school):void{
    $stmt=$this->db->pdo()->prepare('SELECT c.id,c.almajiri_status,COALESCE(h.ward_id,c.ward_id) AS ward_id FROM children c LEFT JOIN households h ON h.id=c.household_id WHERE c.id=:id');
    $stmt->execute(['id'=>$child]);
    $childRow=$stmt->fetch();
    if(!$childRow)throw new RuntimeException('Child not found.');
    $childWard=$childRow['ward_id']??null;
    if(!$childWard)return;
    $schoolWardStmt=$this->db->pdo()->prepare('SELECT ward_id FROM schools WHERE id=:id');
    $schoolWardStmt->execute(['id'=>$school]);
    $schoolWard=$schoolWardStmt->fetchColumn();
    if(!$schoolWard||$schoolWard===$childWard)return;
    if(($childRow['almajiri_status']??'')==='almajiri'||in_array($auth['role']??'',['super_admin','program_admin'],true))return;
    $lgaStmt=$this->db->pdo()->prepare('SELECT w1.lga_id AS s_lga, w2.lga_id AS c_lga FROM wards w1, wards w2 WHERE w1.id=:sw AND w2.id=:cw');
    $lgaStmt->execute(['sw'=>$schoolWard,'cw'=>$childWard]);
    $lgas=$lgaStmt->fetch();
    if($lgas&&$lgas['s_lga']===$lgas['c_lga'])return;
    throw new RuntimeException('Selected child is outside the school operating area.');
  }
  private function assertUserRole(string $id,string $role):void{$stmt=$this->db->pdo()->prepare('SELECT id FROM users WHERE id=:id AND role=:role AND is_active=1');$stmt->execute(['id'=>$id,'role'=>$role]);if(!$stmt->fetchColumn())throw new RuntimeException('The selected active '.$role.' user does not exist.');}
  private function renderSignedEnrollmentPdf(array $record,string $type,string $signature):never{$title=match($type){'transfer'=>'Transfer Certificate','withdrawal'=>'Withdrawal Certificate',default=>'Formal School Enrollment Record'};$actor=$type==='enrollment'?($record['approved_by_name']??'Authorised Headmaster'):($record['transitioned_by_name']??'Authorised Headmaster');$purpose=$type==='transfer'?'This certificate confirms the learner’s recorded transfer to '.($record['receiving_school_name']?:'the receiving school').'.':($type==='withdrawal'?'This certificate confirms the learner’s recorded withdrawal from the school placement.':'This record confirms the learner’s approved school placement.');$photo=$record['photo_url']?'<img class="photo" src="'.$this->esc($record['photo_url']).'">':'<div class="photo blank">CHILD<br>PHOTO</div>';$logo=$record['school_logo']?'<img class="logo" src="'.$this->esc($record['school_logo']).'">':'<div class="logo mark">AM<br>2050</div>';$extra=$type==='transfer'?'<tr><td>Receiving school</td><td>'.$this->esc($record['receiving_school_name']?:'Not recorded').'</td></tr>':'';$html='<!doctype html><html><head><style>@page{size:A4;margin:10mm}body{font-family:DejaVu Sans,sans-serif;color:#123148;font-size:10px}.paper{border:2px solid #123148;min-height:273mm}.head{position:relative;padding:14px 16px;border-bottom:5px solid #167a4c}.brand{font-size:24px;font-weight:bold;letter-spacing:2px}.meta{font-size:8px;color:#167a4c;font-weight:bold;letter-spacing:1px;text-transform:uppercase}.logo{position:absolute;right:16px;top:14px;width:28mm;height:28mm;object-fit:contain;border:1px solid #c7d2cc}.mark{text-align:center;padding-top:8mm}.band{display:table;width:100%;border-bottom:1px solid #c7d2cc}.band div{display:table-cell;width:33%;padding:8px 12px;border-right:1px solid #c7d2cc}.band div:last-child{border:0}.body{padding:14px 16px}.photo{float:right;width:28mm;height:35mm;margin:0 0 5mm 8mm;object-fit:cover;border:1px solid #718592}.blank{text-align:center;padding-top:12mm;font-size:8px;color:#718592}.notice{clear:both;margin:10px 0;padding:9px;border-left:4px solid #c88b25;background:#fbf2df;line-height:1.5}.section{margin-top:10px;border:1px solid #bccbc1}.section h2{margin:0;padding:7px 10px;background:#e7f4eb;border-bottom:1px solid #bccbc1;font-size:11px}.data{width:100%;border-collapse:collapse}.data td{width:50%;padding:8px 10px;border-right:1px solid #d6e0d8;border-bottom:1px solid #d6e0d8;vertical-align:top}.data td:last-child{border-right:0}.data tr:last-child td{border-bottom:0}.signature{margin-top:23px;display:table;width:100%}.signature div{display:table-cell;width:33%;vertical-align:bottom;border-top:1px solid #123148;padding-top:5px;font-size:8px;color:#617985}.signature img{display:block;max-width:28mm;max-height:10mm;object-fit:contain;object-position:left;margin-bottom:3px}.foot{margin-top:18px;padding:8px 16px;border-top:1px solid #cfd9d2;background:#f5f7f4;font-size:7px;color:#617985;text-transform:uppercase}</style></head><body><div class="paper"><header class="head">'.$logo.'<div class="brand">AM2050</div><div class="meta">Arewa Mission 2050 · Official school record</div><h2>'.$this->esc($title).'</h2></header><div class="band"><div><span class="meta">Enrollment reference</span><br>'.$this->esc($record['id']).'</div><div><span class="meta">School register</span><br>'.$this->esc($record['school_registry_code']).'</div><div><span class="meta">Record condition</span><br>'.$this->esc(ucfirst($record['enrollment_status'])).'</div></div><div class="body">'.$photo.'<p class="meta">Enrolled learner</p><h1>'.$this->esc($record['first_name'].' '.$record['last_name']).'</h1><strong>'.$this->esc($record['child_unique_id']).'</strong><p>'.$this->esc($purpose).'</p><div class="notice">This is a confidential AM2050 institutional certificate. It should be retained within approved education support processes.</div><section class="section"><h2>Child and household information</h2><table class="data"><tr><td><span class="meta">Household reference</span><br>'.$this->esc($record['household_code']?:'Not recorded').'</td><td><span class="meta">Parent or guardian</span><br>'.$this->esc(trim(($record['father_name']??'').' / '.($record['mother_name']??''),' / ')).'</td></tr><tr><td><span class="meta">Guardian contact</span><br>'.$this->esc($record['guardian_phone']?:($record['household_phone']?:'Not recorded')).'</td><td><span class="meta">Ward / community</span><br>'.$this->esc(($record['ward_name']?:'Not recorded').' / '.($record['community_name']?:'Not recorded')).'</td></tr></table></section><section class="section"><h2>School placement and authorisation</h2><table class="data"><tr><td><span class="meta">School</span><br>'.$this->esc($record['school_name']).'</td><td><span class="meta">Class / level</span><br>'.$this->esc(($record['class_name']?:'Not recorded').' / '.$record['class_level']).'</td></tr><tr><td><span class="meta">Effective record date</span><br>'.$this->esc(date('d F Y',strtotime($type==='enrollment'?$record['enrollment_date']:($record['transition_effective_date']?:$record['enrollment_date'])))).'</td><td><span class="meta">Authorised by</span><br>'.$this->esc($actor).'</td></tr>'.$extra.'</table></section><div class="signature"><div><img src="'.$this->esc($signature).'">Digitally applied Headmaster signature / date</div><div>Parent or guardian signature / date</div><div>AM2050 verification / date</div></div></div><footer class="foot">AM2050 · Arewa Mission 2050 · Confidential '.strtoupper($this->esc($title)).'</footer></div></body></html>';$file='am2050-signed-'.($type==='enrollment'?'enrollment-record':$type.'-certificate').'-'.preg_replace('/[^A-Z0-9-]/','',strtoupper($record['child_unique_id'])).'.pdf';header('Content-Type: application/pdf');header('Content-Disposition: attachment; filename="'.$file.'"');$pdf=new \Dompdf\Dompdf();$pdf->loadHtml($html);$pdf->setPaper('A4','portrait');$pdf->render();echo$pdf->output();exit;}
  private function esc(string $value):string{return htmlspecialchars($value,ENT_QUOTES,'UTF-8');}
}
