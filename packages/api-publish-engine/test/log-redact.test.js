// log-redact unit tests
const assert = require('assert')
const { redactText } = require('../src/log-redact')
let p = 0, f = 0
function t(n, fn) { try { fn(); p++; console.log('  \u2705 ' + n) } catch (e) { f++; console.log('  \u274C ' + n + ': ' + (e && e.message ? e.message : e)) } }
function eq(a, b) { assert.strictEqual(a, b) }

console.log('=== log-redact ===')

t('redacts Bearer token', function() {
  eq(redactText('Authorization: Bearer abc123def456'), 'Authorization: Bearer ***')
})
t('redacts apiKey in JSON', function() {
  eq(redactText('{"apiKey":"sk-secret-xyz"}'), '{"apiKey":"***"}')
})
t('redacts access_token', function() {
  eq(redactText('access_token=token123'), 'access_token=***')
})
t('redacts refresh_token', function() {
  eq(redactText('"refresh_token":"rt-abc"'), '"refresh_token":"***"')
})
t('redacts password', function() {
  eq(redactText('password: "p@ss"'), 'password: "***"')
})
t('redacts cookie value', function() {
  eq(redactText('"cookie":"sessionid=abc"'), '"cookie":"***"')
})
t('redacts sk- prefix', function() {
  eq(redactText('sk-abcdefgh123456'), 'sk-abcd***')
})
t('redacts generic JWT', function() {
  eq(redactText('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.sig12345'), 'eyJ***')
})
t('no false positive on plain text', function() {
  eq(redactText('hello world ok'), 'hello world ok')
})
t('redacts bare token key (no access_/refresh_ prefix)', function() {
  eq(redactText('token=raw-token-value'), 'token=***')
  eq(redactText('"token":"raw-token-value"'), '"token":"***"')
})
t('redacts sid / session / pwd keys', function() {
  eq(redactText('sid=sid-99887766'), 'sid=***')
  eq(redactText('"session":"sess-secret"'), '"session":"***"')
  eq(redactText('pwd: "plain-pass"'), 'pwd: "***"')
})
t('redacts CN mobile number', function() {
  eq(redactText('user phone 13812345678 ok'), 'user phone *** ok')
})
t('null safe', function() {
  eq(redactText(null), '')
})

setTimeout(function() { console.log('\n========== ' + p + '/' + (p + f) + ' =========='); if (f) process.exit(1) }, 100)
