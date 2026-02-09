

---

## Section 0: QA Bot Protocol — Deployment Verification

### 0.1 Pre-Fix Verification (REQUIRED)

**CRITICAL:** Before attempting any fixes, the QA bot MUST verify deployment status.

#### Step 1: Check Latest Deployment Status
```
1. Query GitHub Actions API for recent runs
2. Identify the latest deployment run (staging/production)
3. Check run status: success / failure / in_progress
4. Report status to user BEFORE proceeding
```

**Status Check Flowchart:**
```
Latest Run Status = ?
├── "success" → Report "✅ Deployment successful" → Proceed to functional QA
├── "failure" → Report "❌ Deployment failed" → Analyze logs → THEN fix
├── "in_progress" → Report "⏳ Deployment in progress" → Wait for completion
└── "cancelled/skipped" → Report "⚠️ Deployment not completed" → Investigate
```

#### Step 2: Log Analysis (Only if Failed)
If deployment failed:
```
1. Download run logs via GitHub API
2. Identify which step failed:
   - Validate Code
   - Deploy Worker
   - Run Migrations
   - Deploy Pages
3. Extract specific error messages
4. Determine root cause
```

#### Step 3: Fix Protocol (Only after verification)
```
IF deployment_failed AND root_cause_identified:
    1. Propose fix to user
    2. Get explicit approval before implementing
    3. Apply fix
    4. Verify fix with new deployment
ELSE:
    Report "No fix needed — deployment successful" or "Cannot fix — root cause unclear"
```

### 0.2 QA Bot Checklist

**MUST DO before any action:**
- [ ] Query GitHub Actions for latest run status
- [ ] Report deployment status clearly (success/failure/in-progress)
- [ ] Only proceed to fixes if deployment actually failed
- [ ] Get user approval before implementing fixes

**MUST NOT do:**
- [ ] Skip status check and go straight to fixing
- [ ] Assume deployment failed without verification
- [ ] Apply fixes without user approval
- [ ] Mix deployment analysis with functional QA

### 0.3 Reporting Template

```
## Deployment Status Report

**Repository:** rjmcgirr-pl/pl-openclaw-dashboard
**Checked At:** [timestamp]

### Latest Deployment Run
- **Run ID:** [run_id]
- **Workflow:** [workflow_name]
- **Status:** [success/failure/in_progress]
- **Duration:** [duration]
- **Commit:** [commit_message]

### Findings
[If success]: ✅ Deployment completed successfully. Ready for functional QA.
[If failure]: ❌ Deployment failed at step: [step_name]
            Error: [error_summary]
            Proposed fix: [description]

### Recommended Action
[Based on status — wait/proceed/fix]
```

---

## Section 5: JWT Authentication Test Suite

### 5.1 Authentication Methods Overview

The taskboard supports three authentication methods:
1. **Google OAuth** — For human users (browser-based)
2. **JWT Bearer Token** — For API/automation access (primary)
3. **API Key** (X-Agent-API-Key) — For agent automation (fallback)

### 5.2 JWT Authentication Test Cases

#### Test 5.2.1: Public Route Accessibility
**Purpose:** Verify public auth routes are accessible without authentication

| Endpoint | Method | Expected Status | Expected Response |
|----------|--------|-----------------|-------------------|
| `/auth/google` | GET | 302 | Redirect to Google OAuth |
| `/auth/google/callback` | GET | 400/401 | Missing params (not 500) |
| `/auth/login` | POST | 401 | Invalid credentials error |
| `/auth/refresh` | POST | 401 | Invalid refresh token |

**Test Steps:**
1. Call each endpoint without any auth headers
2. Verify response status codes match expected
3. Verify protected routes return 401 (not 500)

**Pass Criteria:**
- [ ] `/auth/google` returns 302 redirect
- [ ] `/auth/login` returns 401 (not "Authentication required" error)
- [ ] No "catch-22" where login requires pre-authentication

---

#### Test 5.2.2: JWT Login Flow
**Purpose:** Verify JWT token generation and validation

**Test Steps:**
1. POST to `/auth/login` with valid credentials:
   ```json
   {
     "username": "admin@taskboard.local",
     "password": "[VALID_PASSWORD]"
   }
   ```
2. Verify response contains:
   - `token` (JWT access token)
   - `refreshToken` (refresh token)
   - `user` object with user details
3. Verify token format (Base64 JWT with 3 parts)
4. Decode token and verify claims:
   - `sub` (user ID)
   - `email`
   - `role`
   - `exp` (expiration ~24h)
   - `iat` (issued at)

**Pass Criteria:**
- [ ] Login returns 200 with valid tokens
- [ ] Token structure is valid JWT
- [ ] Token contains correct user claims
- [ ] Token expires in ~24 hours

---

#### Test 5.2.3: Protected Route Access with JWT
**Purpose:** Verify JWT tokens grant access to protected routes

**Test Steps:**
1. Obtain valid JWT token from `/auth/login`
2. Call protected endpoints with header:
   ```
   Authorization: Bearer <jwt_token>
   ```
3. Test endpoints:
   - `GET /auth/me` — Should return current user
   - `GET /tasks` — Should return tasks list
   - `GET /cron-jobs` — Should return cron jobs
   - `POST /tasks` — Should create task
   - `PATCH /tasks/:id` — Should update task

**Pass Criteria:**
- [ ] All protected endpoints return 200 with valid JWT
- [ ] Response contains expected data
- [ ] No 401 errors with valid token

---

#### Test 5.2.4: JWT Token Expiration
**Purpose:** Verify expired tokens are rejected

**Test Steps:**
1. Use an expired JWT token (or wait 24h)
2. Call `GET /auth/me` with expired token
3. Verify response:
   - Status: 401
   - Error: "Token expired" or similar

**Pass Criteria:**
- [ ] Expired tokens return 401
- [ ] Error message clearly indicates expiration

---

#### Test 5.2.5: Token Refresh Flow
**Purpose:** Verify refresh tokens work to get new access tokens

**Test Steps:**
1. Login to get `token` and `refreshToken`
2. POST to `/auth/refresh` with:
   ```json
   {
     "refreshToken": "<refresh_token>"
   }
   ```
3. Verify response contains new `token` and `refreshToken`
4. Use new token to access protected routes

**Pass Criteria:**
- [ ] Refresh endpoint returns new tokens
- [ ] New tokens work for protected routes
- [ ] Old refresh token is invalidated (optional)

---

#### Test 5.2.6: Invalid Token Handling
**Purpose:** Verify malformed/invalid tokens are rejected

**Test Steps:**
1. Call protected endpoint with:
   - Malformed JWT (not 3 parts)
   - Invalid signature
   - Missing `Authorization` header
   - Wrong header format (`Bearer` missing)
2. Verify all return 401

**Pass Criteria:**
- [ ] Malformed tokens return 401
- [ ] Missing header returns 401
- [ ] Wrong format returns 401

---

#### Test 5.2.7: API Key Fallback (Agent Auth)
**Purpose:** Verify X-Agent-API-Key still works for automation

**Test Steps:**
1. Call protected endpoint with header:
   ```
   X-Agent-API-Key: <valid_api_key>
   ```
2. Verify access is granted
3. Test with invalid key — should return 401

**Pass Criteria:**
- [ ] Valid API key grants access
- [ ] Invalid API key returns 401

---

#### Test 5.2.8: Google OAuth Flow (User Auth)
**Purpose:** Verify Google OAuth still works for users

**Test Steps:**
1. Navigate to `/auth/google`
2. Complete OAuth flow with Google
3. Verify callback creates session
4. Access protected routes with session cookie

**Pass Criteria:**
- [ ] OAuth redirects to Google
- [ ] Callback creates valid session
- [ ] Session cookie grants access

---

#### Test 5.2.9: Cross-Auth Method Isolation
**Purpose:** Verify auth methods don't interfere

**Test Steps:**
1. Login with Google OAuth (creates session)
2. In parallel, use JWT token for API calls
3. Verify both work independently
4. Logout from one method — verify other still works

**Pass Criteria:**
- [ ] OAuth session doesn't affect JWT
- [ ] JWT doesn't affect OAuth session
- [ ] Methods are truly independent

---

#### Test 5.2.10: Security Headers & CORS
**Purpose:** Verify security configurations

**Test Steps:**
1. Check response headers on auth endpoints:
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `X-XSS-Protection: 1; mode=block`
2. Test CORS preflight on `/auth/login`
3. Verify no sensitive data in error messages

**Pass Criteria:**
- [ ] Security headers present
- [ ] CORS properly configured
- [ ] No password/token leakage in errors

---

### 5.3 Full Authentication Test Battery

**Pre-Test Setup:**
- [ ] Staging environment deployed with JWT changes
- [ ] Test user account created: `admin@taskboard.local`
- [ ] Test credentials available
- [ ] API key available for fallback testing

**Test Execution:**
1. Run all test cases in Section 5.2
2. Document results (pass/fail) for each
3. Capture any error messages
4. Verify backward compatibility (if applicable)

**Post-Test Validation:**
- [ ] All P0 tests pass (5.2.1, 5.2.2, 5.2.3)
- [ ] No critical security issues
- [ ] Performance acceptable (<500ms response time)

**Sign-off Criteria:**
```
JWT Authentication QA Sign-off
================================
Tester: _____________
Date: _____________
Environment: Staging / Production

Test Results:
- Public Routes: [ ] PASS  [ ] FAIL
- JWT Login: [ ] PASS  [ ] FAIL
- Protected Access: [ ] PASS  [ ] FAIL
- Token Expiry: [ ] PASS  [ ] FAIL
- Token Refresh: [ ] PASS  [ ] FAIL
- Invalid Tokens: [ ] PASS  [ ] FAIL
- API Key Fallback: [ ] PASS  [ ] FAIL
- Google OAuth: [ ] PASS  [ ] FAIL
- Cross-Auth Isolation: [ ] PASS  [ ] FAIL
- Security Headers: [ ] PASS  [ ] FAIL

Overall: [ ] APPROVED  [ ] REJECTED
Notes: ___________________________________
```

---

## Section 6: Execution Checklist + Sign-off

### 6.1 Pre-Deployment Checklist

Use this checklist before promoting to staging or production:

#### Automated Tests
- [ ] All unit tests pass (`npm run test:unit`)
- [ ] All integration tests pass (`npm run test:integration`)
- [ ] TypeScript compilation succeeds (`npx tsc --noEmit`)
- [ ] Linting passes with no errors (`npm run lint`)
- [ ] Build completes successfully (`npm run build`)

#### Functional Verification
- [ ] Create, edit, delete task flows work end-to-end
- [ ] Comment add, edit, delete verified
- [ ] Drag and drop between columns functional
- [ ] Cron monitor displays all jobs correctly
- [ ] All filters and search return expected results
- [ ] Role-based access controls enforced

#### Cross-Browser Testing
- [ ] Chrome (latest) - Passed
- [ ] Firefox (latest) - Passed
- [ ] Safari (latest) - Passed
- [ ] Edge (latest) - Passed

#### Responsive Testing
- [ ] Desktop (1920x1080) - Passed
- [ ] Tablet (768x1024) - Passed
- [ ] Mobile (375x812) - Passed

#### Security Verification
- [ ] Authentication flows functional
- [ ] Authorization rules enforced
- [ ] XSS payloads properly escaped
- [ ] CSRF tokens validated
- [ ] No secrets in build output
- [ ] Security headers present

### 6.2 Post-Deployment Verification

After deployment to staging/production:

#### Smoke Tests (5 minutes)
- [ ] Application loads without errors
- [ ] Login works for test accounts
- [ ] Dashboard displays data
- [ ] Create task modal opens and saves
- [ ] Comments load and post correctly

#### Critical Path Tests (15 minutes)
- [ ] Complete task lifecycle: Create → Edit → Move → Complete
- [ ] User assignment and notifications
- [ ] Cron job status page loads
- [ ] Logout and re-login

#### Monitoring Checks
- [ ] No new errors in error tracking (Sentry/etc.)
- [ ] API response times within SLA (< 500ms p95)
- [ ] Database connections stable
- [ ] No failed health checks

### 6.3 Bug Report Template

When filing bugs, use this format:

```markdown
**Bug ID:** BUG-XXX (auto-generated)
**Severity:** Critical / High / Medium / Low
**Environment:** Production / Staging / Local
**Browser:** Chrome 120 / Firefox 121 / Safari 17 / Edge 120
**Device:** Desktop / Tablet / Mobile (specify resolution)
**Reporter:** @username
**Date:** YYYY-MM-DD

**Summary:**
One-line description of the bug

**Steps to Reproduce:**
1. Navigate to...
2. Click on...
3. Enter...
4. Observe...

**Expected Result:**
What should happen

**Actual Result:**
What actually happens

**Screenshots/Videos:**
[Attach media]

**Console Errors:**
```
Paste any browser console errors here
```

**Network Logs:**
- Request URL: 
- Status Code: 
- Response: 

**Additional Context:**
Any other relevant information
```

### 6.4 Sign-off Criteria

**QA Sign-off Requirements:**

| Stakeholder | Responsibility | Sign-off Criteria |
|-------------|----------------|-------------------|
| **QA Engineer** | Functional testing | All P0 tests pass, < 3 open P1 bugs |
| **Security Review** | Security audit | No critical/high security findings |
| **Product Owner** | Acceptance | Features match requirements |
| **Tech Lead** | Code review | PR approved, architecture sound |
| **DevOps** | Deployment readiness | CI/CD green, monitoring configured |

**Release Sign-off Template:**

```
RELEASE SIGN-OFF
================

Release Version: vX.Y.Z
Target Date: YYYY-MM-DD
Target Environment: Staging / Production

QA Approval:
- [ ] Test plan executed
- [ ] Defect summary reviewed
- [ ] Regression testing completed
Approved by: _________________ Date: _______

Security Approval:
- [ ] Security scan clean
- [ ] Penetration test results reviewed
Approved by: _________________ Date: _______

Product Approval:
- [ ] Acceptance criteria met
- [ ] Documentation updated
Approved by: _________________ Date: _______

Engineering Approval:
- [ ] Code review completed
- [ ] Performance benchmarks met
- [ ] Rollback plan documented
Approved by: _________________ Date: _______

FINAL RELEASE APPROVED: [ ] YES  [ ] NO
Approved by: _________________ Date: _______
```

### 6.5 Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-08 | Engineering | Initial QA test plan |

**Review Schedule:** Quarterly or after major feature releases

**Related Documents:**
- `README.md` - Project overview
- `CLAUDE.md` - Development guidelines
- `API_DOCUMENTATION.md` - API specifications

---

*End of QA Test Plan*

