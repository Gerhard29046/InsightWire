-- Groups the 13 real legal documents into the three sections the
-- Administration > Legal & Compliance library actually displays them under
-- (Core Legal Documents / Content & Research / Platform Policies). Every
-- future version of an existing slug inherits/overrides this via the
-- Worker's createDocumentVersion, which always writes an explicit category.
alter table legal_documents
  add column if not exists category text not null default 'platform'
  check (category in ('core', 'content', 'platform'));

update legal_documents set category = 'core'
  where slug in ('terms-and-conditions', 'privacy-policy', 'popia-notice', 'paia-manual');

update legal_documents set category = 'content'
  where slug in ('research-disclaimer', 'copyright-policy', 'source-attribution-policy', 'country-jurisdiction-policy');

-- acceptable-use-policy, cookie-policy, data-retention-policy, security-policy,
-- and removal-correction-policy already match the 'platform' default.
