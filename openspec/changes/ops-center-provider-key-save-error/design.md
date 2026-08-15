# Design

The router maps expected encryption configuration failures to HTTP 400 with a non-secret remediation message. Unexpected persistence failures remain server errors. The service keeps fail-closed validation and never generates or replaces `OPS_SECRET_KEY`.
