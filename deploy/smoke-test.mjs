// Run inside the web container after deploy:
//   docker compose exec web node deploy/smoke-test.mjs
// Uses forged credentials only; never writes portfolio records.
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:8787';
const get = (path, headers = {}) => fetch(base + path, {headers, redirect: 'manual'});

let response = await get('/');
assert.ok([302, 307].includes(response.status), 'anonymous / redirects');
assert.ok(response.headers.get('location').startsWith('/login'), 'redirect target is /login');
console.log('PASS anonymous dashboard redirects to /login');

response = await get('/api/portfolio');
assert.equal(response.status, 401, 'anonymous API');
console.log('PASS anonymous API is 401');

response = await get('/api/portfolio', {'Oai-Authenticated-User-Id': 'fake', 'Oai-Authenticated-User-Email': 'fake@example.com'});
assert.equal(response.status, 401, 'legacy ChatGPT headers are ignored');
console.log('PASS spoofed ChatGPT headers are ignored');

response = await get('/api/portfolio', {Cookie: 'wmu_session=eyJlbWFpbCI6ImZha2VAZXhhbXBsZS5jb20iLCJleHAiOjk5OTk5OTk5OTk5OTl9.forged'});
assert.equal(response.status, 401, 'forged session cookie');
console.log('PASS forged session cookie is rejected');

response = await get('/auth/google/callback?code=x&state=y');
assert.equal(response.status, 302, 'callback without state redirects');
assert.equal(response.headers.get('location'), '/login?error=failed');
console.log('PASS callback without a pending state fails safely');

response = await fetch(base + '/auth/logout', {method: 'POST', headers: {Origin: 'https://invalid.example'}, redirect: 'manual'});
assert.equal(response.status, 403, 'cross-origin logout');
console.log('PASS cross-origin logout is refused');

response = await get('/auth/google/login');
assert.equal(response.status, 302, 'login route configured');
assert.ok(response.headers.get('location').startsWith('https://accounts.google.com/o/oauth2/v2/auth?'), 'redirects to Google');
console.log('PASS Google login is configured');
