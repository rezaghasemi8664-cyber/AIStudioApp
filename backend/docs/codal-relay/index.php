<?php
declare(strict_types=1);

/**
 * Secure CODAL document relay.
 * Deploy as the relay host's front controller; keep the configured relay URL unchanged.
 * Allowed upstreams: HTTPS codal.ir, www.codal.ir and excel.codal.ir only.
 */
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const ALLOWED_HOSTS = ['codal.ir', 'www.codal.ir', 'excel.codal.ir'];

function fail(int $status, string $message): void {
    http_response_code($status);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    exit($message);
}
function validate_target(string $value): string {
    $parts = parse_url($value);
    if (!is_array($parts)) fail(403, 'Invalid CODAL target');
    $scheme = strtolower((string)($parts['scheme'] ?? ''));
    $host = strtolower(rtrim((string)($parts['host'] ?? ''), '.'));
    $port = isset($parts['port']) ? (int)$parts['port'] : 443;
    if ($scheme !== 'https' || !in_array($host, ALLOWED_HOSTS, true) ||
        $port !== 443 || isset($parts['user']) || isset($parts['pass'])) {
        fail(403, 'Only approved HTTPS CODAL hosts on port 443 are allowed');
    }
    return $value;
}

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$path = is_string($path) ? $path : '/';
$target = trim((string)($_GET['url'] ?? ''));
if ($target === '' && strpos($path, '/service/Excel/') === 0) {
    $target = 'https://excel.codal.ir' . $path;
    if (!empty($_SERVER['QUERY_STRING'])) $target .= '?' . $_SERVER['QUERY_STRING'];
}
if ($target === '') fail(400, 'Missing CODAL target');
$target = validate_target($target);

$body = '';
$contentType = 'application/octet-stream';
for ($redirect = 0; $redirect <= MAX_REDIRECTS; $redirect++) {
    $body = '';
    $upstreamType = 'application/octet-stream';
    $ch = curl_init($target);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => false,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_HTTPHEADER => [
            'Accept: application/pdf, text/html, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, */*',
            'User-Agent: Roniya-Codal-Relay/1.1',
        ],
        CURLOPT_HEADERFUNCTION => static function ($curl, string $line) use (&$upstreamType): int {
            if (stripos($line, 'Content-Type:') === 0) $upstreamType = trim(substr($line, strlen('Content-Type:')));
            return strlen($line);
        },
        CURLOPT_WRITEFUNCTION => static function ($curl, string $chunk) use (&$body): int {
            if (strlen($body) + strlen($chunk) > MAX_RESPONSE_BYTES) return 0;
            $body .= $chunk;
            return strlen($chunk);
        },
    ]);
    $ok = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $redirectUrl = (string)curl_getinfo($ch, CURLINFO_REDIRECT_URL);
    $error = curl_error($ch);
    curl_close($ch);
    if ($ok === false) {
        if (strlen($body) >= MAX_RESPONSE_BYTES) fail(502, 'CODAL document exceeds the 32 MB relay limit');
        fail(502, 'Upstream fetch failed: ' . $error);
    }
    if ($status >= 300 && $status < 400) {
        if ($redirect >= MAX_REDIRECTS || $redirectUrl === '') fail(502, 'CODAL redirect limit exceeded');
        $target = validate_target($redirectUrl);
        continue;
    }
    if ($status < 200 || $status >= 300) fail(502, 'Upstream CODAL returned HTTP ' . $status);
    $contentType = $upstreamType;
    break;
}
header('Content-Type: ' . $contentType);
header('Content-Length: ' . strlen($body));
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
echo $body;
