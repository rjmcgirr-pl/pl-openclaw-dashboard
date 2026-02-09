

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

