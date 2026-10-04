// the powershell the windows collector keeps running. starting powershell costs half a second, so one copy loops
// and prints a json line each interval, the medium and slow reads riding along every fifth and thirtieth line. it
// takes no input: the only thing ever put into it is the interval, a number this extension chose. cim classes are
// used rather than counter paths, which windows translates on a non-english install
export function windowsScript(intervalMs: number): string {
  const interval = Math.max(500, Math.min(10_000, Math.round(intervalMs)));
  return `
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
$interval = ${interval}
$tick = 0
$nvsmi = (Get-Command nvidia-smi.exe -ErrorAction SilentlyContinue).Source
$pinger = New-Object System.Net.NetworkInformation.Ping
$ifIndex = $null
$ifName = $null

function Find-Route {
  $r = Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object { $_.RouteMetric + $_.InterfaceMetric } | Select-Object -First 1
  if ($r) {
    $script:ifIndex = $r.InterfaceIndex
    $script:ifName = (Get-NetAdapter -InterfaceIndex $r.InterfaceIndex).Name
  }
}
Find-Route

while ($true) {
  $started = Get-Date
  $o = @{ tick = $tick; fast = @{} }

  if ($ifName) {
    $s = Get-NetAdapterStatistics -Name $ifName
    if ($s) { $o.fast.rx = [double]$s.ReceivedBytes; $o.fast.tx = [double]$s.SentBytes }
  }
  $perf = Get-CimInstance Win32_PerfFormattedData_Counters_ProcessorInformation -Filter "Name='_Total'"
  if ($perf) { $o.fast.cpuPerf = [double]$perf.PercentProcessorPerformance }
  if ($nvsmi) { $o.fast.nvidia = (& $nvsmi --query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total,clocks.gr,power.draw,fan.speed --format=csv,noheader,nounits | Out-String) }

  if ($tick % 5 -eq 0) {
    Find-Route
    $m = @{}
    $m.processes = @(Get-CimInstance Win32_PerfFormattedData_PerfProc_Process |
      Where-Object { $_.Name -ne '_Total' -and $_.Name -ne 'Idle' } |
      Sort-Object PercentProcessorTime -Descending | Select-Object -First 25 |
      ForEach-Object { @{ name = $_.Name; pid = [int]$_.IDProcess; cpu = [double]$_.PercentProcessorTime; bytes = [double]$_.WorkingSetPrivate } })
    $m.disks = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' |
      ForEach-Object { @{ id = $_.DeviceID; label = $_.VolumeName; size = [double]$_.Size; free = [double]$_.FreeSpace } })
    $io = Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk -Filter "Name='_Total'"
    if ($io) { $m.readBps = [double]$io.DiskReadBytesPersec; $m.writeBps = [double]$io.DiskWriteBytesPersec }
    $b = Get-CimInstance Win32_Battery | Select-Object -First 1
    if ($b) { $m.battery = @{ percent = [int]$b.EstimatedChargeRemaining; status = [int]$b.BatteryStatus } }
    $mem = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory
    if ($mem) { $m.cachedBytes = [double]$mem.StandbyCacheCoreBytes + [double]$mem.StandbyCacheNormalPriorityBytes + [double]$mem.StandbyCacheReserveBytes + [double]$mem.ModifiedPageListBytes }
    try { $p = $pinger.Send('1.1.1.1', 2000); if ($p.Status -eq 'Success') { $m.ping = [double]$p.RoundtripTime } } catch {}
    $wlan = (netsh wlan show interfaces | Out-String)
    if ($wlan) { $m.wlan = $wlan }
    if (-not $nvsmi) {
      $engines = Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine | Where-Object { $_.Name -like '*engtype_3D*' }
      if ($engines) { $m.gpuUsage = [double](($engines | Measure-Object -Property UtilizationPercentage -Sum).Sum) }
    }
    $o.medium = $m
  }

  if ($tick % 30 -eq 0) {
    $sl = @{}
    $os = Get-CimInstance Win32_OperatingSystem
    if ($os) { $sl.os = $os.Caption; $sl.version = $os.Version; $sl.build = $os.BuildNumber }
    $cpus = @(Get-CimInstance Win32_Processor)
    if ($cpus.Count -gt 0) {
      $sl.cpu = @{ name = $cpus[0].Name.Trim(); cores = [int](($cpus | Measure-Object -Property NumberOfCores -Sum).Sum); threads = [int](($cpus | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum); maxMhz = [int]$cpus[0].MaxClockSpeed }
    }
    $sl.gpus = @(Get-CimInstance Win32_VideoController | ForEach-Object { @{ name = $_.Name; width = [int]$_.CurrentHorizontalResolution; height = [int]$_.CurrentVerticalResolution; hz = [int]$_.CurrentRefreshRate } })
    if ($ifIndex) {
      $a = Get-NetAdapter -InterfaceIndex $ifIndex
      if ($a) { $sl.adapter = @{ name = $a.Name; description = $a.InterfaceDescription; bps = [double]$a.ReceiveLinkSpeed; media = [string]$a.PhysicalMediaType } }
      $sl.ips = @(Get-NetIPAddress -InterfaceIndex $ifIndex | ForEach-Object { @{ address = $_.IPAddress; family = [string]$_.AddressFamily } })
    }
    $sl.models = @{}
    foreach ($d in (Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3')) {
      $part = Get-Partition -DriveLetter $d.DeviceID.Substring(0, 1)
      if ($part) {
        $disk = Get-PhysicalDisk | Where-Object { $_.DeviceId -eq [string]$part.DiskNumber } | Select-Object -First 1
        if ($disk) { $sl.models[$d.DeviceID] = $disk.FriendlyName }
      }
    }
    $full = (Get-CimInstance -Namespace root\\wmi -ClassName BatteryFullChargedCapacity | Select-Object -First 1).FullChargedCapacity
    $design = (Get-CimInstance -Namespace root\\wmi -ClassName BatteryStaticData | Select-Object -First 1).DesignedCapacity
    $cycles = (Get-CimInstance -Namespace root\\wmi -ClassName BatteryCycleCount | Select-Object -First 1).CycleCount
    if ($full -and $design) { $sl.batteryHealth = [int](100 * $full / $design) }
    if ($cycles) { $sl.batteryCycles = [int]$cycles }
    $o.slow = $sl
  }

  [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress -Depth 6))
  [Console]::Out.Flush()
  $tick++
  $spent = ((Get-Date) - $started).TotalMilliseconds
  Start-Sleep -Milliseconds ([int][Math]::Max(50, $interval - $spent))
}
`;
}

/** powershell's -EncodedCommand takes base64 of utf-16le, which spares the script every quoting rule */
export function encodePowerShell(script: string): string {
  const bytes = new Uint8Array(script.length * 2);
  for (let i = 0; i < script.length; i++) {
    const c = script.charCodeAt(i);
    bytes[i * 2] = c & 0xff;
    bytes[i * 2 + 1] = c >> 8;
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
