---
slug: source-attribution-policy
title: Source and Attribution Policy
version: "1.0"
effective_date: 2026-08-09
summary: Where InsightWire's information comes from, how sources are selected and corrected, and how provenance is preserved so every item can be checked at its origin.
---

## 1. Principle

Every item on InsightWire came from somewhere, and you should always be able to see where. **Provenance is not a footnote on this Platform; it is part of the record.**

We are an aggregator and a research interface. We are not the author of the underlying facts. Our value is in gathering, organising and making public information navigable — and in never obscuring the trail back to its origin.

## 2. Where Information Comes From

The Platform ingests from approximately **eighteen public sources**, each accessed through a public RSS feed, public API, or public website endpoint that the publisher makes openly available.

Source categories:

- **South African government and institutional sources** — official departmental, agency and state communication channels.
- **Regional southern African sources** — including Namibian and Zimbabwean government and news channels.
- **Scientific and space agencies** — including NASA.
- **Global health and multilateral bodies** — including the World Health Organization and United Nations channels.
- **Disaster and hazard alert services** — including the Global Disaster Alert and Coordination System (GDACS).
- **Central banks, treasuries and executive offices** — including the US Federal Reserve, The White House, the UK Government, the Bank of England, the European Commission, and the European Central Bank.

The current, authoritative list of active sources is published on the Platform and is available on request. This document describes the **policy**; the source list itself changes and is maintained separately.

**The list is skewed, and we say so.** Our present coverage leans toward South African and southern African sources and toward English-language official publications from Western and multilateral institutions. This is a real limitation on what the Platform can tell you about the world, and it should be read alongside the **Research and Information Disclaimer**.

## 3. How Sources Are Selected

We add a source when it meets these criteria:

1. **Public availability.** The source publishes an openly accessible feed, API or endpoint. We do not ingest from behind paywalls, registration walls or access controls, and we do not circumvent them.
2. **Identifiable publisher.** We can name who publishes it. Anonymous or unattributable feeds are not used.
3. **Institutional or editorial standing.** We prefer primary institutional publishers — governments, central banks, agencies, multilateral organisations — and established news publishers, over aggregators, syndicators and secondary republishers. Closer to the origin is better.
4. **Structural reliability.** The feed is stable enough to parse, carries usable timestamps, and provides item-level links back to the original.
5. **Terms compatibility.** Ingestion is consistent with the source's own terms of use, feed terms, API terms and `robots.txt` directives.
6. **Relevance.** The source produces event information that serves journalism, research, analysis or education.

We do **not** select sources on the basis of political alignment, and we do not weight sources to advance a viewpoint. We also do not treat inclusion as a certificate of quality — see section 6.

## 4. Provenance We Preserve

For every ingested item, wherever the architecture allows, we store and display:

| Field | Purpose |
| --- | --- |
| **Source name** | Who published it |
| **Original source URL** | Where to read the full item |
| **Publication timestamp** | When the source published it |
| **Ingestion timestamp** | When we retrieved it — so you can see the lag |
| **Headline** | As published |
| **Summary / description** | Short, from the source feed or automatically generated |

**We never remove, alter, obscure or falsify these fields**, and users may not do so either (see the **Acceptable Use Policy**).

Where a source feed omits a field — some feeds provide no reliable publication time, some provide no description — we record what we have rather than inventing what we do not. A missing field is shown as missing.

Derived layers — categories, extracted entities, geographic references, deduplication linkages, priority indicators and generated briefs — are **our** additions, not the source's, and are presented as such. Where an item results from deduplicating several source reports, we preserve the contributing sources rather than collapsing them into one.

## 5. What Attribution Means Here

Attribution on this Platform means: *this publisher published this, at this time, at this address.* It does not mean:

- that the publisher endorses InsightWire, or is affiliated with, associated with, or a partner of the operator;
- that the publisher has approved our summary, our category, our entity extraction, our map placement or our priority indicator;
- that we have verified the publisher's account; or
- that we agree with it.

Institutional names, logos and marks belong to their owners and are used only to identify the source of information.

## 6. We Do Not Endorse Source Opinions

Sources have positions. Governments publish material that advances their own interests. Central banks frame economic news in their own terms. News publishers have editorial lines. Multilateral bodies have institutional perspectives.

**Including a source is not agreement with it.** The Platform may carry, side by side, accounts that contradict one another — including official statements from parties in dispute with each other. That is a feature of a research tool, not an error. Nothing in the ordering, categorisation, priority indicator or map placement of an item expresses a view about whether the source is right.

Users should read across sources, weigh them, and go to the original. See the **Research and Information Disclaimer**.

## 7. Source Availability Changes

Feeds are not stable infrastructure. Any of the following happens routinely:

- a feed URL changes or is retired without notice;
- a feed's format changes and breaks parsing;
- an API introduces authentication, quotas or rate limits;
- a source imposes new terms that we will not or cannot accept;
- a publisher asks us to stop ingesting; or
- a source goes offline temporarily or permanently.

When a source stops working, items from it stop appearing. **Absence of coverage is not evidence that nothing happened.** We monitor source health, and where a source has been unavailable for a material period we will say so on the Platform rather than let silence imply quiet.

Adding or removing a source is a routine operational decision. Removing a source does not by itself delete its historical items; that follows the **Data Retention Policy** and any request made under the **Removal and Correction Request Policy**.

## 8. Corrections

### 8.1 When the source corrects itself

Where a source publishes a correction, update or retraction and we become aware of it, we will reflect it: by updating the stored item, by adding a correction note, or — where the source has retracted the item entirely — by removing or restricting it. We will not silently overwrite history where the original was materially wrong and a reader may have relied on it; a correction note is generally preferable to a quiet edit.

**We do not automatically detect every source correction.** Most feeds do not signal corrections in a machine-readable way. This is a genuine limitation, and it is why the Platform always links to the original: the original is authoritative, and we are not.

### 8.2 When our processing is wrong

Separately from source error, our own derived layers can be wrong — a mistaken category, a misidentified entity, a wrong country, a duplicate that should not have been merged, a summary that misstates what the source said, a broken or wrong source link.

Tell us and we will fix it. This is the "source correction" category in the **Removal and Correction Request Policy**.

### 8.3 How to request a correction

Email **[Contact Email]** with the subject line **"Source correction"** and include:

- the item on the Platform (link or identifier);
- what is wrong — source name, link, timestamp, summary, category, entity, geography, deduplication, or the underlying fact;
- what it should be; and
- a link to the authoritative source, if you have one.

Corrections that come from the source publisher itself are given priority and are generally applied without further verification.

## 9. Publishers: How to Reach Us

If you publish a source we ingest, you may at any time ask us to:

- correct how your publication is named or linked;
- change how much of your description we display;
- stop ingesting a particular feed; or
- remove your material entirely.

Write to **[Contact Email]**. As stated in the **Copyright and Content Policy**, we will honour a rights holder's request to stop, even where we believe we have a legal basis to continue.

## 10. Transparency Commitments

We commit to:

- publishing the list of active sources;
- displaying source name, original link and timestamps on every item;
- distinguishing source-provided content from our own derived and generated content;
- disclosing when a summary or brief is machine-generated;
- recording and applying corrections; and
- updating this policy when our sourcing practice changes.

## 11. Placeholders

`[Contact Email]`, `[Operator Name]` and `[Jurisdiction/Registered Address]` are placeholders and must be replaced with real, verified details before publication.

## About This Document

This document is a policy template prepared to establish a real compliance-oriented architecture for InsightWire, structured around the legislation and principles named above. It is not a substitute for advice from qualified legal counsel. This document must be reviewed, and adapted as necessary, by a qualified attorney familiar with South African and any other applicable jurisdiction's law before this policy is relied upon in production or presented to users as final.
