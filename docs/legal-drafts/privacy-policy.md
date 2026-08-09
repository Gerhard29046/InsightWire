---
slug: privacy-policy
title: Privacy Policy
version: "1.0"
effective_date: 2026-08-09
summary: An honest account of what InsightWire does and does not collect today — no accounts, no cookies, no analytics — and how the little data that exists is processed under POPIA and GDPR principles.
---

## 1. Purpose and Scope

This Privacy Policy explains how **[Operator Name]** ("we", "us"), of **[Jurisdiction/Registered Address]**, handles personal information in connection with InsightWire ("the Platform").

It is structured around the Protection of Personal Information Act 4 of 2013 ("POPIA") and, because the Platform is reachable internationally, around the principles of the EU General Data Protection Regulation (Regulation (EU) 2016/679, "GDPR") and the UK GDPR read with the Data Protection Act 2018. We use those instruments as the **design framework for our privacy architecture**. We do not claim to be certified, audited, or formally compliant under any of them.

> **Placeholder notice.** `[Operator Name]`, `[Contact Email]`, `[Jurisdiction/Registered Address]`, and `[Information Officer Name]` are placeholders and must be replaced with real, verified details before publication.

## 2. The Honest Position: What Exists Today

We think a privacy policy is worthless if it describes a system that does not exist. So, plainly:

**There are no user accounts.** The Platform has no login, no registration, no password, no email capture, and no authentication of any kind in the front end. We do not know who you are. We do not ask.

**There are no cookies.** The Platform sets no cookies — not first-party, not third-party, not "essential", not analytics, not advertising. See our **Cookie and Tracking Policy** for detail.

**There are no analytics or tracking scripts.** There is no Google Analytics, no Sentry, no Mixpanel, no Meta pixel, no advertising network, no session-replay tool, no fingerprinting library, and no tag manager anywhere in the Platform. This is verifiable from our dependency manifest, which contains only user-interface and framework libraries.

**There is no payment processing.** The Platform charges nothing and handles no payment or financial instrument data.

**There is no marketing.** We send no marketing email and operate no mailing list. POPIA section 69 (direct marketing by electronic communication) is therefore not engaged.

**"Workspace" data is not a personal account.** Saved searches, bookmarks and notification settings are stored server-side against a single fixed internal identifier. This is a single-tenant implementation detail, not a per-person account. It is not linked to a named individual by us.

### 2.1 The only client-side storage: three localStorage items

The Platform uses your browser's `localStorage` for exactly three things. These stay on your device. **They are never transmitted to us or to anyone else.**

| What | Why | Contains |
| --- | --- | --- |
| Theme preference | So the interface stays light or dark as you chose | A single value: light or dark |
| Recent search terms | So you can re-run a recent query | A short list of the search strings you typed |
| Recently viewed | So you can return to items you just looked at | A short list of event/entity titles and their in-app links |

None of this is used for tracking, profiling, behavioural advertising, or cross-site identification. None of it is shared. You can erase all of it at any time by clearing site data for the Platform in your browser settings.

## 3. Personal Information We Actually Process

### 3.1 Personal information inside public source material

The Platform ingests public news, government, institutional and multilateral-organisation feeds. That material sometimes contains personal information — most often the names and roles of public officials, institutional spokespeople, and organisations. Where it does, we process it as part of headlines, summaries, source attributions and extracted entities.

This is the Platform's most significant category of personal information processing, and it is governed by our **Country and Jurisdiction Data Policy**, which sets out the safeguards we apply to personal, sensitive, and private-individual information found in sources.

**Relevance of POPIA section 7.** POPIA does not apply to processing of personal information *solely* for journalistic, literary or artistic expression, to the extent that the exclusion is necessary to reconcile the right to privacy with the right to freedom of expression as a matter of public interest. The Platform is a journalism and research tool, and a substantial part of what it does is likely to fall within the spirit of that provision. We do **not** treat this as a blanket exemption, and we do not rely on it to avoid our obligations. We design as though POPIA applies in full. Whether and how far section 7 applies to a given processing activity is a legal question for counsel.

### 3.2 Technical information handled by our infrastructure

When your browser requests a page or an API response, the request necessarily carries an IP address, a user-agent string, and the requested path. These are handled transiently by our hosting and edge infrastructure in order to route and serve the request, and to protect the Service from abuse. We do not build user profiles from them, do not join them to any other data, and do not use them for analytics or advertising.

### 3.3 Information you send us voluntarily

If you email us — for example to make a removal, correction, access or complaint request — we process the contents of that correspondence in order to respond, and we keep a record of it.

### 3.4 Workspace content

Content you save (bookmarks, saved searches, timelines, notification settings) is stored in our database. If you choose to type personal information into a saved search or a timeline note, we will store it. Please do not enter personal information about other people without a lawful basis for doing so.

## 4. Why We Process It, and On What Basis

| Processing activity | Purpose | POPIA justification (s 11) | GDPR-analogue lawful basis (Art 6) |
| --- | --- | --- | --- |
| Ingesting and displaying public event data | To operate a research and journalism information service | Legitimate interests of the responsible party and of users (s 11(1)(f)); information deliberately made public (s 11(1) read with s 14) | Legitimate interests (Art 6(1)(f)) — public-interest journalism and research |
| Automated summarisation and entity extraction | To make large volumes of public information navigable | Legitimate interests (s 11(1)(f)) | Legitimate interests (Art 6(1)(f)) |
| Serving and securing requests | To deliver the Service and prevent abuse | Legitimate interests (s 11(1)(f)) | Legitimate interests (Art 6(1)(f)) |
| Handling your correspondence | To answer you and to meet legal obligations | Consent and/or legal obligation (s 11(1)(a), (b)) | Consent / legal obligation (Art 6(1)(a), (c)) |
| Storing workspace content | To provide the feature you used | Legitimate interests (s 11(1)(f)) | Legitimate interests (Art 6(1)(f)) |

We do not process personal information for advertising, for sale, for scoring individuals, or for automated decision-making that produces legal or similarly significant effects on a person.

## 5. Special and Sensitive Categories

POPIA section 26 restricts processing of "special personal information": religious or philosophical beliefs, race or ethnic origin, trade union membership, political persuasion, health or sex life, biometric information, and criminal behaviour. POPIA section 34 separately restricts processing of the personal information of children.

We do not deliberately collect any of these categories. However, public reporting inevitably contains them — a news item about an election, a health emergency, a court case or a protest will reference political persuasion, health, or alleged criminal conduct. Our approach is:

- we do not build features that isolate, index, filter or target people by special category;
- we do not enrich, cross-reference, or infer special-category attributes about individuals;
- we apply heightened scrutiny to removal requests concerning special-category information; and
- we apply the safeguards in the **Country and Jurisdiction Data Policy**, particularly regarding minors and private individuals.

## 6. Who Processes Data For Us

We keep the processor list deliberately short. Every processor below is an operator for POPIA purposes and a processor for GDPR purposes.

| Provider | Role | What it receives |
| --- | --- | --- |
| **Supabase** (managed PostgreSQL) | Primary database | Ingested event, source, entity and workspace records |
| **Cloudflare Workers** | Application/API backend and edge delivery | Request traffic; executes our server-side logic |
| **Google (Gemini API)** | Automated text processing | The text of the public source item being processed |

### 6.1 What Google's Gemini API receives, specifically

We call Google's Gemini API **server-side only**, from our backend. The API key is held as a server-side secret and is never exposed to your browser.

It is used for exactly two things:

1. **Journalist brief generation** — when a user explicitly clicks the button to generate a brief for an event, the event's stored text is sent for summarisation.
2. **Entity and relationship extraction** — as part of ingestion, the text of a public source item is sent so that people, organisations, places and topics can be identified for the Entity Explorer.

We do not deliberately send personal information to Gemini beyond whatever already appears in the public source article being processed. We do not send your searches, your bookmarks, your IP address, your device information, or your localStorage contents.

**We do not currently publish an assurance about Google's retention or model-training practices for this data**, because that depends on the specific Google service tier and contractual terms in force. Before production launch, the operator must confirm the applicable Google Cloud / Gemini API terms and data-processing addendum and restate this section accurately.

## 7. International Transfers

Our processors are international. Once deployed, Supabase, Cloudflare and Google will or may process data outside the Republic of South Africa, and outside the EEA and UK. We treat this as a real compliance question, not a footnote.

**POPIA section 72** prohibits transfer of personal information to a third party in a foreign country unless one of the listed grounds applies — most relevantly, that the recipient is subject to a law, binding corporate rules, or a binding agreement that provides an adequate level of protection with principles substantially similar to POPIA's conditions and equivalent restrictions on onward transfer; or the data subject consents; or the transfer is necessary for the performance of a contract; or it is for the data subject's benefit in circumstances where consent is not reasonably practicable.

**GDPR Chapter V** requires an adequacy decision, appropriate safeguards (typically Standard Contractual Clauses), or a derogation.

Our commitments:

- to rely on the providers' data-processing agreements and Standard Contractual Clauses where offered, and to execute them before production launch;
- to record, and publish here, the actual hosting region of our Supabase project once confirmed by the operator (currently **[Region — TBD]**);
- to keep the volume of personal information crossing borders minimal, which is achieved primarily by not collecting personal information in the first place; and
- to update this section whenever a processor or region changes.

**Reviewing counsel should treat this section as requiring verification**, since the safeguards that are actually in force depend on contracts the operator must sign.

## 8. Retention

Full detail is in our **Data Retention Policy**. In summary:

- **Ingested event, source and entity data** is retained indefinitely as the Platform's core research record, because the historical record is the product. It may be corrected, restricted, or removed under the **Removal and Correction Request Policy**.
- **Workspace data** is retained until deleted. Once authentication exists, it will be deletable by the account holder.
- **localStorage data** is retained in your own browser until you clear it. We cannot delete it for you and we cannot read it.
- **Correspondence** is retained for as long as needed to handle the matter and to evidence how we handled it, then deleted.

POPIA section 14 requires that records not be retained longer than necessary for the purpose, subject to exceptions including retention for historical, statistical or research purposes with appropriate safeguards. We rely on that research purpose for the event archive.

## 9. Your Rights

Under POPIA sections 5, 23, 24 and 25, and by analogy under GDPR Articles 15–22, you may:

- **Ask what we hold about you** (access);
- **Ask us to correct it** where it is inaccurate, irrelevant, excessive, out of date, incomplete, misleading or unlawfully obtained (correction);
- **Ask us to delete or destroy it** where we no longer have a lawful basis to keep it (deletion/erasure);
- **Object to processing** on reasonable grounds relating to your situation (objection);
- **Ask us to restrict processing** while a dispute about accuracy or lawfulness is resolved (restriction);
- **Ask for a copy in a portable format**, where the GDPR analogue applies and the processing rests on consent or contract and is automated (portability);
- **Not be subject to a decision based solely on automated processing** that has legal or similarly significant effects — we do not make such decisions;
- **Complain**, as set out below.

You may also make a formal request for records under the Promotion of Access to Information Act 2 of 2000 ("PAIA"). Our **PAIA Manual** explains that route.

To exercise a right, contact **[Contact Email]**. Because we hold no account identifying you, we may not be able to locate any personal information about you at all — which is usually the correct and honest answer. Where we can identify relevant records, we will respond within **30 days**, in line with PAIA's standard decision period, and will tell you if we need longer and why.

Requests concerning content displayed on the Platform are handled through the **Removal and Correction Request Policy**, which sets out the categories, the workflow, and the outcomes.

## 10. Security

Described in full in our **Security Policy**. At a policy level:

- All privileged credentials — the database service-role key, the Gemini API key, and any other secret — are held server-side only and are never shipped to, or reachable from, the browser.
- The browser never talks to the database directly; it talks only to our API, which mediates every read and write.
- Cross-origin access to the API is constrained to known origins.
- Traffic is served over HTTPS.
- The processing surface is deliberately small: fewer data types collected means less to lose.

We do not claim any certification, penetration test, or third-party audit, because none has been performed. Saying otherwise would be a false compliance claim.

## 11. Breach Handling

POPIA section 22 requires that, where there are reasonable grounds to believe personal information has been accessed or acquired by an unauthorised person, we notify the Information Regulator and the affected data subjects as soon as reasonably possible after discovery — subject to the legitimate needs of law enforcement and to any measures reasonably needed to determine the scope of the compromise and restore system integrity. The Regulator prescribes a notification form for this purpose.

The GDPR analogue requires notification to the relevant supervisory authority without undue delay and, where feasible, within 72 hours, and notification to affected individuals where the risk to their rights and freedoms is high.

Our commitment: contain, assess, notify the Regulator using the prescribed form, notify affected people where they are identifiable, record the incident, and remediate.

## 12. Complaints

If you are unhappy with how we handle your personal information, contact us first at **[Contact Email]**. You may also complain to a supervisory authority.

**South Africa — Information Regulator**
Woodmead North Office Park, 54 Maxwell Drive, Woodmead, Johannesburg, 2191
Telephone: 010 023 5200 · Toll free: 0800 017 160
POPIA complaints: POPIAComplaints@inforegulator.org.za
General enquiries: enquiries@inforegulator.org.za
Website: https://inforegulator.org.za

**European Union** — your national data protection authority, or the lead authority for the establishment concerned.
**United Kingdom** — the Information Commissioner's Office (ICO), https://ico.org.uk.

Contact details for the Regulator should be re-verified before publication, as the Regulator has changed its addresses and domain in the past.

## 13. Our Information Officer

POPIA sections 55 and 56 require a responsible party to have an Information Officer, who is by default the head of the organisation, and who must be registered with the Information Regulator.

Our Information Officer is **[Information Officer Name]**, contactable at **[Contact Email]**. **Registration with the Information Regulator must be completed before production launch.** This is an outstanding item, not a completed one.

## 14. Children

The Platform is not directed at children and has no feature that solicits information from anyone, including children. POPIA section 34 prohibits processing the personal information of a child except in the limited circumstances in section 35. Where a child's personal information appears in a public source, our **Country and Jurisdiction Data Policy** applies heightened restraint, and removal requests concerning minors are treated with priority.

## 15. Changes to This Policy

This policy carries a version number and an effective date. We will update it whenever the facts change — in particular if authentication is introduced, if cookies or analytics are ever added, if a processor is added or changed, or if a hosting region is confirmed. Material changes will be signalled on the Platform. Superseded versions are retained.

## 16. Contact

**[Operator Name]**, [Jurisdiction/Registered Address] · **[Contact Email]**

## About This Document

This document is a policy template prepared to establish a real compliance-oriented architecture for InsightWire, structured around the legislation and principles named above. It is not a substitute for advice from qualified legal counsel. This document must be reviewed, and adapted as necessary, by a qualified attorney familiar with South African and any other applicable jurisdiction's law before this policy is relied upon in production or presented to users as final.
