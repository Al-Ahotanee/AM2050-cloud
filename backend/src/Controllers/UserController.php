<?php
declare(strict_types=1);
namespace AM2050\Controllers;
use AM2050\Core\Request;
use AM2050\Core\Response;
use AM2050\Middleware\AuthMiddleware;
use AM2050\Middleware\RoleMiddleware;
use AM2050\Services\UserService;
final class UserController {
    public function __construct(private readonly AuthMiddleware $auth, private readonly UserService $service) {}
    private function adminUser(Request $request): array { $actor=$this->auth->require($request); RoleMiddleware::allow($actor,['super_admin','program_admin']); return $actor; }
    private function headmaster(Request $request): array { $actor=$this->auth->require($request); RoleMiddleware::allow($actor,['headmaster']); return $actor; }
    private function schoolManager(Request $request): array { $actor=$this->auth->require($request); RoleMiddleware::allow($actor,['super_admin','program_admin','lga_supervisor','ward_supervisor','headmaster']); return $actor; }
    public function list(Request $request): never { $this->adminUser($request); $result=$this->service->list($request->query); Response::paginate($result['data'],$result['page'],$result['limit'],$result['total']); }
    public function create(Request $request): never { Response::success($this->service->create($this->adminUser($request),$request->body()),201); }
    public function get(Request $request,array $params): never { $this->adminUser($request); Response::success($this->service->get($params['id'])); }
    public function update(Request $request,array $params): never { Response::success($this->service->update($this->adminUser($request),$params['id'],$request->body())); }
    public function submitTeacherRequest(Request $request): never { Response::success($this->service->submitTeacherRequest($this->headmaster($request),$request->body()),201); }
    public function teacherRequests(Request $request): never { $this->adminUser($request); Response::success($this->service->teacherRequests()); }
    public function schoolTeachers(Request $request): never { Response::success($this->service->schoolTeachers($this->schoolManager($request))); }
    public function approveTeacherRequest(Request $request,array $params): never { Response::success($this->service->approveTeacherRequest($this->adminUser($request),$params['id'],$request->body())); }
}
