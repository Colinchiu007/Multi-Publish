## Tasks
- [x] Add regression test for configuration-loaded and missing provider-key encryption secrets (ops-center/backend/tests/test_prompt_eval_api.py test_provider_key_uses_loaded_settings_secret_when_environment_is_missing and test_provider_key_reports_missing_encryption_secret_as_bad_request).
- [x] Use the loaded application settings secret, map expected encryption configuration errors to HTTP 400, and import IntegrityError for the existing duplicate-key recovery path.
- [x] Run targeted tests (28 passed), validate the change, and complete review (dual-model backend unavailable; local review recorded in .ccg/tasks/fix-ops-center-provider-key-save/review.md).
