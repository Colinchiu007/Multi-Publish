@echo off
chcp 65001 > nul
set PYTHONPATH=%CD%\src;%PYTHONPATH%
python -m uvicorn web.server:app --host 0.0.0.0 --port 8081
