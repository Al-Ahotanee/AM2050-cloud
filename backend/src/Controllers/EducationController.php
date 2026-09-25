<?php
declare(strict_types=1);
namespace AM2050\Controllers;

use AM2050\Core\Request;
use AM2050\Core\Response;
use AM2050\Middleware\AuthMiddleware;
use AM2050\Middleware\RoleMiddleware;
use AM2050\Services\EducationService;

final class EducationController {
    public function __construct(private readonly AuthMiddleware $auth, private readonly EducationService $service) {}
    private function actor(Request $request): array { return $this->auth->require($request); }
    private function paginated(Request $request, callable $callback): never { $this->actor($request); $result=$callback(); Response::paginate($result['data'],$result['page'],$result['limit'],$result['total']); }
    private function educationViewer(Request $request): array { $actor=$this->actor($request); RoleMiddleware::allow($actor,['super_admin','program_admin','lga_supervisor','ward_supervisor','headmaster','teacher']); return $actor; }
    private function schoolRegistryManager(Request $request): array { $actor=$this->actor($request); RoleMiddleware::allow($actor,['super_admin','program_admin']); return $actor; }
    private function schoolOperationsManager(Request $request): array { $actor=$this->actor($request); RoleMiddleware::allow($actor,['super_admin','program_admin','headmaster']); return $actor; }
    public function schools(Request $request): never { $this->paginated($request,fn()=>$this->service->schools($this->educationViewer($request),$request->query)); }
    public function createSchool(Request $request): never { $actor=$this->schoolRegistryManager($request); Response::success($this->service->createSchool($actor,$request->body()),201); }
    public function updateSchool(Request $request,array $params): never { $actor=$this->schoolRegistryManager($request); Response::success($this->service->updateSchool($actor,$params['id'],$request->body())); }
    public function updateSchoolLogo(Request $request,array $params): never { $actor=$this->schoolRegistryManager($request); Response::success($this->service->updateSchoolLogo($actor,$params['id'],$request->body())); }
    public function transferDestinations(Request $request): never { $actor=$this->schoolOperationsManager($request); Response::success($this->service->transferDestinations($actor,$request->query)); }
    public function classes(Request $request): never { $this->paginated($request,fn()=>$this->service->classes($this->educationViewer($request),$request->query)); }
    public function createClass(Request $request): never { $actor=$this->schoolOperationsManager($request); Response::success($this->service->createClass($actor,$request->body()),201); }
    public function updateClass(Request $request,array $params): never { $actor=$this->schoolOperationsManager($request); Response::success($this->service->updateClass($actor,$params['id'],$request->body())); }
    public function subjects(Request $request): never { $actor=$this->educationViewer($request); Response::success($this->service->subjects($actor)); }
    public function subjectsForClass(Request $request,array $params): never { $actor=$this->educationViewer($request); Response::success($this->service->classSubjects($actor,$params['id'])); }
    public function createSubject(Request $request): never { $actor=$this->schoolOperationsManager($request); Response::success($this->service->createSubject($actor,$request->body()),201); }
    public function classSubjects(Request $request,array $params): never { $actor=$this->schoolOperationsManager($request); Response::success($this->service->replaceClassSubjects($actor,$params['id'],$request->input('subjectIds',[]))); }
    public function teachingAllocations(Request $request): never { $actor=$this->educationViewer($request); Response::success($this->service->teachingAllocations($actor,$request->query)); }
    public function saveTeachingAllocation(Request $request): never { $actor=$this->schoolOperationsManager($request); Response::success($this->service->saveTeachingAllocation($actor,$request->body()),201); }
    public function removeTeachingAllocation(Request $request,array $params): never { $actor=$this->schoolOperationsManager($request); $this->service->removeTeachingAllocation($actor,$params['id']); Response::success(['removed'=>true]); }
    public function createSession(Request $request): never { $actor=$this->actor($request); RoleMiddleware::require($actor,'program_admin'); Response::success($this->service->createSession($actor,$request->body()),201); }
    public function updateSession(Request $request,array $params): never { $actor=$this->actor($request); RoleMiddleware::require($actor,'program_admin'); Response::success($this->service->updateSession($actor,$params['id'],$request->body())); }
    public function enrollments(Request $request): never { $this->paginated($request,fn()=>$this->service->enrollments($this->educationViewer($request),$request->query)); }
    public function createEnrollment(Request $request): never { $actor=$this->actor($request); RoleMiddleware::allow($actor,['super_admin','program_admin','lga_supervisor','ward_supervisor','headmaster','teacher']); Response::success($this->service->createEnrollment($actor,$request->body()),201); }
    public function approveEnrollment(Request $request,array $params): never { $actor=$this->actor($request); RoleMiddleware::require($actor,'headmaster',['mobilizer','almajiri_liaison','teacher','guardian']); Response::success($this->service->approveEnrollment($actor,$params['id'])); }
    public function transitionEnrollment(Request $request,array $params): never { $actor=$this->schoolOperationsManager($request); Response::success($this->service->transitionEnrollment($actor,$params['id'],$request->body())); }
    public function applyCertificateSignature(Request $request,array $params): never { $actor=$this->schoolOperationsManager($request); Response::success($this->service->applyCertificateSignature($actor,$params['id'],$request->body())); }
    public function ownCertificateSignature(Request $request): never { $actor=$this->actor($request); RoleMiddleware::allow($actor,['headmaster']); if (($request->method ?? 'GET') === 'PUT') Response::success($this->service->updateOwnCertificateSignature($actor,$request->body())); Response::success($this->service->ownCertificateSignature($actor)); }
    public function downloadEnrollmentDocument(Request $request,array $params): never { $actor=$this->educationViewer($request); $this->service->outputEnrollmentDocument($actor,$params['id'],'enrollment'); }
    public function downloadTransferCertificate(Request $request,array $params): never { $actor=$this->educationViewer($request); $this->service->outputEnrollmentDocument($actor,$params['id'],'transfer'); }
    public function downloadWithdrawalCertificate(Request $request,array $params): never { $actor=$this->educationViewer($request); $this->service->outputEnrollmentDocument($actor,$params['id'],'withdrawal'); }
    public function guardianCertificateAlerts(Request $request): never { $actor=$this->actor($request); RoleMiddleware::allow($actor,['guardian']); Response::success($this->service->guardianCertificateAlerts($actor)); }
    public function readGuardianCertificateAlert(Request $request,array $params): never { $actor=$this->actor($request); RoleMiddleware::allow($actor,['guardian']); Response::success($this->service->readGuardianCertificateAlert($actor,$params['id'])); }
    public function attendance(Request $request): never { $this->paginated($request,fn()=>$this->service->attendance($this->educationViewer($request),$request->query)); }
    public function recordAttendance(Request $request): never { $actor=$this->actor($request); RoleMiddleware::allow($actor,['headmaster','teacher','super_admin','program_admin']); Response::success($this->service->recordAttendance($actor,$request->body()),201); }
    public function batchRecordAttendance(Request $request): never { $actor=$this->actor($request); RoleMiddleware::allow($actor,['headmaster','teacher','super_admin','program_admin']); Response::success($this->service->batchRecordAttendance($actor,$request->body()),201); }
    public function scanAttendance(Request $request): never { $actor=$this->actor($request); RoleMiddleware::allow($actor,['headmaster','teacher','super_admin','program_admin']); Response::success($this->service->scanAttendance($actor,$request->body()),201); }
    public function attendanceMatrix(Request $request): never { $actor=$this->educationViewer($request); Response::success($this->service->attendanceMatrix($actor,$request->query)); }
    public function attendanceStats(Request $request): never { $actor=$this->educationViewer($request); Response::success($this->service->attendanceStats($actor,$request->query)); }
}
