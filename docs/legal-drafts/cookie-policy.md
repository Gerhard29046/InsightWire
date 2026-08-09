---
slug: cookie-policy
title: Cookie and Tracking Policy
version: "1.0"
effective_date: 2026-08-09
summary: InsightWire sets no cookies and runs no trackers; this policy explains the three device-local localStorage items that are the only client-side storage in use.
---

## 1. The Short Version

**InsightWire does not use cookies.**

Not first-party cookies. Not third-party cookies. Not "strictly necessary" cookies. Not analytics cookies. Not advertising cookies. Not session cookies. None.

**InsightWire runs no tracking or analytics technology.** There is no Google Analytics, no Google Tag Manager, no Meta pixel, no advertising network, no Sentry, no Mixpanel, no Hotjar, no session replay tool, no fingerprinting library, and no third-party script of any kind executing in your browser. This is verifiable from the Platform's dependency manifest, which contains only user-interface and framework libraries.

**There is no consent banner because there is nothing to consent to.** We are not going to interrupt you with a dialogue asking permission for tracking we do not perform.

The Platform uses your browser's `localStorage` for exactly three things. All three stay on your device. None is ever transmitted to us or to anyone else. They are described below.

## 2. Why This Matters Legally

Cookie and similar-technology rules generally apply to **storing information on, or gaining access to information stored on, a user's device**, and to the processing of personal information that follows.

- **POPIA** governs the processing of personal information. Personal information that never leaves your browser and that we can neither read nor receive is not being processed by us.
- **GDPR and the EU ePrivacy Directive**, and in the UK the Privacy and Electronic Communications Regulations read with the UK GDPR, require consent for storing or accessing information on a user's terminal equipment, subject to a strict-necessity exemption, and treat cookie-derived identifiers as personal data where they can identify a user.

We take the view that the three items below do not require a consent mechanism, because they store no identifier, are never read by us, are never transmitted anywhere, cannot be used to recognise you across sites or sessions on another device, and exist solely to deliver a feature you invoked. **This is the reason we still publish this document rather than saying nothing: you are entitled to know what is on your device and why.**

## 3. The Three localStorage Items

`localStorage` is a browser feature that lets a website save small amounts of data on your own device. Unlike a cookie, it is **not attached to network requests** — it is not sent to the server with every page load. It stays in your browser until you or the site clears it.

### 3.1 Theme preference

| | |
| --- | --- |
| **What it stores** | A single value indicating whether you chose the light or dark interface |
| **Why** | So the interface stays as you set it when you return, instead of flipping back |
| **Contains personal information?** | No |
| **Transmitted anywhere?** | No |
| **Lifetime** | Until you clear your browser's site data for the Platform |

### 3.2 Recent search terms

| | |
| --- | --- |
| **What it stores** | A short list of search strings you have typed into the Platform |
| **Why** | So you can quickly re-run a recent query without retyping it |
| **Contains personal information?** | Only if you typed personal information into the search box. If you searched for a person's name, that name is in this list — on your device. |
| **Transmitted anywhere?** | No. The search itself is of course sent to our API in order to run it; the *list of your past searches* is not. |
| **Lifetime** | Until you clear your browser's site data, or clear the list in the Platform where that option is offered |

### 3.3 Recently viewed activity

| | |
| --- | --- |
| **What it stores** | A short list of items you have opened — event and entity titles, and their in-app links |
| **Why** | So you can return to something you were just looking at |
| **Contains personal information?** | Only incidentally: an event or entity title may contain a person's name because the source headline did. |
| **Transmitted anywhere?** | No |
| **Lifetime** | Until you clear your browser's site data |

### 3.4 What none of them do

None of these items is used for tracking, profiling, behavioural advertising, audience measurement, cross-site or cross-device identification, or any inference about you. None contains a user identifier, device identifier, session token or advertising ID. **We cannot read any of them.** They exist in your browser and are used only by the page running in your browser.

If you use the Platform on two devices, the two devices know nothing about each other.

## 4. How to Inspect or Delete This Data

It is your device and your data. You can look at it and delete it whenever you want.

### 4.1 Clearing it

Clearing site data for the Platform removes all three items. Your theme reverts to the default, and your recent-search and recently-viewed lists are emptied. Nothing else is affected, because there is nothing else — no account to lose, no saved settings on our side tied to you.

- **Chrome / Edge** — Settings → Privacy and security → Third-party cookies (or Cookies and site data) → See all site data and permissions → find the Platform's domain → Delete.
- **Firefox** — Settings → Privacy & Security → Cookies and Site Data → Manage Data → find the Platform's domain → Remove Selected.
- **Safari (macOS)** — Settings → Privacy → Manage Website Data → find the Platform's domain → Remove.
- **Safari (iOS)** — Settings → Safari → Advanced → Website Data → find the Platform's domain → swipe to delete.
- **Any browser** — using a private or incognito window means the data is discarded when you close the window.

### 4.2 Inspecting it

Open your browser's developer tools (usually F12 or Ctrl/Cmd + Shift + I), go to the **Application** or **Storage** tab, and look under **Local Storage** for the Platform's domain. You will see exactly the three items described above, and nothing else.

### 4.3 Blocking it

If your browser blocks site storage for the Platform, the Platform still works. You lose the convenience: your theme choice will not persist, and the recent-search and recently-viewed lists will not appear.

## 5. Technical Information Handled When You Make a Request

For completeness, and because it is sometimes confused with tracking: when your browser requests a page or an API response, that request necessarily carries an IP address, a user-agent string and the requested path. Our hosting and edge infrastructure handles this transiently to route and serve the request and to protect the Service from abuse.

This is **not** a cookie, not a tracker, and not stored on your device. We do not use it to build a profile of you, do not join it to any other data, and do not use it for analytics or advertising. See the **Privacy Policy** for detail.

## 6. Third-Party Links

The Platform links out to source websites — governments, central banks, news publishers, multilateral organisations. **Those sites almost certainly do use cookies and tracking, and their practices are their own.** Once you follow a link, you are on their site under their policies. We have no control over, and take no responsibility for, what they set on your device.

## 7. If This Ever Changes

We may one day want product analytics, error monitoring, or an embedded third-party component. If that happens, **all of the following will occur before any such technology is enabled**:

1. this policy will be rewritten to describe the technology, its purpose, its provider, what it stores, how long it persists, and whether it involves an international transfer;
2. the **Privacy Policy** will be updated correspondingly;
3. a lawful basis will be identified and, where consent is required, **a genuine consent mechanism will be implemented — one that allows refusal as easily as acceptance, and that does not treat continued browsing as consent**; and
4. the version number and effective date of this document will be incremented, and the change signalled on the Platform.

**We will not quietly add tracking and update the policy afterwards.** That commitment is the point of this section.

## 8. Questions

Questions about this policy, or about anything stored on your device by the Platform: **[Contact Email]**, [Operator Name], [Jurisdiction/Registered Address]. These bracketed values are placeholders and must be replaced with real, verified details before publication.

## About This Document

This document is a policy template prepared to establish a real compliance-oriented architecture for InsightWire, structured around the legislation and principles named above. It is not a substitute for advice from qualified legal counsel. This document must be reviewed, and adapted as necessary, by a qualified attorney familiar with South African and any other applicable jurisdiction's law before this policy is relied upon in production or presented to users as final.
