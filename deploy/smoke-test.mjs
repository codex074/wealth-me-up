// Run inside the web container: node deploy/smoke-test.mjs
// Uses intentionally invalid bodies; never writes portfolio records.
import assert from 'node:assert/strict';

const owner = 'deployment-test@example.invalid';
const endpoint = 'http://wealth-me-up-proxy/api/portfolio';
const cases = [
  ['anonymous', {}, 403],
  ['spoofed app identity', {'Oai-Authenticated-User-Id': 'fake', 'Oai-Authenticated-User-Email': 'fake@example.com'}, 403],
  ['email without JWT', {'Cf-Access-Authenticated-User-Email': 'fake@example.com'}, 403],
];
for (const [name, headers, expected] of cases) {
  const response = await fetch(endpoint, {headers});
  assert.equal(response.status, expected, name);
  console.log(`PASS ${name}`);
}
for (const [origin, expected] of [
  ['https://wealth-me-up.codex074.com', 400],
  ['https://invalid.example', 403],
]) {
  const response = await fetch(endpoint, {
    method: 'PUT',
    // Connector JWT verification is tested separately through the public URL.
    headers: {'Cf-Access-Authenticated-User-Email': owner, 'Cf-Access-Jwt-Assertion': 'synthetic-internal-proxy-test', Origin: origin, 'Content-Type': 'application/json'},
    body: '{}',
  });
  assert.equal(response.status, expected, `origin ${origin}`);
  console.log(`PASS origin ${origin}`);
}
