<#
.SYNOPSIS
    从根进程出发收集其后代进程树，带 PID 复用防护。

.DESCRIPTION
    调用方（CI 的 Gate 4 / Desktop shards）在 pnpm 退出后用本函数判断"有没有漏下测试子
    进程"，并对结果逐个 `taskkill /T /F`。

    旧实现只按数字 ParentProcessId 递归，而根 PID 在根进程退出后会被 Windows 回收。一旦
    回收者的编号恰好等于某个长命系统进程**所记录的**父 PID，那些开机期就存在的进程就会被
    认成测试子进程 —— 实测 run 36519025075 attempt 1 认出了 csrss.exe / winlogon.exe /
    fontdrvhost.exe / dwm.exe，随后对它们下 taskkill /F（在 runner 上只得到拒绝访问，所以
    表现为一条莫名的红而不是事故）。

    防护用的不变量与进程名、镜像路径都无关：**子进程的创建时间不得早于其父进程**。真实的
    node / electron / python 测试子进程一定晚于其父启动，因此不会被漏掉；而开机期进程永远
    早于任何 runner 进程，因此不可能被认成后代。按名字或路径前缀做黑名单都会漏（工具缓存里
    的 node.exe 不在 workspace 下），故不采用。

.NOTES
    本文件被 dot-source 使用（只提供函数、不执行任何动作），因此刻意不写顶层 param 块。
#>

function Get-TestProcessTree {
    param(
        [Parameter(Mandatory = $true)][int] $RootProcessId,
        # 根进程的创建时间下界锚点（调用方在 Start-Process **之前**取一次 Get-Date）。
        # 缺省为 MinValue = 不启用时间防护，仅用于单元测试里复现旧行为。
        [datetime] $NotBefore = [datetime]::MinValue,
        # 注入点：默认取真实进程表；测试传入构造的 PSCustomObject 数组以做到完全确定。
        [array] $Processes
    )

    if (-not $Processes) { $Processes = @(Get-CimInstance -ClassName Win32_Process) }

    $toDateTime = {
        param ($value, $label)
        # 时间字段读不出来时必须**响亮失败**：静默放行会让这条防护变成恒真的装饰门禁。
        if ($null -eq $value) { throw "[process-tree] $label 缺少 CreationDate，无法判定父子时序" }
        try { return [datetime] $value } catch { throw "[process-tree] $label 的 CreationDate 无法解析: $value" }
    }

    # 刻意用普通数组而非 List[object]：后者与 @() 做 + 会抛 System.ArgumentException
    # "Argument types do not match"（实测），而这里的量级用 += 完全够。
    $accepted = @()
    $rejectedByTime = @()
    $expanded = [System.Collections.Generic.HashSet[int]]::new()
    [void] $expanded.Add($RootProcessId)

    $stack = New-Object System.Collections.Generic.Stack[object]
    $stack.Push(@{ Id = $RootProcessId; Created = $NotBefore })

    while ($stack.Count -gt 0) {
        $node = $stack.Pop()
        foreach ($proc in $Processes) {
            $procId = [int] $proc.ProcessId
            if ($procId -eq $RootProcessId) { continue }
            if ([int] $proc.ParentProcessId -ne $node.Id) { continue }

            $created = & $toDateTime $proc.CreationDate "PID $procId"
            if ($created -lt $node.Created) {
                $rejectedByTime += $proc
                continue
            }
            if (-not $expanded.Add($procId)) { continue }

            $accepted += $proc
            $stack.Push(@{ Id = $procId; Created = $created })
        }
    }

    # 根进程若仍在表里就一并返回（与旧实现一致：那意味着根其实没退出）。
    $root = @($Processes | Where-Object { [int] $_.ProcessId -eq $RootProcessId })
    $result = @($root) + @($accepted)

    Write-Host ("[process-tree] scanned={0} descendants={1} rejected-by-time={2} root={3} notBefore={4}" -f `
        @($Processes).Count, $accepted.Count, $rejectedByTime.Count, $RootProcessId, $NotBefore.ToString('o'))

    return $result
}
