-- Keep session ids, messages and tiles when widening the session key.
alter table sessions add column sector_ids text[];
update sessions set sector_ids = array[sector_id];
alter table sessions alter column sector_ids set not null;
drop index sessions_one_active_idx;
alter table sessions drop column sector_id;

-- Canonical arrays prevent a reversed or duplicated set bypassing uniqueness.
create function canonical_sector_ids(ids text[]) returns text[]
language sql immutable strict as $$
  select array_agg(distinct id order by id) from unnest(ids) as t(id)
$$;
alter table sessions add constraint sessions_sector_ids_valid check (
  cardinality(sector_ids) between 1 and 9
  and array_ndims(sector_ids) = 1
  and array_lower(sector_ids, 1) = 1
  and array_position(sector_ids, null) is null
  and sector_ids = canonical_sector_ids(sector_ids)
  and sector_ids <@ array['b2b','consumer','fintech','healthcare','industrials',
    'education','real-estate-and-construction','government','other']::text[]
);
create unique index sessions_one_active_idx on sessions (sector_ids) where ended_at is null;
