# Ops Center Prompt Evaluation Specification

## Purpose
Define the security and error-handling contract for prompt-evaluation provider keys in the Ops Center backend.

## Requirements

### Requirement: Provider-key encryption uses the loaded Ops Center configuration
The prompt-evaluation provider-key API SHALL obtain its encryption secret from the loaded Ops Center settings instance. It SHALL NOT depend on the dotenv value being copied into the process environment, and it SHALL NOT create or replace the configured secret while saving a provider key.

#### Scenario: dotenv-loaded secret is not exported to process environment
- **WHEN** OPS_SECRET_KEY is loaded from the backend .env file but is absent from os.environ
- **THEN** an administrator can save a valid prompt-evaluation provider key and receives HTTP 200

### Requirement: Invalid provider-key encryption configuration returns an actionable client error
The provider-key API SHALL preserve fail-closed encryption validation. A missing or insecure OPS_SECRET_KEY SHALL return HTTP 400 with a non-secret error that identifies the configuration requirement; unexpected persistence failures SHALL remain server errors.

#### Scenario: missing encryption secret
- **WHEN** an administrator saves a provider key while the loaded OPS_SECRET_KEY is missing or insecure
- **THEN** the API returns HTTP 400 and its detail identifies OPS_SECRET_KEY
