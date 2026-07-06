@echo off
cd /d D:\Data\projects\Multi-Publish
echo.
echo === ^[1/4^] GIT: 提交 86 个变更文件 ===
echo.
git add -A
git commit -m "feat: TS 迁移 Phase 3 -- 86/86 JS 文件添加 @ts-check"
if %ERRORLEVEL% neq 0 echo WARN: commit 可能部分失败
echo.
echo === ^[2/4^] TEST: Electron 测试 ===
echo.
cd apps\desktop
call npm test
echo.
echo === ^[3/4^] TEST: Vue 测试 ===
call npm run test:vue
echo.
echo === ^[4/4^] GIT: 更新 PR 分支 ===
cd ..\..
git checkout fix/test-infra
git merge main --ff-only
git push origin fix/test-infra
git checkout main
echo.
echo ====== ALL DONE ======
echo Create PR: https://github.com/Colinchiu007/Multi-Publish/pull/new/fix/test-infra
pause
