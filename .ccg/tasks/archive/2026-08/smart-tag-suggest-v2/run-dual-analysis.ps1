# 并行运行 opencode + Claude 双模型架构分析
param()
$ErrorActionPreference = 'Continue'

$taskFile = 'C:/tmp/smart-tag-arch-task.txt'
$repo = 'D:/Data/projects/mp-worktrees/mp-smart-tag-suggest-v2'
$wrapper = 'C:/Users/邱领/.claude/bin/codeagent-wrapper.exe'
$task = Get-Content $taskFile -Raw -Encoding UTF8
$nl = [Environment]::NewLine

$opencodePrompt = 'ROLE_FILE: C:/Users/邱领/.claude/.ccg/prompts/opencode/architect.md' + $nl + '<TASK>' + $nl + $task + $nl + '</TASK>' + $nl + 'OUTPUT: 架构设计分析报告（中文）'
$claudePrompt  = 'ROLE_FILE: C:/Users/邱领/.claude/.ccg/prompts/claude/architect.md' + $nl + '<TASK>' + $nl + $task + $nl + '</TASK>' + $nl + 'OUTPUT: 架构设计分析报告（中文）'

$opencodeOut = 'C:/tmp/smart-tag-opencode-arch.txt'
$claudeOut = 'C:/tmp/smart-tag-claude-arch.txt'

$opencodeJob = Start-Job -ScriptBlock {
    param($prompt, $out, $repo, $wrapper)
    $prompt | & $wrapper --progress --backend opencode - $repo 2>&1 | Out-File -FilePath $out -Encoding UTF8
} -ArgumentList $opencodePrompt, $opencodeOut, $repo, $wrapper

$claudeJob = Start-Job -ScriptBlock {
    param($prompt, $out, $repo, $wrapper)
    $prompt | & $wrapper --progress --backend claude - $repo 2>&1 | Out-File -FilePath $out -Encoding UTF8
} -ArgumentList $claudePrompt, $claudeOut, $repo, $wrapper

Write-Output "opencodeJob=$($opencodeJob.Id) claudeJob=$($claudeJob.Id)"
Write-Output "opencodeOut=$opencodeOut"
Write-Output "claudeOut=$claudeOut"
