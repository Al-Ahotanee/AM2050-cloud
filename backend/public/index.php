<?php
declare(strict_types=1);

use AM2050\Controllers\AuthController;
use AM2050\Controllers\ChildController;
use AM2050\Controllers\GeographyController;
use AM2050\Controllers\HouseholdController;
use AM2050\Controllers\UserController;
use AM2050\Controllers\SyncController;
use AM2050\Controllers\EducationController;
use AM2050\Controllers\InsightController;
use AM2050\Controllers\ProgramController;
use AM2050\Controllers\ReportController;
use AM2050\Controllers\GovernanceController;
use AM2050\Core\Database;
use AM2050\Core\Env;
use AM2050\Core\Request;
use AM2050\Core\Response;
use AM2050\Core\Router;
use AM2050\Middleware\AuthMiddleware;
use AM2050\Middleware\RateLimitMiddleware;
use AM2050\Services\AuthService;
use AM2050\Services\ChildService;
use AM2050\Services\CloudinaryService;
use AM2050\Services\GeographyService;
use AM2050\Services\HouseholdService;
use AM2050\Services\UserService;
use AM2050\Services\SyncService;
use AM2050\Services\EducationService;
use AM2050\Services\InsightService;
use AM2050\Services\ProgramService;
use AM2050\Services\GovernanceService;
use AM2050\Services\ChildJourneyService;
use AM2050\Controllers\ChildJourneyController;
use AM2050\Controllers\DashboardOperationsController;
use AM2050\Services\DashboardOperationsService;
use AM2050\Support\AuditLogger;

require dirname(__DIR__) . '/vendor/autoload.php';

try {
    Env::load(dirname(__DIR__));
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $configuredOrigins = array_filter(array_map('trim', explode(',', (string) Env::get('CORS_ALLOWED_ORIGIN', ''))));
    $allowedOrigins = array_values(array_unique($configuredOrigins));
    if ($origin !== '' && (in_array('*', $allowedOrigins, true) || in_array($origin, $allowedOrigins, true))) {
        header("Access-Control-Allow-Origin: {$origin}");
        header('Access-Control-Allow-Credentials: true');
        header('Vary: Origin');
    }
    header('Access-Control-Allow-Headers: Authorization, Content-Type');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
    header('Permissions-Policy: geolocation=(self), camera=(self), microphone=()');
    header("Content-Security-Policy: default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
    if ((Env::get('APP_ENV', 'production')) === 'production') { header('Strict-Transport-Security: max-age=31536000; includeSubDomains'); }

    // Health endpoint responds immediately — before any DB connection — so Render's health check always succeeds.
    $requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    if ($requestPath === '/api/v1/health' && ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
        $health = ['status' => 'ok', 'service' => 'am2050-api', 'time' => gmdate(DATE_ATOM)];
        if (isset($_GET['check_db']) || isset($_GET['debug'])) {
            $cloud = new CloudinaryService();
            $health['cloudinary'] = [
                'configured' => $cloud->isConfigured(),
                'cloud_name' => $cloud->getCloudName(),
            ];
            try {
                $dbTest = new Database();
                $dbTest->pdo()->query('SELECT 1');
                $health['database'] = ['status' => 'connected'];
            } catch (\Throwable $e) {
                $health['database'] = [
                    'status' => 'disconnected',
                    'error' => $e->getMessage(),
                    'configured_host' => Env::get('DB_HOST'),
                    'configured_port' => Env::get('DB_PORT'),
                    'has_database_url' => !empty(Env::get('DATABASE_URL')),
                ];
            }
        }
        Response::success($health);
    }

    $database = new Database();
    $cloudinary = new CloudinaryService();
    $rateLimit = new RateLimitMiddleware($database->pdo());
    $auth = new AuthService($database->pdo());
    $authMiddleware = new AuthMiddleware($auth);
    $audit = new AuditLogger($database->pdo());
    $authController = new AuthController($auth);
    $householdService = new HouseholdService($database, $audit, $cloudinary);
    $childService = new ChildService($database, $audit, $cloudinary);
    $householdController = new HouseholdController($authMiddleware, $householdService);
    $childController = new ChildController($authMiddleware, $childService);
    $geographyController = new GeographyController($authMiddleware, new GeographyService($database, $audit));
    $userController = new UserController($authMiddleware, new UserService($database, $audit, $cloudinary));
    $syncController = new SyncController($authMiddleware, new SyncService($database, $householdService, $childService, $audit));
    $educationController = new EducationController($authMiddleware, new EducationService($database, $audit, $cloudinary));
    $insightController = new InsightController($authMiddleware, new InsightService($database));
    $programController = new ProgramController($authMiddleware, new ProgramService($database, $audit));
    $governanceController = new GovernanceController($authMiddleware, new GovernanceService($database, $audit));
    $reportController = new ReportController($authMiddleware, $database);
    $childJourneyController = new ChildJourneyController($authMiddleware, new ChildJourneyService($database, $audit));
    $dashboardOperationsController = new DashboardOperationsController($authMiddleware, new DashboardOperationsService($database, $audit, new InsightService($database), $cloudinary));
    $router = new Router();
    $router->add('GET', '/api/v1/health', static fn() => Response::success(['status' => 'ok', 'service' => 'am2050-api', 'time' => gmdate(DATE_ATOM)]));
    $router->add('POST', '/api/v1/auth/login', static function (Request $request) use ($rateLimit, $authController): never {
        $rateLimit->check($request, 'login', 15, 60);
        $authController->login($request);
    });
    $router->add('POST', '/api/v1/auth/refresh', static function (Request $request) use ($rateLimit, $authController): never {
        $rateLimit->check($request, 'refresh', 30, 60);
        $authController->refresh($request);
    });
    $router->add('POST', '/api/v1/auth/logout', static fn(Request $request) => $authController->logout($request));
    $router->add('GET', '/api/v1/auth/me', static function (Request $request) use ($authMiddleware, $authController): never { $authMiddleware->require($request); $authController->me($request); });
    $router->add('GET', '/api/v1/households', static fn(Request $request) => $householdController->list($request));
    $router->add('GET', '/api/v1/households/:id', static fn(Request $request, array $params) => $householdController->get($request, $params));
    $router->add('POST', '/api/v1/households', static fn(Request $request) => $householdController->create($request));
    $router->add('PUT', '/api/v1/households/:id', static fn(Request $request, array $params) => $householdController->update($request, $params));
    $router->add('GET', '/api/v1/children', static fn(Request $request) => $childController->list($request));
    $router->add('GET', '/api/v1/children/check-duplicate', static fn(Request $request) => $childController->checkDuplicate($request));
    $router->add('GET', '/api/v1/children/:id', static fn(Request $request, array $params) => $childController->get($request, $params));
    $router->add('POST', '/api/v1/children', static fn(Request $request) => $childController->create($request));
    $router->add('PUT', '/api/v1/children/:id', static fn(Request $request, array $params) => $childController->update($request, $params));
    $router->add('PUT', '/api/v1/children/:id/guardian-link', static fn(Request $request, array $params) => $childController->confirmGuardian($request, $params));
    $router->add('GET', '/api/v1/child-journey/children', static fn(Request $request) => $childJourneyController->children($request));
    $router->add('GET', '/api/v1/child-journey/children/:id', static fn(Request $request, array $params) => $childJourneyController->journey($request, $params));
    foreach (['states', 'lgas', 'wards', 'communities'] as $resource) {
        $router->add('GET', '/api/v1/' . $resource, static fn(Request $request) => $geographyController->list($request, ['resource' => $resource]));
        $router->add('POST', '/api/v1/' . $resource, static fn(Request $request) => $geographyController->create($request, ['resource' => $resource]));
        $router->add('PUT', '/api/v1/' . $resource . '/:id', static fn(Request $request, array $params) => $geographyController->update($request, ['resource' => $resource, ...$params]));
        $router->add('POST', '/api/v1/' . $resource . '/:id/deactivate', static fn(Request $request, array $params) => $geographyController->deactivate($request, ['resource' => $resource, ...$params]));
    }
    $router->add('GET', '/api/v1/users', static fn(Request $request) => $userController->list($request));
    $router->add('GET', '/api/v1/users/:id', static fn(Request $request, array $params) => $userController->get($request, $params));
    $router->add('POST', '/api/v1/users', static fn(Request $request) => $userController->create($request));
    $router->add('PUT', '/api/v1/users/:id', static fn(Request $request, array $params) => $userController->update($request, $params));
    $router->add('POST', '/api/v1/teacher-requests', static fn(Request $request) => $userController->submitTeacherRequest($request));
    $router->add('GET', '/api/v1/teacher-requests', static fn(Request $request) => $userController->teacherRequests($request));
    $router->add('GET', '/api/v1/school-teachers', static fn(Request $request) => $userController->schoolTeachers($request));
    $router->add('POST', '/api/v1/teacher-requests/:id/approve', static fn(Request $request, array $params) => $userController->approveTeacherRequest($request, $params));
    $router->add('POST', '/api/v1/sync/batch', static fn(Request $request) => $syncController->batch($request));
    $router->add('GET', '/api/v1/schools', static fn(Request $request) => $educationController->schools($request));
    $router->add('POST', '/api/v1/schools', static fn(Request $request) => $educationController->createSchool($request));
    $router->add('PUT', '/api/v1/schools/:id', static fn(Request $request, array $params) => $educationController->updateSchool($request, $params));
    $router->add('PUT', '/api/v1/schools/:id/logo', static fn(Request $request, array $params) => $educationController->updateSchoolLogo($request, $params));
    $router->add('GET', '/api/v1/schools/transfer-destinations', static fn(Request $request) => $educationController->transferDestinations($request));
    $router->add('GET', '/api/v1/classes', static fn(Request $request) => $educationController->classes($request));
    $router->add('POST', '/api/v1/classes', static fn(Request $request) => $educationController->createClass($request));
    $router->add('PUT', '/api/v1/classes/:id', static fn(Request $request, array $params) => $educationController->updateClass($request, $params));
    $router->add('GET', '/api/v1/subjects', static fn(Request $request) => $educationController->subjects($request));
    $router->add('GET', '/api/v1/classes/:id/subjects', static fn(Request $request, array $params) => $educationController->subjectsForClass($request, $params));
    $router->add('POST', '/api/v1/subjects', static fn(Request $request) => $educationController->createSubject($request));
    $router->add('PUT', '/api/v1/classes/:id/subjects', static fn(Request $request, array $params) => $educationController->classSubjects($request, $params));
    $router->add('GET', '/api/v1/teaching-allocations', static fn(Request $request) => $educationController->teachingAllocations($request));
    $router->add('POST', '/api/v1/teaching-allocations', static fn(Request $request) => $educationController->saveTeachingAllocation($request));
    $router->add('DELETE', '/api/v1/teaching-allocations/:id', static fn(Request $request, array $params) => $educationController->removeTeachingAllocation($request, $params));
    $router->add('POST', '/api/v1/academic-sessions', static fn(Request $request) => $educationController->createSession($request));
    $router->add('PUT', '/api/v1/academic-sessions/:id', static fn(Request $request, array $params) => $educationController->updateSession($request, $params));
    $router->add('GET', '/api/v1/enrollments', static fn(Request $request) => $educationController->enrollments($request));
    $router->add('POST', '/api/v1/enrollments', static fn(Request $request) => $educationController->createEnrollment($request));
    $router->add('POST', '/api/v1/enrollments/:id/approve', static fn(Request $request, array $params) => $educationController->approveEnrollment($request, $params));
    $router->add('POST', '/api/v1/enrollments/:id/transition', static fn(Request $request, array $params) => $educationController->transitionEnrollment($request, $params));
    $router->add('POST', '/api/v1/enrollments/:id/certificate-signature', static fn(Request $request, array $params) => $educationController->applyCertificateSignature($request, $params));
    $router->add('GET', '/api/v1/enrollments/:id/documents/enrollment/download', static fn(Request $request, array $params) => $educationController->downloadEnrollmentDocument($request, $params));
    $router->add('GET', '/api/v1/enrollments/:id/documents/transfer/download', static fn(Request $request, array $params) => $educationController->downloadTransferCertificate($request, $params));
    $router->add('GET', '/api/v1/enrollments/:id/documents/withdrawal/download', static fn(Request $request, array $params) => $educationController->downloadWithdrawalCertificate($request, $params));
    $router->add('GET', '/api/v1/certificate-signature', static fn(Request $request) => $educationController->ownCertificateSignature($request));
    $router->add('PUT', '/api/v1/certificate-signature', static fn(Request $request) => $educationController->ownCertificateSignature($request));
    $router->add('GET', '/api/v1/attendance', static fn(Request $request) => $educationController->attendance($request));
    $router->add('POST', '/api/v1/attendance', static fn(Request $request) => $educationController->recordAttendance($request));
    $router->add('POST', '/api/v1/attendance/batch', static fn(Request $request) => $educationController->batchRecordAttendance($request));
    $router->add('POST', '/api/v1/attendance/scan', static fn(Request $request) => $educationController->scanAttendance($request));
    $router->add('GET', '/api/v1/attendance/matrix', static fn(Request $request) => $educationController->attendanceMatrix($request));
    $router->add('GET', '/api/v1/attendance/stats', static fn(Request $request) => $educationController->attendanceStats($request));
    $router->add('GET', '/api/v1/dashboard/stats', static fn(Request $request) => $insightController->stats($request));
    $router->add('GET', '/api/v1/dashboard/decision', static fn(Request $request) => $insightController->decisionDashboard($request));
    $router->add('GET', '/api/v1/dashboard/metrics/:metric', static fn(Request $request, array $params) => $insightController->metricDrilldown($request, $params));
    $router->add('GET', '/api/v1/dashboard/metrics/:metric/export', static fn(Request $request, array $params) => $insightController->exportMetric($request, $params));
    $router->add('GET', '/api/v1/dashboard/priorities/:key/owners', static fn(Request $request, array $params) => $dashboardOperationsController->owners($request, $params));
    $router->add('PUT', '/api/v1/dashboard/priorities/:key/owner', static fn(Request $request, array $params) => $dashboardOperationsController->assign($request, $params));
    $router->add('GET', '/api/v1/dashboard/sla-targets', static fn(Request $request) => $dashboardOperationsController->sla($request));
    $router->add('PUT', '/api/v1/dashboard/sla-targets', static fn(Request $request) => $dashboardOperationsController->updateSla($request));
    $router->add('GET', '/api/v1/executive-dashboard/owners', static fn(Request $request) => $dashboardOperationsController->executiveOwners($request));
    $router->add('GET', '/api/v1/executive-dashboard/schedules', static fn(Request $request) => $dashboardOperationsController->schedules($request));
    $router->add('POST', '/api/v1/executive-dashboard/schedules', static fn(Request $request) => $dashboardOperationsController->createSchedule($request));
    $router->add('PUT', '/api/v1/executive-dashboard/schedules/:id', static fn(Request $request, array $params) => $dashboardOperationsController->updateSchedule($request, $params));
    $router->add('GET', '/api/v1/executive-dashboard/packs', static fn(Request $request) => $dashboardOperationsController->packs($request));
    $router->add('POST', '/api/v1/executive-dashboard/packs', static fn(Request $request) => $dashboardOperationsController->generate($request));
    $router->add('GET', '/api/v1/executive-dashboard/packs/:id/download', static fn(Request $request, array $params) => $dashboardOperationsController->download($request, $params));
    $router->add('GET', '/api/v1/out-of-school/list', static fn(Request $request) => $insightController->outOfSchool($request));
    $router->add('GET', '/api/v1/defaulters', static fn(Request $request) => $insightController->defaulters($request));
    $router->add('POST', '/api/v1/defaulters/:id/follow-ups', static fn(Request $request, array $params) => $programController->defaulterFollowup($request, $params));
    $router->add('GET', '/api/v1/school-child-referrals', static fn(Request $request) => $programController->schoolChildReferrals($request));
    $router->add('POST', '/api/v1/school-child-referrals', static fn(Request $request) => $programController->schoolChildReferral($request));
    $router->add('POST', '/api/v1/school-child-referrals/:id/resolve', static fn(Request $request, array $params) => $programController->resolveSchoolChildReferral($request, $params));
    $router->add('GET', '/api/v1/analytics/attendance-trends', static fn(Request $request) => $insightController->trend($request));
    $router->add('GET', '/api/v1/analytics/heat-map', static fn(Request $request) => $insightController->heatMap($request));
    $router->add('GET', '/api/v1/analytics/dropout-risk', static fn(Request $request) => $insightController->dropoutRisk($request));
    $router->add('GET', '/api/v1/analytics/roi', static fn(Request $request) => $insightController->roi($request));
    $router->add('GET', '/api/v1/terms', static fn(Request $request) => $programController->terms($request));
    $router->add('GET', '/api/v1/results', static fn(Request $request) => $programController->results($request));
    $router->add('POST', '/api/v1/results', static fn(Request $request) => $programController->result($request));
    $router->add('POST', '/api/v1/results/batch', static fn(Request $request) => $programController->resultsBatch($request));
    $router->add('POST', '/api/v1/results/submit', static fn(Request $request) => $programController->submitResults($request));
    $router->add('POST', '/api/v1/results/publish', static fn(Request $request) => $programController->publishResults($request));
    $router->add('POST', '/api/v1/results/unpublish', static fn(Request $request) => $programController->unpublishResults($request));
    $router->add('GET', '/api/v1/classes/:id/report-sheets', static fn(Request $request, array $params) => $programController->classReportSheets($request, $params));
    $router->add('GET', '/api/v1/enrollments/:id/report-sheet', static fn(Request $request, array $params) => $programController->enrollmentReportSheet($request, $params));
    $router->add('GET', '/api/v1/behavioral-trackers', static fn(Request $request) => $programController->behaviors($request));
    $router->add('POST', '/api/v1/behavioral-trackers', static fn(Request $request) => $programController->behavior($request));
    $router->add('POST', '/api/v1/tsangaya-schools', static fn(Request $request) => $programController->tsangaya($request));
    $router->add('GET', '/api/v1/tsangaya-schools', static fn(Request $request) => $programController->tsangayaList($request));
    $router->add('PUT', '/api/v1/tsangaya-schools/:id', static fn(Request $request, array $params) => $programController->updateTsangaya($request, $params));
    $router->add('GET', '/api/v1/almajiri-links', static fn(Request $request) => $programController->almajiriLinks($request));
    $router->add('POST', '/api/v1/almajiri-links', static fn(Request $request) => $programController->almajiriLink($request));
    $router->add('PUT', '/api/v1/almajiri-links/:id', static fn(Request $request, array $params) => $programController->updateAlmajiriLink($request, $params));
    $router->add('GET', '/api/v1/household-surveys', static fn(Request $request) => $programController->surveys($request));
    $router->add('POST', '/api/v1/household-surveys', static fn(Request $request) => $programController->survey($request));
    $router->add('POST', '/api/v1/cohorts', static fn(Request $request) => $programController->cohort($request));
    $router->add('GET', '/api/v1/cohorts', static fn(Request $request) => $programController->cohorts($request));
    $router->add('GET', '/api/v1/cohorts/:id/progress', static fn(Request $request, array $params) => $programController->cohortProgress($request, $params));
    $router->add('POST', '/api/v1/cohorts/:id/members', static fn(Request $request, array $params) => $programController->cohortMember($request, $params));
    $router->add('DELETE', '/api/v1/cohorts/:id/members/:memberId', static fn(Request $request, array $params) => $programController->cohortMemberRemove($request, $params));
    $router->add('POST', '/api/v1/cohorts/:id/close', static fn(Request $request, array $params) => $programController->cohortClose($request, $params));
    $router->add('PUT', '/api/v1/cohorts/:id/ownership', static fn(Request $request, array $params) => $programController->cohortTransfer($request, $params));
    $router->add('POST', '/api/v1/cohorts/:id/delegate', static fn(Request $request, array $params) => $programController->cohortDelegate($request, $params));
    $router->add('GET', '/api/v1/guardian/children', static fn(Request $request) => $programController->guardianChildren($request));
    $router->add('GET', '/api/v1/guardian/certificate-alerts', static fn(Request $request) => $educationController->guardianCertificateAlerts($request));
    $router->add('POST', '/api/v1/guardian/certificate-alerts/:id/read', static fn(Request $request, array $params) => $educationController->readGuardianCertificateAlert($request, $params));
    $router->add('POST', '/api/v1/incentives/compute', static fn(Request $request) => $programController->incentives($request));
    $router->add('GET', '/api/v1/incentives/summary', static fn(Request $request) => $programController->incentivesSummary($request));
    $router->add('POST', '/api/v1/incentives/batch-approve', static fn(Request $request) => $programController->batchApproveIncentives($request));
    $router->add('POST', '/api/v1/incentives/batch-disburse', static fn(Request $request) => $programController->batchDisburseIncentives($request));
    $router->add('GET', '/api/v1/incentives/voucher-manifest', static fn(Request $request) => $programController->voucherManifest($request));
    $router->add('GET', '/api/v1/incentives', static fn(Request $request) => $programController->incentiveList($request));
    $router->add('POST', '/api/v1/incentives/:id/approve', static fn(Request $request, array $params) => $programController->incentiveApprove($request, $params));
    $router->add('POST', '/api/v1/incentives/:id/disburse', static fn(Request $request, array $params) => $programController->incentiveDisburse($request, $params));
    $router->add('GET', '/api/v1/program-rules', static fn(Request $request) => $governanceController->rules($request));
    $router->add('PUT', '/api/v1/program-rules/:key', static fn(Request $request, array $params) => $governanceController->updateRule($request, $params));
    $router->add('GET', '/api/v1/audit-logs', static fn(Request $request) => $governanceController->auditLog($request));
    $router->add('GET', '/api/v1/compliance', static fn(Request $request) => $programController->complianceList($request));
    $router->add('POST', '/api/v1/compliance', static fn(Request $request) => $programController->complianceCreate($request));
    $router->add('PUT', '/api/v1/compliance/:id', static fn(Request $request, array $params) => $programController->complianceUpdate($request, $params));
    $router->add('GET', '/api/v1/reports/child-registry', static fn(Request $request) => $reportController->childRegistry($request));
    $router->add('GET', '/api/v1/reports/attendance-alerts', static fn(Request $request) => $reportController->attendanceAlerts($request));
    $router->add('GET', '/api/v1/reports/results-summary', static fn(Request $request) => $reportController->resultsSummary($request));
    $router->add('GET', '/api/v1/reports/incentive-disbursements', static fn(Request $request) => $reportController->incentiveDisbursement($request));
    $router->add('GET', '/api/v1/report-schedules', static fn(Request $request) => $reportController->schedules($request));
    $router->add('POST', '/api/v1/report-schedules', static fn(Request $request) => $reportController->createSchedule($request));
    $router->add('PUT', '/api/v1/report-schedules/:id', static fn(Request $request, array $params) => $reportController->updateSchedule($request, $params));
    $router->dispatch(Request::fromGlobals());
} catch (InvalidArgumentException $error) {
    Response::error('Request validation failed.', 400, json_decode($error->getMessage(), true) ?: null);
} catch (\PDOException $error) {
    error_log((string) $error);
    $msg = $error->getMessage();
    $isConnectionError = str_contains($msg, 'php_network_getaddresses')
        || str_contains($msg, 'Connection refused')
        || str_contains($msg, 'timed out')
        || str_contains($msg, 'Name or service not known')
        || str_contains($msg, '[2002]');

    if ($isConnectionError) {
        Response::error("Database connection failed. Unable to reach database host: {$msg}", 503);
    }

    $showDetails = (Env::get('APP_DEBUG') === 'true') || (Env::get('APP_ENV') !== 'production');
    Response::error($showDetails ? ("Database error: {$msg}") : 'A database error occurred. Please try again later.', 500);
} catch (RuntimeException $error) {
    $message = $error->getMessage();
    $notFound = !str_starts_with($message, 'SQLSTATE') && (str_contains(strtolower($message), 'not found') || str_contains(strtolower($message), 'does not exist'));
    Response::error($message, $notFound ? 404 : 422);
} catch (Throwable $error) {
    error_log((string) $error);
    Response::error('An unexpected server error occurred.', 500);
}
