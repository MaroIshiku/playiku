$ErrorActionPreference = 'Stop'
$suffix = [Guid]::NewGuid().ToString('N').Substring(0, 10)
$container = "playiku-smoke-$suffix"
$restoredContainer = "playiku-restore-$suffix"
$volume = "playiku-data-$suffix"
$restoredVolume = "playiku-restored-$suffix"
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) "playiku-container-$suffix"
$resolvedTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$resolvedTest = [System.IO.Path]::GetFullPath($testRoot)
if (-not $resolvedTest.StartsWith($resolvedTemp, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Temporary path escaped the system temp directory.' }

function Wait-Ready([string]$name) {
  for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
    $status = docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $name 2>$null
    if ($status -eq 'healthy') { return }
    if ($status -eq 'unhealthy' -or $status -eq 'exited') { docker logs $name; throw "Container $name became $status." }
    Start-Sleep -Seconds 1
  }
  docker logs $name
  throw "Container $name did not become healthy."
}

function Start-Playiku([string]$name, [string]$dataVolume, [int]$hostPort) {
  docker run --detach --name $name --read-only --tmpfs /tmp:size=32m,mode=1777 --cap-drop ALL --security-opt no-new-privileges --user 65532:65532 --pids-limit 256 --memory 512m --cpus 1 --publish "127.0.0.1:${hostPort}:8080" --volume "${dataVolume}:/data" --mount "type=bind,source=$testRoot/setup.txt,target=/run/secrets/setup_secret,readonly" --env COOKIE_SECURE=false --env ISHIKU_SETUP_SECRET_FILE=/run/secrets/setup_secret --env TZ=Europe/Berlin playiku:verify | Out-Null
  Wait-Ready $name
}

New-Item -ItemType Directory -Path $testRoot | Out-Null
[System.IO.File]::WriteAllText((Join-Path $testRoot 'setup.txt'), 'synthetic-container-setup-material')
docker volume create $volume | Out-Null
docker volume create $restoredVolume | Out-Null
try {
  Start-Playiku $container $volume 18080
  $inspect = docker inspect $container | ConvertFrom-Json
  if ($inspect[0].Config.User -ne '65532:65532') { throw 'Container is not running as the declared non-root user.' }
  if (-not $inspect[0].HostConfig.ReadonlyRootfs) { throw 'Container root filesystem is writable.' }
  if ($inspect[0].HostConfig.CapDrop -notcontains 'ALL') { throw 'Container capabilities were not dropped.' }
  $ready = Invoke-RestMethod 'http://127.0.0.1:18080/health/ready'
  if ($ready.status -ne 'ready') { throw 'Readiness endpoint failed.' }
  $setupBody = @{ username = 'container-admin'; displayName = 'Container Admin'; password = 'synthetic-container-password'; setupSecret = 'synthetic-container-setup-material' } | ConvertTo-Json
  Invoke-RestMethod 'http://127.0.0.1:18080/api/setup' -Method Post -ContentType 'application/json' -Body $setupBody | Out-Null
  docker stop --time 15 $container | Out-Null
  docker run --rm --user 0 --entrypoint /usr/local/bin/node --volume "${volume}:/source:ro" --mount "type=bind,source=$testRoot,target=/backup" playiku:verify -e "require('node:fs').cpSync('/source','/backup/data',{recursive:true})" | Out-Null
  docker run --rm --user 0 --entrypoint /usr/local/bin/node --volume "${restoredVolume}:/target" --mount "type=bind,source=$testRoot,target=/backup,readonly" playiku:verify -e "const fs=require('node:fs');fs.cpSync('/backup/data','/target',{recursive:true});fs.chownSync('/target',65532,65532);for(const name of fs.readdirSync('/target'))fs.chownSync('/target/'+name,65532,65532)" | Out-Null
  Start-Playiku $restoredContainer $restoredVolume 18081
  $setupState = Invoke-RestMethod 'http://127.0.0.1:18081/api/setup'
  if ($setupState.required) { throw 'Restored database lost first-run state.' }
  $loginBody = @{ username = 'container-admin'; password = 'synthetic-container-password' } | ConvertTo-Json
  $login = Invoke-RestMethod 'http://127.0.0.1:18081/api/session' -Method Post -ContentType 'application/json' -Body $loginBody
  if (-not $login.csrf) { throw 'Restored account could not sign in.' }
  [pscustomobject]@{ status = 'pass'; user = $inspect[0].Config.User; readOnly = $inspect[0].HostConfig.ReadonlyRootfs; capabilitiesDropped = $inspect[0].HostConfig.CapDrop; persistence = 'pass'; backupRestore = 'pass' } | ConvertTo-Json -Depth 3
}
finally {
  foreach ($name in @($container, $restoredContainer)) { if (docker ps --all --quiet --filter "name=^/${name}$") { docker rm --force $name | Out-Null } }
  foreach ($name in @($volume, $restoredVolume)) { if (docker volume ls --quiet --filter "name=^${name}$") { docker volume rm $name | Out-Null } }
  if (Test-Path -LiteralPath $resolvedTest) { Remove-Item -LiteralPath $resolvedTest -Recurse -Force }
}
