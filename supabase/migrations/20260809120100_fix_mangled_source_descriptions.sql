-- Fixes 6 sources whose `description` picked up mangled em-dash bytes
-- (UTF-8 double-encoded to "â€"") during an earlier migration's CLI
-- application on Windows — the source .sql file itself was correctly
-- encoded; the corruption happened in transit. Re-set with a plain hyphen
-- to sidestep the encoding risk entirely rather than re-attempt the em-dash.

update public.sources set description = 'Federal Reserve Board press releases (federalreserve.gov RSS feed) - monetary policy, bank regulation/enforcement, and rate decisions. No auth required, explicitly public.' where id = 'us-federal-reserve';
update public.sources set description = 'Presidential Actions (whitehouse.gov/presidential-actions RSS feed) - executive orders, proclamations, nominations. No auth required, explicitly public.' where id = 'us-white-house';
update public.sources set description = 'News and communications across UK government departments (gov.uk Atom feed) - no auth required, explicitly public.' where id = 'uk-government';
update public.sources set description = 'News, minutes, and statistical notices (bankofengland.co.uk RSS feed) - no auth required, explicitly public.' where id = 'bank-of-england';
update public.sources set description = 'Press releases and daily news (ec.europa.eu/commission/presscorner RSS feed) - no auth required, explicitly public.' where id = 'eu-commission';
update public.sources set description = 'Press releases, speeches, and press conferences (ecb.europa.eu RSS feed) - no auth required, explicitly public.' where id = 'ecb';
