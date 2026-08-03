// @vitest-environment node
'use strict'

const {
  ProviderError,
  ERROR_CODES,
  fromHttpStatus,
  hasStrictContentPolicySignal,
} = require('./provider-error')

describe('ProviderError content-policy classification', () => {
  it('exposes CONTENT_POLICY as a distinct, non-generic provider category', () => {
    const error = new ProviderError(ERROR_CODES.CONTENT_POLICY, 'Provider rejected the request')

    expect(error).toMatchObject({
      code: ERROR_CODES.CONTENT_POLICY,
      category: 'content_policy',
      retryable: false,
    })
  })

  it('only recognizes explicit provider content-policy signals', () => {
    expect(hasStrictContentPolicySignal('content_policy_violation')).toBe(true)
    expect(hasStrictContentPolicySignal('Request was rejected as a result of our safety system.')).toBe(true)
    expect(hasStrictContentPolicySignal('Safety guidelines are available in our documentation.')).toBe(false)
    expect(hasStrictContentPolicySignal('The prompt is invalid.')).toBe(false)
  })

  it('does not turn ordinary 400 and 403 responses into content-policy rejections', () => {
    expect(fromHttpStatus(400, 'Invalid image size').code).toBe(ERROR_CODES.PROVIDER_ERROR)
    expect(fromHttpStatus(403, 'Forbidden').code).toBe(ERROR_CODES.AUTH_FAILED)
  })

  it.each([0, 401, 403, 429])('keeps status %s out of the content-policy path even with a strict signal', (statusCode) => {
    expect(fromHttpStatus(statusCode, 'content_policy_violation', {
      providerCode: 'content_policy_violation',
      contentPolicy: true,
    }).code).not.toBe(ERROR_CODES.CONTENT_POLICY)
  })

  it('maps a strict safety rejection signal to CONTENT_POLICY before the generic HTTP mapping', () => {
    const error = fromHttpStatus(400, 'content_policy_violation', { providerId: 'openai-image' })

    expect(error).toMatchObject({
      code: ERROR_CODES.CONTENT_POLICY,
      category: 'content_policy',
      context: { providerId: 'openai-image', statusCode: 400 },
    })
  })
})