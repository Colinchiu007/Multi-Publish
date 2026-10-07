/**
 * Identity diagnostics copy (technical details + one-click copy).
 *
 * Split out of locales/en.js, kept inside the `memberCenter` namespace on purpose:
 * component code still calls `t('memberCenter.diagnosticsXxx')` unchanged.
 *
 * ⚠️ zh/en must be edited together — check-locale-sync.js --pair-base pairs
 *    zh.js/en.js per directory, and --keys only follows default relative imports
 *    (so this file must stay a default export).
 */
export default {
  // ─── Network failure variants — each gives an actionable next step ───
  // Hard constraint: TLS copy must NEVER suggest disabling certificate
  // validation — that is a security hole. The fix is an IT allowlist entry.
  networkUnavailable: 'The network is temporarily unavailable. Please try again shortly.',
  networkTlsBlocked: 'A secure connection could not be established — your network may be intercepting traffic (corporate proxy, antivirus HTTPS scanning, or VPN). Do NOT disable certificate validation: that would expose your credentials to intermediary devices. Ask your IT team to allowlist the service address instead.',
  networkDnsFailed: 'Could not reach the service address. Your device may be offline or DNS may be misconfigured. Check your network connection and restart your router.',
  networkTimeout: 'The connection timed out. The network may be slow or the service busy. Try again shortly; if it persists, try a different network (e.g. a phone hotspot).',
  networkProxyBlocked: 'A proxy or network accelerator appears to be blocking the connection. Try disabling it, or allowlist this application in your proxy.',

  // ─── Technical details + one-click copy ───
  diagnosticsShow: 'Technical details',
  diagnosticsHide: 'Hide technical details',
  diagnosticsLoading: 'Loading diagnostics…',
  diagnosticsEmpty: 'No diagnostics available.',
  diagnosticsCopy: 'Copy diagnostics',
  diagnosticsCopied: 'Copied — paste it to us',
  diagnosticsCopyFailed: 'Copy failed. Please select the text above and copy manually.',
}