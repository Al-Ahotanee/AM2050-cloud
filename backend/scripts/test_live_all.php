<?php
declare(strict_types=1);

use AM2050\Core\Database;
use AM2050\Core\Env;
use Firebase\JWT\JWT;

require dirname(__DIR__) . '/vendor/autoload.php';

$root = dirname(__DIR__);
Env::loadForMigration($root);
$pdo = (new Database())->pdo();

// 1. Get HM Usman Bello Ahoto user
$hm = $pdo->query("SELECT * FROM users WHERE email = 'hm.gdjss.ahoto@am2050.ng'")->fetch(PDO::FETCH_ASSOC);
if (!$hm) die("HM not found!\n");

$jwtSecret = (string) Env::get('JWT_SECRET');
$token = JWT::encode([
    'iss' => Env::get('JWT_ISSUER', 'am2050-api'),
    'aud' => Env::get('JWT_AUDIENCE', 'am2050-web'),
    'iat' => time(),
    'exp' => time() + 3600,
    'sub' => $hm['id'],
    'role' => $hm['role'],
], $jwtSecret, 'HS256');

function req(string $method, string $path, ?array $body = null, string $token = ''): array {
    $ch = curl_init("http://127.0.0.1:10000" . $path);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    $headers = ['Content-Type: application/json', 'Authorization: Bearer ' . $token];
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['code' => $httpCode, 'data' => json_decode((string)$response, true), 'raw' => $response];
}

$classId = '01M39PF45KR6V14G576XPTAA18'; // JSS 1

echo "=== 1. TESTING ATTENDANCE MATRIX (DAY) ===\n";
$rDay = req('GET', "/api/v1/attendance/matrix?class_id={$classId}&granularity=day&date=2026-09-25", null, $token);
echo "HTTP {$rDay['code']}, Period: " . ($rDay['data']['data']['periodLabel'] ?? 'N/A') . ", Days: " . count($rDay['data']['data']['schoolDays'] ?? []) . "\n";

echo "=== 2. TESTING ATTENDANCE MATRIX (WEEK) ===\n";
$rWk = req('GET', "/api/v1/attendance/matrix?class_id={$classId}&granularity=week&date=2026-09-25", null, $token);
echo "HTTP {$rWk['code']}, Period: " . ($rWk['data']['data']['periodLabel'] ?? 'N/A') . ", Days: " . count($rWk['data']['data']['schoolDays'] ?? []) . "\n";

echo "=== 3. TESTING ATTENDANCE MATRIX (MONTH) ===\n";
$rMo = req('GET', "/api/v1/attendance/matrix?class_id={$classId}&granularity=month&month=2026-09", null, $token);
echo "HTTP {$rMo['code']}, Period: " . ($rMo['data']['data']['periodLabel'] ?? 'N/A') . ", Days: " . count($rMo['data']['data']['schoolDays'] ?? []) . "\n";

echo "=== 4. TESTING ATTENDANCE MATRIX (TERM) ===\n";
$rTm = req('GET', "/api/v1/attendance/matrix?class_id={$classId}&granularity=term&term=First%20Term&academic_year=2025/2026", null, $token);
echo "HTTP {$rTm['code']}, Period: " . ($rTm['data']['data']['periodLabel'] ?? 'N/A') . ", Days: " . count($rTm['data']['data']['schoolDays'] ?? []) . "\n";

echo "=== 5. TESTING ATTENDANCE MATRIX (YEAR) ===\n";
$rYr = req('GET', "/api/v1/attendance/matrix?class_id={$classId}&granularity=year&academic_year=2025/2026", null, $token);
echo "HTTP {$rYr['code']}, Period: " . ($rYr['data']['data']['periodLabel'] ?? 'N/A') . ", Days: " . count($rYr['data']['data']['schoolDays'] ?? []) . "\n";

echo "=== 6. TESTING QR SCAN ATTENDANCE ===\n";
$schoolId = '01M39PEMPRZ85CSAB63Q9XF5S2'; // GDJSS AHOTO
$child = $pdo->query("SELECT c.id, c.child_unique_id, c.attendance_qr_token, c.first_name, c.last_name FROM enrollments e INNER JOIN children c ON c.id = e.child_id WHERE e.school_id = '{$schoolId}' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
if ($child) {
    echo "Found GDJSS Ahoto child: {$child['first_name']} {$child['last_name']} ({$child['child_unique_id']})\n";
    // Test scanning with child_unique_id
    $scanRes = req('POST', "/api/v1/attendance/scan", [
        'qrToken' => $child['child_unique_id'],
        'schoolId' => $schoolId,
        'date' => '2026-09-25'
    ], $token);
    echo "Scan with Unique ID: HTTP {$scanRes['code']}, Result: " . ($scanRes['data']['success'] ? 'SUCCESS' : 'FAILED') . "\n";
    if (isset($scanRes['data']['data']['child'])) {
        echo "Scanned Child: " . $scanRes['data']['data']['child']['name'] . "\n";
    } else {
        print_r($scanRes['data']);
    }
}

$rKids = req('GET', "/api/v1/child-journey/children?limit=5", null, $token);
$totalCount = $rKids['data']['pagination']['total'] ?? $rKids['data']['total'] ?? 0;
echo "HTTP {$rKids['code']}, Total Kids: " . $totalCount . ", Returned: " . count($rKids['data']['data'] ?? []) . "\n";

echo "=== 8. TESTING CHILD JOURNEY DETAILS & KPIS ===\n";
if ($child) {
    $kidId = $child['id'];
    $rJrn = req('GET', "/api/v1/child-journey/children/{$kidId}", null, $token);
    echo "HTTP {$rJrn['code']}, Child Name: " . ($rJrn['data']['data']['child']['name'] ?? 'N/A') . "\n";
    echo "KPIs: ";
    $summ = $rJrn['data']['data']['summary'] ?? [];
    echo "Attendance Rate: " . ($summ['overallAttendanceRate'] ?? 'N/A') . "%, ";
    echo "Academic Avg: " . ($summ['academicAverage'] ?? 'N/A') . "%, ";
    echo "Cleared Gates: " . ($summ['clearedGates'] ?? 'N/A') . " of 5, ";
    echo "Retention: " . ($summ['retentionStatus'] ?? 'N/A') . "\n";
    echo "Timeline Events Count: " . count($rJrn['data']['data']['events'] ?? []) . "\n";
}

echo "=== ALL LIVE TESTS COMPLETED ===\n";
