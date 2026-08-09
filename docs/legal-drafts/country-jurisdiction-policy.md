---
slug: country-jurisdiction-policy
title: Country and Jurisdiction Data Policy
version: "1.0"
effective_date: 2026-08-09
summary: The safeguards InsightWire applies when handling information about countries and their people — prioritising institutional and public-interest information over private individual data.
---

## 1. The Problem This Policy Addresses

InsightWire displays information about many countries: their governments, institutions, central banks, agencies, disasters, health emergencies and public affairs. It organises that information by country, and it extracts people, organisations, places and topics from it.

There is a failure mode that any platform of this kind can slide into, and this policy exists to prevent it:

> **Because information concerns a country, everything about the people in that country is fair game to collect and display.**

**It is not.** A country is not a category of person. Coverage of a state is not a licence to compile information about its residents. The fact that a source mentions someone does not mean the Platform should index, surface, connect, map, or preserve them.

This policy sets the default: **the Platform is about institutions, officials, organisations and public events — not about private individuals.**

## 2. The Governing Distinction

We distinguish, deliberately and operationally, between:

**Institutional and public-role information** — a government department's announcement, a central bank's rate decision, a minister acting in office, an agency's disaster bulletin, an organisation's public statement, a court's ruling. This is the Platform's proper subject matter. Public accountability depends on this information being findable, and public-interest reporting is the reason the Platform exists.

**Private individual information** — information about a person who is not exercising public power or a public role: a bystander, a victim, a witness, a resident, a relative, a private employee, an ordinary person named in passing. This is not the Platform's subject matter, and its appearance in a source is not a reason to feature it.

The line moves with context. A public official's official conduct is squarely in scope; the same official's medical history, family or home address is not. A private person who deliberately enters public debate is in scope for what they said publicly; they do not thereby forfeit the rest of their life.

**Where the assessment is genuinely close, we resolve it in favour of restraint.**

## 3. Core Commitment

**We do not expose personal data merely because a source contains it.**

Ingesting a source is not a decision to surface everything in it. Between ingestion and display sit judgement and restraint, and this policy is where they are written down.

Specifically, we commit that the Platform will not become a means of:

- compiling profiles of individuals;
- looking people up;
- locating people;
- monitoring people; or
- linking people to sensitive attributes.

These are not accidental omissions. They are the product boundary.

## 4. Specific Safeguards

### 4.1 Personal information generally

- We do not build features whose purpose or predictable effect is to profile, monitor, track or look up individuals.
- We do not enrich individuals with data from other sources, and do not cross-reference entity records against external datasets to build fuller pictures of people.
- Extracted entities exist to help navigate topics and institutions, not to serve as dossiers.
- Where personal information is incidental to the story, it should not be given prominence merely because an automated system detected it.
- Personal information can be corrected, restricted or removed at any time under the **Removal and Correction Request Policy**.

### 4.2 Sensitive and special personal information

POPIA section 26 restricts processing of **special personal information**: religious or philosophical beliefs, race or ethnic origin, trade union membership, political persuasion, health or sex life, biometric information, and criminal behaviour or alleged offences. GDPR Article 9 covers comparable categories.

Public reporting is full of this material — elections, health emergencies, court cases, protests, labour disputes. Our safeguards:

- **No feature isolates, indexes, filters, sorts or targets individuals by special category.** There is no "show me people by religion / ethnicity / political persuasion / health status" capability, and there will not be one.
- We do not infer special-category attributes about individuals, and we do not build classifiers that do.
- We do not aggregate special-category mentions into an individual profile.
- Requests concerning special-category information are treated as high priority for removal or restriction.

### 4.3 Minors

POPIA section 34 prohibits processing the personal information of a child except in the limited circumstances in section 35.

- The Platform is not directed at children and solicits no information from anyone.
- Where a minor is identified in source material, we apply maximum restraint. A minor's name should not be surfaced, indexed as an entity, or preserved where the public interest can be served without it.
- **Removal requests concerning minors are prioritised and are resolved in favour of removal where the assessment is close.** We do not require a legal argument from a parent or guardian.
- This applies with particular force where the minor is a victim, a witness, an accused, or identified in connection with health, sexual matters, criminal proceedings, or family circumstances.

### 4.4 Private individuals

- Private individuals are not the Platform's subject. Their appearance in a source is incidental.
- We do not create entity records whose purpose is to track a private individual.
- **Being named once in a news item does not make someone a public figure.**
- A private individual may ask for their information to be removed without having to establish harm, and such requests are approached sympathetically. The bar for keeping information about a private individual is a genuine, current public interest — not mere availability.

### 4.5 Doxxing and personal identifiers

We do not knowingly display, index, extract or retain:

- residential or personal addresses;
- personal telephone numbers or personal email addresses;
- identity numbers, passport numbers, tax numbers, or equivalent national identifiers;
- vehicle registration details;
- family members' details, including children's names and schools;
- workplace or daily-movement information capable of enabling someone to find a person; or
- any combination of the above assembled into a locating profile.

Where such material appears in a source, it is removed from our record rather than displayed. Where it is reported to us, it is treated as urgent under the **Removal and Correction Request Policy**.

### 4.6 Precise personal locations

The World Map exists to show **where events occurred** — a country, a region, a city, an institution — not where people are.

- Geographic references are institutional or event-level, not person-level.
- We do not plot individuals, do not display a person's home, workplace or current location, and do not infer a person's movements from events.
- We do not build any capability to answer "where is this person".
- Where a source supplies coordinates precise enough to identify a private residence, we generalise or discard rather than display them.

### 4.7 Financial and medical information

- We do not display personal financial information about individuals: account details, balances, transactions, credit information, debt or tax affairs.
- We do not display personal medical or health information about identified individuals.
- Aggregate and institutional financial and health information — a central bank rate decision, a national health bulletin, an outbreak report, a budget — is squarely in scope and is a core purpose of the Platform.
- The distinction is between **an economy or a public health situation**, which we report on, and **a person's finances or health**, which we do not.

### 4.8 Credentials and authentication information

- We do not collect, display, index, extract or retain passwords, API keys, tokens, private keys, security question answers, one-time codes, or any other authentication material.
- Where such material appears in ingested content — for example in a leaked-document story or a security advisory — it is removed from our record, not displayed.
- Reports of exposed credentials on the Platform are treated as an urgent security matter under the **Security Policy** as well as a removal matter.

### 4.9 Unlawful content

- We do not knowingly display content that is unlawful under applicable law — child sexual abuse material, hate speech, incitement, content in breach of a court order or reporting restriction, or content whose publication is prohibited by statute.
- Where we become aware of such content, it is removed promptly, and where the law requires it, the appropriate authority is notified.
- Reporting restrictions vary by jurisdiction, and a name lawfully published in one country may be prohibited in another. Where a credible restriction is drawn to our attention, we act on it.

### 4.10 Harmful personal targeting

The Platform must not become an instrument for targeting people. We do not permit, and we act against, use of the Platform to:

- identify, select, locate, prioritise or time targets for violence;
- surveil, track or monitor individuals;
- harass, stalk, intimidate or threaten;
- compile watchlists, target lists or dossiers; or
- target journalists, human rights defenders, whistleblowers, activists, witnesses, protected persons, minorities, or their families.

These prohibitions are enforced through the **Acceptable Use Policy**, and content that materially enables them is removed under the **Removal and Correction Request Policy**.

## 5. Multiple Jurisdictions

The Platform covers many countries and may be read anywhere. Several consequences follow.

**We do not apply the lowest standard available.** Where one jurisdiction permits publication of personal information that another prohibits, we do not treat permission in the most permissive jurisdiction as authority to publish everywhere. Our floor is set by this policy, not by the weakest applicable law.

**We do not assume a country's own rules govern its people's information globally**, nor that South African law governs everything we display. Where a person is protected by a data protection regime that gives them stronger rights — GDPR, UK GDPR, or another — we will honour a request made under it.

**We do not accept jurisdictional pressure as a moderation instrument.** A government demand to remove accurate, lawful public-interest reporting about its own official conduct is not a removal ground under our policy. We assess every demand on its merits, we require the legal basis to be identified, and we say no when we should. Where we comply, we record why.

**We recognise the risk of asymmetry.** Institutions in some countries publish far more than in others, and a platform that simply reflects source volume will over-report some places and under-report others. That is a coverage limitation, described in the **Source and Attribution Policy** and the **Research and Information Disclaimer** — but it is never a reason to compensate by digging deeper into individuals in under-covered countries.

**Sovereignty of the record.** Displaying information about a country is not a statement about that country's government, legitimacy, borders, disputes or policies. Country labels, map placements and geographic groupings are navigational, and are not political positions.

## 6. Public Interest Is the Test, Not Availability

The question is never "is this information available?" — on this Platform it always is, because everything comes from public sources.

The question is: **does displaying this serve journalism, research, accountability or public understanding, and is doing so proportionate to its effect on the person concerned?**

Applying that test:

| Generally in scope | Generally out of scope |
| --- | --- |
| A minister's official decision | The minister's family or health |
| A central bank's rate announcement | Any named individual's finances |
| An agency's disaster bulletin | Names and addresses of affected residents |
| A court's public ruling | A minor's identity in proceedings |
| An institution's public statement | A private employee named incidentally |
| A public figure's public conduct | A private person's private life |

Where the test is close, restraint wins.

## 7. Automated Processing and These Safeguards

Entity extraction and summarisation are automated, and automated systems do not exercise judgement. They will surface names that should not be surfaced, connect people who should not be connected, and attribute statements to the wrong person.

We therefore treat automation as **subject to** this policy, not an exception to it:

- automated extraction is scoped toward organisations, institutions, places and topics, and toward people in public roles;
- automated output does not create a feature that this policy prohibits — extraction is not a route around the "no profiling, no lookup, no locating" boundary;
- where extraction produces an entity record about a private individual, that record is removable on request without argument; and
- automated errors of attribution are corrected under the **Removal and Correction Request Policy**.

## 8. Reporting a Concern

If you believe the Platform is displaying personal information it should not, or is exposing someone to risk, tell us at **[Contact Email]**. Use the **Removal and Correction Request Policy** categories — "privacy violation", "personal information", "harmful content" or "unlawful content".

**Requests concerning minors, safety risks, doxxing and special-category information are prioritised**, and where there is an imminent risk to a person's safety we may restrict the content immediately, before completing our assessment.

You do not need to be the person affected, and you do not need a lawyer.

## 9. Review

This policy is reviewed at least annually and whenever a new source region, feature or processing capability is added. Any new feature that touches personal information must be assessed against sections 3 and 4 before release. `[Contact Email]` and other bracketed values are placeholders that must be replaced with real, verified details before publication.

## About This Document

This document is a policy template prepared to establish a real compliance-oriented architecture for InsightWire, structured around the legislation and principles named above. It is not a substitute for advice from qualified legal counsel. This document must be reviewed, and adapted as necessary, by a qualified attorney familiar with South African and any other applicable jurisdiction's law before this policy is relied upon in production or presented to users as final.
