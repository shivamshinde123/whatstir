-- Web search results attached to an assistant message (decision 77): { query, text, sources[], failed }.
-- Kept apart from company_ids so web results never reach the grid. Null when no search ran.
alter table messages add column web jsonb;
