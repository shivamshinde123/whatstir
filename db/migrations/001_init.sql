-- Whatstir initial schema. See docs/database-schema.md.

create extension if not exists vector;

-- Company data -------------------------------------------------------------

create table sectors (
  id   text primary key,
  name text not null,
  sort int  not null
);

create table companies (
  id               int primary key,            -- yc-oss id, stable
  slug             text not null unique,
  name             text not null,
  former_names     text[] not null default '{}',
  one_liner        text,
  long_description text,
  website          text,
  logo_url         text,
  yc_url           text,
  batch            text,
  launched_at      timestamptz,
  status           text,                       -- Active | Inactive | Acquired | Public (not constrained: the source may add values)
  industry_raw     text,
  subindustry      text,
  industries       text[] not null default '{}',
  tags             text[] not null default '{}',
  regions          text[] not null default '{}',
  team_size        int,
  sector_id        text not null references sectors (id),
  sector_reason    text,
  source_hash      text not null,
  embedding        vector(1536),
  enriched_hash    text,
  first_seen_at    timestamptz not null default now(),
  refreshed_at     timestamptz not null default now(),
  missing_since    timestamptz
);

create index companies_sector_idx on companies (sector_id);
create index companies_status_idx on companies (status);
create index companies_embedding_idx on companies using hnsw (embedding vector_cosine_ops);
create index companies_pending_idx on companies (id) where enriched_hash is distinct from source_hash;

create table founders (
  id           bigint generated always as identity primary key,
  company_id   int not null references companies (id) on delete cascade,
  name         text not null,
  title        text,
  linkedin_url text,
  source_url   text,
  refreshed_at timestamptz not null default now(),
  unique (company_id, name)
);

create table problem_cards (
  company_id   int primary key references companies (id) on delete cascade,
  customer     text,
  problem      text,
  workaround   text,
  solution     text,
  evidence     jsonb not null default '{}',
  model        text not null,
  source_hash  text not null,
  generated_at timestamptz not null default now()
);

create table subcategories (
  id          bigint generated always as identity primary key,
  sector_id   text not null references sectors (id),
  slug        text not null,
  name        text not null,
  description text,
  kind        text not null check (kind in ('ai', 'problem', 'unclassified')),
  version     int not null default 1,
  unique (sector_id, slug)
);

-- Each sector has exactly one AI group and one Unclassified group.
create unique index subcategories_one_ai_idx on subcategories (sector_id) where kind = 'ai';
create unique index subcategories_one_unclassified_idx on subcategories (sector_id) where kind = 'unclassified';

create table company_subcategories (
  company_id     int not null references companies (id) on delete cascade,
  subcategory_id bigint not null references subcategories (id) on delete cascade,
  confidence     real check (confidence between 0 and 1),
  explanation    text,
  assigned_by    text not null check (assigned_by in ('jev', 'manual')),
  assigned_at    timestamptz not null default now(),
  primary key (company_id, subcategory_id)
);

create index company_subcategories_subcategory_idx on company_subcategories (subcategory_id);

-- Research -----------------------------------------------------------------

create table sessions (
  id         uuid primary key default gen_random_uuid(),
  sector_id  text not null references sectors (id),
  created_at timestamptz not null default now(),
  ended_at   timestamptz
);

-- One active (not ended) session per sector.
create unique index sessions_one_active_idx on sessions (sector_id) where ended_at is null;

create table messages (
  id          bigint generated always as identity primary key,
  session_id  uuid not null references sessions (id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  action      text not null default 'ask' check (action in ('ask', 'explore', 'challenge')),
  content     text not null,
  scope       jsonb not null default '{}',
  company_ids int[] not null default '{}',
  status      text not null default 'ok' check (status in ('ok', 'error')),
  created_at  timestamptz not null default now()
);

create index messages_session_idx on messages (session_id, id);

-- The primary key makes a duplicate tile impossible; positions never collide.
create table session_tiles (
  session_id uuid not null references sessions (id) on delete cascade,
  company_id int not null references companies (id),
  position   int not null,
  added_by   bigint references messages (id) on delete set null,
  added_at   timestamptz not null default now(),
  primary key (session_id, company_id),
  unique (session_id, position)
);

-- Owner data ---------------------------------------------------------------

create table notes (
  id         bigint generated always as identity primary key,
  company_id int references companies (id),
  body       text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notes_company_idx on notes (company_id);

-- Operations ---------------------------------------------------------------

create table refresh_runs (
  id           bigint generated always as identity primary key,
  trigger      text not null check (trigger in ('cron', 'manual', 'script')),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'running' check (status in ('running', 'ok', 'failed', 'skipped')),
  source_count int,
  added        int not null default 0,
  updated      int not null default 0,
  enriched     int not null default 0,
  pending      int not null default 0,
  error        text
);

create table app_settings (
  key   text primary key,
  value jsonb not null
);

-- Views (counts are always computed from committed rows) --------------------

create view sector_counts as
select s.id as sector_id,
       s.name,
       s.sort,
       count(c.id)::int                                     as total,
       count(c.id) filter (where c.status = 'Active')::int as active
from sectors s
left join companies c on c.sector_id = s.id and c.missing_since is null
group by s.id;

create view subcategory_counts as
select sc.id as subcategory_id,
       sc.sector_id,
       count(c.id)::int                                     as total,
       count(c.id) filter (where c.status = 'Active')::int as active
from subcategories sc
left join company_subcategories cs on cs.subcategory_id = sc.id
left join companies c on c.id = cs.company_id and c.missing_since is null
group by sc.id;

-- Seed data ----------------------------------------------------------------

insert into sectors (id, name, sort) values
  ('b2b',                          'B2B',                          1),
  ('consumer',                     'Consumer',                     2),
  ('fintech',                      'Fintech',                      3),
  ('healthcare',                   'Healthcare',                   4),
  ('industrials',                  'Industrials',                  5),
  ('education',                    'Education',                    6),
  ('real-estate-and-construction', 'Real Estate and Construction', 7),
  ('government',                   'Government',                   8),
  ('other',                        'Other / Unclassified',         9);

insert into app_settings (key, value) values
  ('refresh_paused',     'false'),
  ('jev_min_confidence', '0.5');
