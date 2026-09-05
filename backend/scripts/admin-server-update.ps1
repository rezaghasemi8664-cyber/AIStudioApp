param(
  [Parameter(Mandatory=$true)][string]$ProjectRoot,
  [Parameter(Mandatory=$true)][string]$Branch,
  [Parameter(Mandatory=$true)][string]$StatusFile,
  [Parameter(Mandatory=$true)][string]$JobId
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = [System.IO.Path]::GetFullPath($ProjectRoot)
$SourceBuild = Join-Path $ProjectRoot 'build'
$BackendBuild = Join-Path $ProjectRoot 'backend\build'
$BackupRoot = Join-Path $ProjectRoot 'backend\deploy-backups'
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupBuild = Join-Path $BackupRoot "build-$Stamp-$JobId"
$StageBuild = Join-Path $ProjectRoot "backend\build.__incoming-$JobId"

function Write-State($state, $message, $output = '', $error = '') {
  $dir = Split-Path -Parent $StatusFile
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $current = $null
  if (Test-Path $StatusFile) { try { $current = Get-Content $StatusFile -Raw | ConvertFrom-Json } catch {} }
  if ($null -eq $current) { $current = [pscustomobject]@{ jobId=$JobId; steps=@() } }
  $current.status = $state
  $current.stage = $message
  $current.updatedAt = (Get-Date).ToUniversalTime().ToString('o')
  if ($output) { $current.lastOutput = $output }
  if ($error) { $current.lastError = $error }
  $json = $current | ConvertTo-Json -Depth 12
  $tmp = "$StatusFile.tmp"
  Set-Content -Path $tmp -Value $json -Encoding UTF8
  Move-Item -Force $tmp $StatusFile
}

function Add-Step($name, $label, $state, $started, $finished, $output = '', $error = '') {
  $current = Get-Content $StatusFile -Raw | ConvertFrom-Json
  $items = @($current.steps)
  $items += [pscustomobject]@{ name=$name; label=$label; status=$state; startedAt=$started; finishedAt=$finished; output=$output; error=$error }
  $current.steps = $items
  $current.updatedAt = (Get-Date).ToUniversalTime().ToString('o')
  $json = $current | ConvertTo-Json -Depth 12
  $tmp = "$StatusFile.tmp"
  Set-Content -Path $tmp -Value $json -Encoding UTF8
  Move-Item -Force $tmp $StatusFile
}

function Run-Checked($exe, $args) {
  $out = & $exe @args 2>&1 | Out-String
  $code = $LASTEXITCODE
  if ($code -ne 0) { throw "دستور $exe با کد خروج $code شکست خورد.`n$out" }
  return $out.Trim()
}

try {
  Write-State 'running' 'git-pull' '' ''
  $started = (Get-Date).ToUniversalTime().ToString('o')
  Push-Location $ProjectRoot
  try {
    $git = Run-Checked 'git.exe' @('pull','--ff-only','origin',$Branch)
    $head = Run-Checked 'git.exe' @('rev-parse','HEAD')
  } finally { Pop-Location }
  $finished = (Get-Date).ToUniversalTime().ToString('o')
  Add-Step 'git-pull' 'دریافت آخرین تغییرات از GitHub' 'success' $started $finished $git
  $current = Get-Content $StatusFile -Raw | ConvertFrom-Json; $current.commitSha=$head.Trim(); $current.updatedAt=$finished; Set-Content $StatusFile ($current | ConvertTo-Json -Depth 12) -Encoding UTF8

  Write-State 'running' 'build' '' ''
  $started = (Get-Date).ToUniversalTime().ToString('o')
  Push-Location $ProjectRoot
  try { $build = Run-Checked 'npm.cmd' @('run','build') } finally { Pop-Location }
  if (-not (Test-Path (Join-Path $SourceBuild 'index.html'))) { throw "Build موفق گزارش شد اما $SourceBuild\index.html وجود ندارد." }
  $files = @(Get-ChildItem -Path $SourceBuild -Recurse -File)
  if ($files.Count -eq 0) { throw "پوشه build ایجاد شده ولی هیچ فایل خروجی ندارد." }
  $finished = (Get-Date).ToUniversalTime().ToString('o')
  Add-Step 'build' 'ساخت نسخه جدید Frontend' 'success' $started $finished "Build با موفقیت انجام شد. تعداد فایل‌ها: $($files.Count).`n$build"

  Write-State 'running' 'copy-build' '' ''
  $started = (Get-Date).ToUniversalTime().ToString('o')
  New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
  if (Test-Path $BackendBuild) { Move-Item -Path $BackendBuild -Destination $BackupBuild -Force }
  New-Item -ItemType Directory -Force -Path $StageBuild | Out-Null
  Copy-Item -Path (Join-Path $SourceBuild '*') -Destination $StageBuild -Recurse -Force
  if (-not (Test-Path (Join-Path $StageBuild 'index.html'))) { throw 'کپی به پوشه موقت Build ناقص است: index.html پیدا نشد.' }
  Move-Item -Path $StageBuild -Destination $BackendBuild -Force
  $copied = @(Get-ChildItem -Path $BackendBuild -Recurse -File)
  $finished = (Get-Date).ToUniversalTime().ToString('o')
  Add-Step 'copy-build' 'جایگزینی build سرور با Build جدید' 'success' $started $finished "Build جدید با $($copied.Count) فایل در backend\build قرار گرفت. Backup قبلی: $BackupBuild"

  Write-State 'running' 'pm2-restart-scheduled' '' ''
  $started = (Get-Date).ToUniversalTime().ToString('o')
  $restartScript = Join-Path $ProjectRoot "backend\runtime\pm2-restart-$JobId.ps1"
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $restartScript) | Out-Null
  @"
Start-Sleep -Seconds 2
try {
  `$out = & pm2.cmd restart roniya-backend --update-env 2>&1 | Out-String
  `$code = `$LASTEXITCODE
  `$state = Get-Content '$StatusFile' -Raw | ConvertFrom-Json
  `$state.updatedAt = (Get-Date).ToUniversalTime().ToString('o')
  `$state.stage = 'pm2-restart'
  `$state.status = if (`$code -eq 0) { 'success' } else { 'failed' }
  `$state.steps += [pscustomobject]@{ name='pm2-restart'; label='ریستارت PM2 با update-env'; status=if (`$code -eq 0) { 'success' } else { 'failed' }; startedAt=(Get-Date).ToUniversalTime().ToString('o'); finishedAt=(Get-Date).ToUniversalTime().ToString('o'); output=`$out; error=if (`$code -eq 0) { '' } else { `$out } }
  if (`$code -eq 0) { `$state.message = 'بروزرسانی کامل شد و PM2 با موفقیت ریستارت شد.' } else { `$state.message = 'Build و جایگزینی موفق بود اما PM2 restart شکست خورد.' }
  Set-Content '$StatusFile' (`$state | ConvertTo-Json -Depth 12) -Encoding UTF8
} catch {
  `$state = Get-Content '$StatusFile' -Raw | ConvertFrom-Json
  `$state.status='failed'; `$state.stage='pm2-restart'; `$state.message='اجرای PM2 با خطا مواجه شد.'; `$state.lastError=`$_.Exception.Message; Set-Content '$StatusFile' (`$state | ConvertTo-Json -Depth 12) -Encoding UTF8
}
Remove-Item -Force '$restartScript' -ErrorAction SilentlyContinue
"@ | Set-Content -Path $restartScript -Encoding UTF8
  Start-Process powershell.exe -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',$restartScript) -WindowStyle Hidden
  $finished = (Get-Date).ToUniversalTime().ToString('o')
  Add-Step 'pm2-restart' 'ریستارت PM2 با update-env' 'scheduled' $started $finished 'ریستارت پس از پاسخ API و به‌صورت مستقل زمان‌بندی شد تا خود سرویس بتواند نتیجه عملیات را ثبت کند.'
  $current = Get-Content $StatusFile -Raw | ConvertFrom-Json; $current.message='Build و جایگزینی موفق بود؛ ریستارت PM2 زمان‌بندی شد. پنل نتیجه نهایی را پایش می‌کند.'; $current.updatedAt=$finished; Set-Content $StatusFile ($current | ConvertTo-Json -Depth 12) -Encoding UTF8
}
catch {
  $msg = $_.Exception.Message
  try {
    $current = Get-Content $StatusFile -Raw | ConvertFrom-Json
    $current.status='failed'; $current.stage='failed'; $current.message='بروزرسانی متوقف شد و مرحله بعدی اجرا نشد.'; $current.lastError=$msg; $current.updatedAt=(Get-Date).ToUniversalTime().ToString('o')
    $current.steps += [pscustomobject]@{ name='failed'; label='خطای عملیات'; status='failed'; startedAt=(Get-Date).ToUniversalTime().ToString('o'); finishedAt=(Get-Date).ToUniversalTime().ToString('o'); output=''; error=$msg }
    Set-Content $StatusFile ($current | ConvertTo-Json -Depth 12) -Encoding UTF8
  } catch {}
  if (Test-Path $StageBuild) { Remove-Item -Recurse -Force $StageBuild -ErrorAction SilentlyContinue }
  exit 1
}
