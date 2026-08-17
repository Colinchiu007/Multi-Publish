import { createApiClient } from './http'

const api = createApiClient()

export function listFeedback(params = {}) {
  return api.get('/feedback', {
    params: {
      limit: params.limit ?? 20,
      offset: params.offset ?? 0,
    },
  }).then(response => response.data)
}

export function getFeedback(feedbackId) {
  return api.get(`/feedback/${encodeURIComponent(feedbackId)}`).then(response => response.data)
}

// Keep the response headers so the view can honor the server-provided filename.
export function downloadFeedbackAttachment(feedbackId) {
  return api.get(`/feedback/${encodeURIComponent(feedbackId)}/attachment`, {
    responseType: 'blob',
  })
}
