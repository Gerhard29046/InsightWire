---
slug: security-policy
title: Security Policy
version: "1.0"
effective_date: 2026-08-09
summary: An honest description of InsightWire's security posture — what is actually in place, what is not yet built, and how to report a vulnerability responsibly.
---

## 1. Our Approach, Stated Honestly

This policy describes the security posture of InsightWire as it actually is. It does not claim certifications we do not hold, audits we have not had, or controls we have not built.

**We hold no security certification.** No ISO 27001, no SOC 2, no PCI DSS. **No independent penetration test or third-party security audit has been performed.** Where a control is planned rather than implemented, this document says so.

We think that is the only useful kind of security policy. A document that overstates its controls misleads users about the risk they are taking and misleads the operator about the work still to do.

## 2. The Strongest Control Is What We Do Not Collect

The Platform's greatest security property is the small size of its attack surface, which follows from deliberate design choices:

- **No user accounts.** No credentials, password hashes, session tokens, password reset flows, or account takeover surface exist, because authentication does not exist.
- **No cookies.** No session cookies to steal or fixate.
- **No analytics, advertising or tracking scripts.** No third-party JavaScript executing in your browser, and therefore no supply-chain risk from tag managers, analytics SDKs or ad networks.
- **No payment processing.** No card data, no financial instrument data, no PCI scope.
- **Minimal personal information.** Most of what the Platform stores is public information republished in summary form. There is very little personal data to lose.

Data that is never collected cannot be breached. This is a design principle, not an accident.

## 3. Credential and Secret Handling

This is the control we regard as most important, and it is genuinely implemented.

**All privileged credentials are server-side only.**

- The database **service-role key** is held as a server-side secret in the backend runtime. It is never included in client-side JavaScript, never sent to the browser, and never exposed through an API response.
- The **Gemini API key** is held as a server-side secret. All calls to Google's Gemini API are made from the backend. The key never reaches the browser.
- No secret is committed to the source repository. Secrets are supplied through the runtime's secret configuration.
- **The browser never talks to the database directly.** Every read and write is mediated by our own API, which is the only component holding privileged credentials and the only place where authorisation decisions can be enforced.

If you ever observe a credential, API key, service-role token or connection string reachable from the browser or present in a client bundle, treat it as a serious vulnerability and report it under section 8 immediately.

## 4. Architecture and Boundaries

**Backend.** Application logic runs in a Cloudflare Worker. It is the sole intermediary between clients and the database, and the sole holder of secrets. At the effective date of this document the Worker runs in local development and is **not yet deployed to a production Cloudflare account**; the controls described here are designed for, and must be verified against, the production deployment.

**Database.** A hosted Supabase PostgreSQL instance. It is not exposed to the public internet as an application endpoint; access is through the backend using server-side credentials.

**Transport.** All traffic is served over HTTPS. We rely on our hosting and edge providers for TLS termination and certificate management.

**Cross-origin access.** The API applies a cross-origin resource sharing configuration that constrains which origins may call it, rather than permitting all origins indiscriminately.

**Input handling.** API inputs are validated and parameters are bound rather than concatenated into queries, to guard against injection. Content ingested from third-party feeds is treated as untrusted input and is escaped when rendered, to guard against cross-site scripting from a compromised or malicious feed.

**Third-party code.** Runtime dependencies are limited to user-interface and framework libraries. Keeping the dependency list short is itself a supply-chain control.

## 5. What Is Not Yet Built

Stated plainly, because a user deciding whether to trust the Platform deserves to know:

- **There is no authentication and no authorisation.** Anyone who can reach the Platform can use it. Workspace data — bookmarks, saved searches, notification settings — is stored server-side against a single fixed internal identifier and is **not** protected by per-person access control. **Do not treat the workspace as private, secure or confidential storage.** Do not put anything sensitive in it.
- **Supabase Auth integration is planned but not implemented.** When it is, workspace data will be scoped to authenticated accounts, database row-level security will enforce that scoping, and this policy and the Privacy Policy will be updated before the change goes live.
- **There is no formal audit logging framework yet.** One is planned so that administrative and moderation actions are recorded and reviewable.
- **There is no independent security assessment.** None has been commissioned.
- **There is no formal incident response runbook.** Section 7 states our intent; the operational runbook remains to be written.
- **Rate limiting and abuse controls are limited.** Strengthening them is planned.

We will update this section as these are implemented. We will not describe them as done before they are.

## 6. Operational Practices

- **Least privilege.** Credentials are scoped as narrowly as the platform permits, and privileged keys are used only server-side.
- **Separation of environments.** Development and production configuration and secrets are kept separate.
- **Patching.** Dependencies are kept current, and security advisories affecting our stack are acted on.
- **Provider reliance.** We rely on Cloudflare, Supabase and Google for infrastructure-level security — physical security, network security, platform patching, encryption at rest and in transit. Their security documentation governs those layers. **Data-processing agreements with each provider must be executed before production launch**; this is an outstanding item and is also flagged in the Privacy Policy and POPIA Notice.
- **Change control.** Changes are made through version control, so that what is running can be identified and, if necessary, reverted.

## 7. Incident Response and Breach Notification

If we become aware of a security incident, our commitments are:

1. **Contain** — stop ongoing exposure, revoke and rotate affected credentials.
2. **Assess** — establish what happened, what data was affected, and who is affected.
3. **Notify the Regulator** — **POPIA section 22** requires that, where there are reasonable grounds to believe personal information has been accessed or acquired by an unauthorised person, we notify the Information Regulator and the affected data subjects as soon as reasonably possible after discovery, subject to the legitimate needs of law enforcement and to measures reasonably needed to determine the scope of the compromise and restore system integrity. The Regulator prescribes a security compromise notification form, which we will use.
4. **Notify affected people** — where they are identifiable. The GDPR analogue requires supervisory authority notification without undue delay and, where feasible, within 72 hours, and notification to individuals where the risk to their rights and freedoms is high.
5. **Record** — keep a full incident record.
6. **Remediate** — fix the root cause and, where useful, publish what we changed.

**Law enforcement reporting.** Section 54 of the Cybercrimes Act 19 of 2020 contemplates a duty on electronic communications service providers and financial institutions to report certain offences to the South African Police Service without undue delay and, where feasible, within 72 hours. **Whether that section is in force, and whether it applies to a service of this kind, must be confirmed with counsel rather than assumed.** Independently of any statutory duty, we will report a serious criminal intrusion to the appropriate authorities.

## 8. Responsible Disclosure

**We want to hear from security researchers, and we will not pursue anyone who reports in good faith under this policy.**

### How to report

Email **[Security Contact Email]** with the subject line **"Security disclosure"**. Include:

- a description of the issue and its potential impact;
- clear steps to reproduce it;
- the affected URL, endpoint or component;
- any proof-of-concept material; and
- how you would like to be credited, if at all.

### What we commit to

- **Acknowledge** your report within **[X] business days**.
- **Assess and respond** with our view and an expected remediation timeline within **[Y] business days**.
- **Keep you updated** while we fix it.
- **Credit you** publicly if you want credit.
- **Not take legal action** against you for good-faith research conducted within the rules below.

We do not currently operate a paid bug bounty.

### Rules for good-faith research

Please:

- act only against the Platform's own systems, not against Cloudflare, Supabase or Google infrastructure, and not against any third-party source;
- use the minimum access needed to demonstrate the issue, and stop as soon as it is demonstrated;
- **do not access, download, modify, delete or retain any data that is not your own** — if you encounter personal information, stop and tell us;
- do not degrade the Service: no denial of service, no volumetric or stress testing, no automated scanning at damaging rates;
- do not use social engineering, phishing, or physical attacks against the operator or any person;
- do not publish the issue until we have had a reasonable opportunity to fix it — we suggest **90 days**, and will discuss earlier disclosure if the risk warrants it; and
- comply with applicable law. Nothing in this policy authorises conduct that would be an offence under the Cybercrimes Act 19 of 2020 or equivalent law elsewhere.

Research conducted within these rules is not a breach of our **Acceptable Use Policy**. Research outside them is.

## 9. What You Can Do

- Do not put sensitive or confidential information into the Journalist Workspace while authentication does not exist.
- Clear your browser's site data for the Platform if you are on a shared device — this removes the three `localStorage` items described in the **Cookie and Tracking Policy**.
- Verify Platform information against the original source before relying on it.
- Report anything that looks wrong.

## 10. Placeholders

`[Security Contact Email]`, `[Operator Name]`, `[Jurisdiction/Registered Address]` and the response periods `[X]` and `[Y]` are placeholders and must be replaced with real, committed values before publication. **Do not publish a response commitment the operator cannot meet.**

## About This Document

This document is a policy template prepared to establish a real compliance-oriented architecture for InsightWire, structured around the legislation and principles named above. It is not a substitute for advice from qualified legal counsel. This document must be reviewed, and adapted as necessary, by a qualified attorney familiar with South African and any other applicable jurisdiction's law before this policy is relied upon in production or presented to users as final.
