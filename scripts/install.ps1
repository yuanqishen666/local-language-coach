# Yujian installer for Windows.
#
#   irm https://raw.githubusercontent.com/yuanqishen666/local-language-coach/main/scripts/install.ps1 | iex
#
# It downloads the app into %USERPROFILE%\yujian, and when this computer has no Node.js new enough it
# puts a private copy of Node.js inside that folder (.runtime\node) without touching the system.
# Running it again updates the app; the data folder is never touched.
#
#   $env:YUJIAN_DIR          where to install (default: %USERPROFILE%\yujian)
#   $env:YUJIAN_NO_START=1   install without starting
#   $env:YUJIAN_GITHUB_MIRROR prefix GitHub URLs with a public proxy, for example https://gh-proxy.com
#   $env:YUJIAN_NODE_MIRROR  where to download Node.js from (default: https://nodejs.org/dist)
#
# This file is plain ASCII so that it reads the same under every console code page. Each message is
# given in English and then in Chinese, the Chinese written as \uXXXX and decoded when it is shown.

function Install-Yujian {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

  $repo = 'yuanqishen666/local-language-coach'
  $branch = if ($env:YUJIAN_BRANCH) { $env:YUJIAN_BRANCH } else { 'main' }
  $dir = if ($env:YUJIAN_DIR) { $env:YUJIAN_DIR } else { Join-Path $HOME 'yujian' }
  $minimum = [version]'22.13.0'
  $line = 'latest-v22.x'
  $zh = (Get-UICulture).Name -like 'zh*'
  $githubMirror = if ($env:YUJIAN_GITHUB_MIRROR) { $env:YUJIAN_GITHUB_MIRROR.TrimEnd('/') } else { '' }

  # Text <english> <chinese> [values for {0}, {1}]
  function Text([string]$english, [string]$chinese) {
    $text = if ($zh) { [regex]::Unescape($chinese) } else { $english }
    return ($text -f $args)
  }

  function GitHub-Url([string]$url) {
    if ($githubMirror) { return "$githubMirror/$url" }
    return $url
  }

  function Throw-GitHubDownloadFailure([string]$target) {
    if ($githubMirror) {
      throw (Text 'Could not download through {0}. This is a third-party community proxy and may be unavailable; try another network or download the ZIP manually.' '\u6ca1\u6709\u901a\u8fc7 {0} \u4e0b\u8f7d\u6210\u529f\u3002\u5b83\u662f\u7b2c\u4e09\u65b9\u516c\u76ca\u4ee3\u7406\uff0c\u53ef\u80fd\u6682\u65f6\u4e0d\u53ef\u7528\uff1b\u8bf7\u66f4\u6362\u7f51\u7edc\uff0c\u6216\u624b\u52a8\u4e0b\u8f7d ZIP\u3002' $githubMirror)
    }
    throw (Text 'Could not download from github.com. Check the network and run this again. On a mainland China network, copy the fallback command from the README; it uses gh-proxy.com for this public repository and npmmirror for Node.js. You can also download the ZIP manually, unpack it into {0}, and run this again.' '\u6ca1\u6709\u4ece github.com \u4e0b\u8f7d\u6210\u529f\u3002\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u65b0\u8fd0\u884c\u3002\u4e2d\u56fd\u5927\u9646\u7f51\u7edc\u53ef\u590d\u5236 README \u91cc\u7684\u5907\u7528\u547d\u4ee4\uff1a\u5b83\u901a\u8fc7 gh-proxy.com \u4e0b\u8f7d\u672c\u516c\u5f00\u4ed3\u5e93\uff0c\u901a\u8fc7 npmmirror \u4e0b\u8f7d Node.js\u3002\u4e5f\u53ef\u4ee5\u624b\u52a8\u4e0b\u8f7d ZIP\uff0c\u89e3\u538b\u5230 {0} \u540e\u91cd\u65b0\u8fd0\u884c\u3002' $target)
  }

  function Throw-NodeDownloadFailure {
    if ($env:YUJIAN_NODE_MIRROR) {
      throw (Text 'Could not download Node.js through {0}. Change YUJIAN_NODE_MIRROR or try another network, then run this again.' '\u6ca1\u6709\u901a\u8fc7 {0} \u4e0b\u8f7d\u5230 Node.js\u3002\u8bf7\u66f4\u6362 YUJIAN_NODE_MIRROR \u6216\u7f51\u7edc\u540e\u91cd\u65b0\u8fd0\u884c\u3002' $env:YUJIAN_NODE_MIRROR)
    }
    throw (Text 'Could not download Node.js from nodejs.org. On a mainland China network, set YUJIAN_NODE_MIRROR=https://npmmirror.com/mirrors/node and run this again.' '\u6ca1\u6709\u4ece nodejs.org \u4e0b\u8f7d\u5230 Node.js\u3002\u4e2d\u56fd\u5927\u9646\u7f51\u7edc\u8bf7\u8bbe\u7f6e YUJIAN_NODE_MIRROR=https://npmmirror.com/mirrors/node \u540e\u91cd\u65b0\u8fd0\u884c\u3002')
  }

  function Test-Node([string]$exe) {
    try {
      $found = & $exe -p 'process.versions.node' 2>$null
      return ($LASTEXITCODE -eq 0) -and ([version]"$found".Trim() -ge $minimum)
    } catch {
      return $false
    }
  }

  $tmp = Join-Path ([IO.Path]::GetTempPath()) ('yujian-' + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  try {
    $manifest = Join-Path $dir 'package.json'
    $isYujian = (Test-Path $manifest) -and ((Get-Content $manifest -Raw) -match '"name":\s*"local-language-coach"')
    $git = Get-Command git -ErrorAction SilentlyContinue
    $unpack = $true
    if ($isYujian) {
      Write-Host (Text 'Updating the app in {0}' '\u6b63\u5728\u66f4\u65b0 {0} \u91cc\u7684\u5e94\u7528' $dir)
      if ((Test-Path (Join-Path $dir '.git')) -and $git) {
        if ($githubMirror) {
          & git -C $dir -c "url.$githubMirror/https://github.com/.insteadOf=https://github.com/" pull --ff-only
        } else {
          & git -C $dir pull --ff-only
        }
        if ($LASTEXITCODE -ne 0) {
          Write-Host (Text 'Could not update from github.com; keeping the copy that is already there.' '\u6ca1\u6709\u4ece github.com \u66f4\u65b0\u6210\u529f\uff0c\u7ee7\u7eed\u4f7f\u7528\u73b0\u6709\u7684\u7248\u672c\u3002')
        }
        $unpack = $false
      }
    } elseif ((Test-Path $dir) -and (Get-ChildItem -Force $dir | Select-Object -First 1)) {
      throw (Text '{0} already exists and holds something else. Set $env:YUJIAN_DIR to another folder and run this again.' '{0} \u5df2\u7ecf\u5b58\u5728\uff0c\u91cc\u9762\u662f\u522b\u7684\u5185\u5bb9\u3002\u8bf7\u628a $env:YUJIAN_DIR \u8bbe\u4e3a\u53e6\u4e00\u4e2a\u6587\u4ef6\u5939\u540e\u91cd\u65b0\u8fd0\u884c\u3002' $dir)
    } else {
      Write-Host (Text 'Downloading the app into {0}' '\u6b63\u5728\u628a\u5e94\u7528\u4e0b\u8f7d\u5230 {0}' $dir)
      if ($git -and -not $githubMirror) {
        $cloneUrl = (GitHub-Url "https://github.com/$repo") + '.git'
        & git clone --depth 1 --branch $branch $cloneUrl $dir
        if ($LASTEXITCODE -ne 0) {
          Throw-GitHubDownloadFailure $dir
        }
        $unpack = $false
      }
    }
    if ($unpack) {
      # Without git: unpack the source archive over the folder. The data folder is not part of the archive.
      $zip = Join-Path $tmp 'app.zip'
      $fetched = $true
      try {
        $archiveUrl = GitHub-Url "https://github.com/$repo/archive/refs/heads/$branch.zip"
        Invoke-WebRequest -UseBasicParsing -Uri $archiveUrl -OutFile $zip
      } catch {
        $fetched = $false
      }
      if ($fetched) {
        Expand-Archive -Path $zip -DestinationPath (Join-Path $tmp 'app') -Force
        $inner = Get-ChildItem (Join-Path $tmp 'app') | Select-Object -First 1
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
        Copy-Item -Path (Join-Path $inner.FullName '*') -Destination $dir -Recurse -Force
      } elseif ($isYujian) {
        Write-Host (Text 'Could not update from github.com; keeping the copy that is already there.' '\u6ca1\u6709\u4ece github.com \u66f4\u65b0\u6210\u529f\uff0c\u7ee7\u7eed\u4f7f\u7528\u73b0\u6709\u7684\u7248\u672c\u3002')
      } else {
        Throw-GitHubDownloadFailure $dir
      }
    }

    $runtime = Join-Path $dir '.runtime\node'
    $hasNode = (Get-Command node -ErrorAction SilentlyContinue) -and (Get-Command npm -ErrorAction SilentlyContinue)
    if ($hasNode -and (Test-Node 'node')) {
      # The Node.js already on this computer is new enough.
    } elseif ((Test-Path (Join-Path $runtime 'node.exe')) -and (Test-Node (Join-Path $runtime 'node.exe'))) {
      $env:PATH = "$runtime;$env:PATH"
    } else {
      $machine = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
      $arch = switch ($machine) { 'AMD64' { 'x64' } 'ARM64' { 'arm64' } default { '' } }
      if (-not $arch) {
        throw (Text 'There is no ready-made Node.js for this system. Install Node.js {0} or newer yourself, then run this again.' '\u6ca1\u6709\u9002\u5408\u8fd9\u53f0\u7535\u8111\u7684\u73b0\u6210 Node.js\u3002\u8bf7\u81ea\u884c\u5b89\u88c5 Node.js {0} \u6216\u66f4\u65b0\u7684\u7248\u672c\u540e\u91cd\u65b0\u8fd0\u884c\u3002' '22.13')
      }
      Write-Host (Text 'Node.js {0} or newer was not found. Downloading a private copy into {1} (about 35 MB; unpacking takes a minute or two)' '\u6ca1\u6709\u627e\u5230 Node.js {0} \u6216\u66f4\u65b0\u7684\u7248\u672c\uff0c\u6b63\u5728\u4e0b\u8f7d\u4e00\u4efd\u53ea\u4f9b\u8bed\u89c1\u4f7f\u7528\u7684\u5230 {1}\uff08\u7ea6 35 MB\uff0c\u89e3\u538b\u8981\u4e00\u4e24\u5206\u949f\uff09' '22.13' $runtime)
      $mirror = if ($env:YUJIAN_NODE_MIRROR) { $env:YUJIAN_NODE_MIRROR.TrimEnd('/') } else { 'https://nodejs.org/dist' }
      $sums = Join-Path $tmp 'sums.txt'
      try {
        Invoke-WebRequest -UseBasicParsing -Uri "$mirror/$line/SHASUMS256.txt" -OutFile $sums
      } catch {
        Throw-NodeDownloadFailure
      }
      $pattern = '^([0-9a-f]{64})\s+(node-v[0-9.]+-win-' + $arch + '\.zip)$'
      $entry = Get-Content $sums | Where-Object { $_ -match $pattern } | Select-Object -First 1
      if (-not $entry) {
        throw (Text 'Could not read the list of Node.js downloads.' '\u6ca1\u6709\u8bfb\u5230 Node.js \u7684\u4e0b\u8f7d\u5217\u8868\u3002')
      }
      $null = $entry -match $pattern
      $want = $Matches[1]
      $file = $Matches[2]
      $nodeZip = Join-Path $tmp 'node.zip'
      try {
        Invoke-WebRequest -UseBasicParsing -Uri "$mirror/$line/$file" -OutFile $nodeZip
      } catch {
        Throw-NodeDownloadFailure
      }
      $got = (Get-FileHash -Algorithm SHA256 -Path $nodeZip).Hash.ToLowerInvariant()
      if ($got -ne $want) {
        throw (Text 'The Node.js download does not match its checksum. Nothing was installed; run this again.' 'Node.js \u7684\u4e0b\u8f7d\u6587\u4ef6\u4e0e\u6821\u9a8c\u503c\u4e0d\u4e00\u81f4\uff0c\u6ca1\u6709\u5b89\u88c5\u3002\u8bf7\u91cd\u65b0\u8fd0\u884c\u3002')
      }
      Expand-Archive -Path $nodeZip -DestinationPath (Join-Path $tmp 'node') -Force
      $unpacked = Get-ChildItem (Join-Path $tmp 'node') | Select-Object -First 1
      if (Test-Path $runtime) { Remove-Item -Recurse -Force $runtime }
      New-Item -ItemType Directory -Force -Path (Split-Path $runtime) | Out-Null
      Copy-Item -Path $unpacked.FullName -Destination $runtime -Recurse -Force
      $env:PATH = "$runtime;$env:PATH"
    }
  } finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  }

  Write-Host (Text 'Installed in {0}. Next time, start it with {1}' '\u5df2\u5b89\u88c5\u5230 {0}\u3002\u4ee5\u540e\u7528 {1} \u542f\u52a8' $dir (Join-Path $dir 'start-app.cmd'))
  if ($env:YUJIAN_NO_START -eq '1') { return }
  Set-Location $dir
  & npm.cmd start
}

# The whole file is read before anything runs, so a download that breaks off does nothing.
try {
  Install-Yujian
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
}
