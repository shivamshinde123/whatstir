-- Track each enrichment step separately (decision 36): a step is pending when its hash
-- differs from source_hash. A failed card doesn't redo the embedding, and regenerating a
-- sector's subcategories only has to clear assigned_hash.
alter table companies
  add column embedded_hash text,
  add column assigned_hash text,
  add column carded_hash   text,
  add column founders_hash text;

drop index companies_pending_idx;
alter table companies drop column enriched_hash;

create index companies_pending_idx on companies (id)
  where embedded_hash is distinct from source_hash
     or assigned_hash is distinct from source_hash
     or carded_hash   is distinct from source_hash
     or founders_hash is distinct from source_hash;
