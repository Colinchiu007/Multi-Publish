# Provider key save error

## Why
Saving a prompt-evaluation provider key returns HTTP 500 when `OPS_SECRET_KEY` is absent or unsafe.

## What Changes
- Return a safe actionable client error for missing encryption configuration.
- Preserve fail-closed encryption behavior and existing key material.
- Add regression coverage for the configuration-error path.
