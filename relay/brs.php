<?php
declare(strict_types=1);

/*
 * Roniya BRS relay
 *
 * Deploy this file on the Iranian relay host, for example:
 *   https://codal-relay.roniya-analyzer.ir/brs.php
 *
 * The VPS sends the upstream URL without the API key and places the key
 * in X-BRS-API-Key. This prevents the key from appearing in the relay URL.
 */

header('Cache-Control: no-store');
header('X-Roniya-Relay: brs');

$rawUrl = isset($_GET['url']) ? trim((string)$_GET['url']) : '';
if ($rawUrl === '') {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'error' => 'missing_url']);
    exit;
}

$upstream = parse_url($rawUrl);
if (!is_array($upstream) || ($upstream['scheme'] ?? '') !== 'https' || strtolower((string)($upstream['host'] ?? '')) !== 'api.brsapi.ir') {
    http_response_code(403);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'error' => 'upstream_not_allowed']);
    exit;
}

$path = (string)($upstream['path'] ?? '');
if (strpos($path, '/Tsetmc/') !== 0) {
    http_response_code(403);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'error' => 'path_not_allowed']);
    exit;
}

$headers = function_exists('getallheaders') ? getallheaders() : [];
$apiKey = '';
foreach ($headers as $name => $value) {
    if (strtolower((string)$name) === 'x-brs-api-key') {
        $apiKey = trim((string)$value);
        break;
    }
}
if ($apiKey === '' && isset($_SERVER['HTTP_X_BRS_API_KEY'])) {
    $apiKey = trim((string)$_SERVER['HTTP_X_BRS_API_KEY']);
}
if ($apiKey === '') {
    http_response_code(401);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'error' => 'missing_api_key']);
    exit;
}

$query = [];
parse_str((string)($upstream['query'] ?? ''), $query);
unset($query['key']);
$query['key'] = $apiKey;

$target = 'https://Api.BrsApi.ir' . $path;
if ($query) {
    $target .= '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
}

$ch = curl_init($target);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 20,
    CURLOPT_HTTPHEADER => [
        'Accept: application/json',
        'User-Agent: RoniyaAnalyzer/5.0',
        'Connection: close'
    ],
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_SSL_VERIFYHOST => 2,
]);

$body = curl_exec($ch);
$error = curl_error($ch);
$status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
$contentType = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
curl_close($ch);

if ($body === false || $error !== '') {
    http_response_code(502);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'error' => 'upstream_request_failed']);
    exit;
}

http_response_code($status >= 200 && $status < 600 ? $status : 502);
header('Content-Type: ' . ($contentType !== '' ? $contentType : 'application/json') . '; charset=utf-8');
echo $body;
