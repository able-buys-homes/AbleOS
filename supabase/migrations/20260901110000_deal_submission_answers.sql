-- 20260901110000_deal_submission_answers.sql
-- The website form asks for role, asset type, financing and what the seller
-- is open to. Those were being flattened into the notes text, so Raj read
-- them as a paragraph and nothing could filter or report on them.
--
-- Kept as jsonb rather than four columns: the form will grow, and a new
-- question should not need a migration every time.
alter table pipeline_deals
add column if not exists submission jsonb;

-- Only website submissions carry this, so the index skips everything else.
create index if not exists pipeline_deals_submission on pipeline_deals using gin (submission)
where
    submission is not null;