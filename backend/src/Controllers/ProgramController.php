<?php
declare(strict_types=1);

namespace AM2050\Controllers;

use AM2050\Core\Request;
use AM2050\Core\Response;
use AM2050\Middleware\AuthMiddleware;
use AM2050\Middleware\RoleMiddleware;
use AM2050\Services\ProgramService;

final class ProgramController
{
    private const EDUCATION_ROLES = ['super_admin','program_admin','lga_supervisor','ward_supervisor','headmaster','teacher'];
    private const SCHOOL_RECORDING_ROLES = ['headmaster','teacher'];
    private const SUPERVISION_ROLES = ['super_admin','program_admin','lga_supervisor','ward_supervisor'];
    private const FIELD_ROLES = ['super_admin','program_admin','lga_supervisor','ward_supervisor','mobilizer','almajiri_liaison'];
    private const TSANGAYA_ROLES = ['super_admin','program_admin','lga_supervisor','ward_supervisor','almajiri_liaison'];

    public function __construct(private readonly AuthMiddleware $auth, private readonly ProgramService $service) {}
    private function actor(Request $request): array { return $this->auth->require($request); }
    private function allow(Request $request, array $roles): array { $actor = $this->actor($request); RoleMiddleware::allow($actor, $roles); return $actor; }
    private function paginated(Request $request, callable $callback): never { $this->actor($request); $data = $callback(); Response::paginate($data['data'], $data['page'], $data['limit'], $data['total']); }

    public function results(Request $request): never { $this->paginated($request, fn() => $this->service->listResults($this->allow($request, self::EDUCATION_ROLES), $request->query)); }
    public function result(Request $request): never { $actor = $this->allow($request, self::SCHOOL_RECORDING_ROLES); Response::success($this->service->results($actor, $request->body()), 201); }
    public function resultsBatch(Request $request): never { $actor = $this->allow($request, self::SCHOOL_RECORDING_ROLES); Response::success($this->service->resultsBatch($actor, $request->body()), 201); }
    public function submitResults(Request $request): never { $actor = $this->allow($request, self::SCHOOL_RECORDING_ROLES); Response::success($this->service->submitResults($actor, $request->body())); }
    public function publishResults(Request $request): never { $actor = $this->allow($request, ['headmaster', 'super_admin', 'program_admin']); Response::success($this->service->publishResults($actor, $request->body())); }
    public function unpublishResults(Request $request): never { $actor = $this->allow($request, ['headmaster', 'super_admin', 'program_admin']); Response::success($this->service->unpublishResults($actor, $request->body())); }
    public function classReportSheets(Request $request, array $params): never { $actor = $this->allow($request, self::EDUCATION_ROLES); Response::success($this->service->classReportSheets($actor, $params['id'], $request->query)); }
    public function enrollmentReportSheet(Request $request, array $params): never { $actor = $this->allow($request, self::EDUCATION_ROLES); Response::success($this->service->enrollmentReportSheet($actor, $params['id'], $request->query)); }
    public function behaviors(Request $request): never { $this->paginated($request, fn() => $this->service->listBehavior($this->allow($request, self::EDUCATION_ROLES), $request->query)); }
    public function behavior(Request $request): never { $actor = $this->allow($request, self::SCHOOL_RECORDING_ROLES); Response::success($this->service->behavior($actor, $request->body()), 201); }
    public function defaulterFollowup(Request $request,array $params): never { $actor=$this->allow($request,self::EDUCATION_ROLES);Response::success($this->service->defaulterFollowup($actor,$params['id'],$request->body()),201); }
    public function schoolChildReferral(Request $request):never{$actor=$this->allow($request,self::SCHOOL_RECORDING_ROLES);Response::success($this->service->submitSchoolChildReferral($actor,$request->body()),201);}
    public function schoolChildReferrals(Request $request):never{$actor=$this->allow($request,['super_admin','program_admin','lga_supervisor','ward_supervisor','headmaster','mobilizer','teacher']);Response::success($this->service->schoolChildReferrals($actor));}
    public function resolveSchoolChildReferral(Request $request,array $params):never{$actor=$this->allow($request,['super_admin','program_admin','lga_supervisor','ward_supervisor','mobilizer']);Response::success($this->service->resolveSchoolChildReferral($actor,$params['id'],$request->body()));}
    public function terms(Request $request): never { $actor = $this->allow($request, self::EDUCATION_ROLES); Response::success($this->service->terms($actor)); }
    public function tsangaya(Request $request): never { $actor = $this->allow($request, self::TSANGAYA_ROLES); Response::success($this->service->tsangaya($actor, $request->body()), 201); }
    public function tsangayaList(Request $request): never { $this->paginated($request, fn() => $this->service->listTsangaya($this->allow($request, self::TSANGAYA_ROLES), $request->query)); }
    public function updateTsangaya(Request $request, array $params): never { $actor = $this->allow($request, self::TSANGAYA_ROLES); Response::success($this->service->updateTsangaya($actor, $params['id'], $request->body())); }
    public function almajiriLinks(Request $request): never { $this->paginated($request, fn() => $this->service->listAlmajiriLinks($this->allow($request, self::TSANGAYA_ROLES), $request->query)); }
    public function almajiriLink(Request $request): never { $actor = $this->allow($request, self::TSANGAYA_ROLES); Response::success($this->service->almajiriLink($actor, $request->body()), 201); }
    public function updateAlmajiriLink(Request $request,array $params): never { $actor=$this->allow($request,self::TSANGAYA_ROLES);Response::success($this->service->updateAlmajiriLink($actor,$params['id'],$request->body())); }
    public function survey(Request $request): never { $actor = $this->allow($request, self::FIELD_ROLES); Response::success($this->service->survey($actor, $request->body()), 201); }
    public function surveys(Request $request): never { $this->paginated($request, fn() => $this->service->listSurveys($this->allow($request, self::FIELD_ROLES), $request->query)); }
    public function cohort(Request $request): never { $actor = $this->allow($request, self::SUPERVISION_ROLES); Response::success($this->service->cohort($actor, $request->body()), 201); }
    public function cohortMember(Request $request, array $params): never { $actor = $this->allow($request, self::SUPERVISION_ROLES); Response::success($this->service->addCohortMember($actor, $params['id'], $request->body()), 201); }
    public function cohorts(Request $request): never { $actor=$this->allow($request,['super_admin','program_admin']);Response::success($this->service->listCohorts($actor)); }
    public function cohortProgress(Request $request,array $params): never { $actor=$this->allow($request,['super_admin','program_admin']);Response::success($this->service->cohortProgress($actor,$params['id'])); }
    public function cohortMemberRemove(Request $request,array $params): never {$actor=$this->allow($request,['super_admin','program_admin']);Response::success($this->service->removeCohortMember($actor,$params['id'],$params['memberId']));}
    public function cohortClose(Request $request,array $params): never {$actor=$this->allow($request,['super_admin','program_admin']);Response::success($this->service->closeCohort($actor,$params['id']));}
    public function cohortTransfer(Request $request,array $params): never {$actor=$this->allow($request,['super_admin','program_admin']);Response::success($this->service->transferCohort($actor,$params['id'],$request->body()));}
    public function cohortDelegate(Request $request,array $params): never {$actor=$this->allow($request,['super_admin','program_admin']);Response::success($this->service->delegateCohort($actor,$params['id'],$request->body()));}
    public function guardianChildren(Request $request): never { $actor=$this->allow($request,['guardian']);Response::success($this->service->guardianChildren($actor)); }
    public function incentives(Request $request): never { $actor = $this->allow($request, ['super_admin','program_admin']); Response::success($this->service->incentiveCompute($actor, $request->body())); }
    public function complianceList(Request $request): never { $this->paginated($request, fn() => $this->service->listCompliance($this->allow($request, self::SUPERVISION_ROLES), $request->query)); }
    public function complianceCreate(Request $request): never { $actor=$this->allow($request,self::SUPERVISION_ROLES);Response::success($this->service->createCompliance($actor,$request->body()),201); }
    public function complianceUpdate(Request $request,array $params): never { $actor=$this->allow($request,self::SUPERVISION_ROLES);Response::success($this->service->updateCompliance($actor,$params['id'],$request->body())); }
    public function incentiveList(Request $request): never { $this->paginated($request, fn() => $this->service->listIncentives($this->allow($request,['super_admin','program_admin','lga_supervisor','ward_supervisor']),$request->query)); }
    public function incentiveApprove(Request $request,array $params): never { $actor=$this->allow($request,['super_admin','program_admin']);Response::success($this->service->approveIncentive($actor,$params['id'],$request->body())); }
    public function incentiveDisburse(Request $request,array $params): never { $actor=$this->allow($request,['super_admin','program_admin']);Response::success($this->service->disburseIncentive($actor,$params['id'],$request->body())); }
}
