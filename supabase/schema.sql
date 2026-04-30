-- Supabase schema for WinGo Analyzer
-- Run this in the Supabase SQL editor.
-- This stores public game results, predictions, and graded accuracy history.

create extension if not exists pgcrypto;

create table if not exists public.wingo_results (
  issue_number text primary key,
  game_code text not null default 'WinGo_30S',
  number smallint not null check (number between 0 and 9),
  size text generated always as (
    case when number >= 5 then 'Big' else 'Small' end
  ) stored,
  color text,
  source text not null default 'public_api',
  raw jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.wingo_predictions (
  id uuid primary key default gen_random_uuid(),
  issue_number text not null,
  previous_issue_number text,
  game_code text not null default 'WinGo_30S',
  predicted_number smallint not null check (predicted_number between 0 and 9),
  predicted_range text not null check (predicted_range in ('Big', 'Small')),
  top_numbers smallint[] not null default '{}',
  confidence text not null default 'Low' check (confidence in ('Low', 'Medium', 'High')),
  action text not null default 'WATCH' check (action in ('SKIP', 'WATCH', 'STRONG', 'TRACK')),
  source text not null default 'local' check (source in ('local', 'groq', 'local-fallback')),
  reason text,
  model text,
  input_summary jsonb,
  raw_response jsonb,
  created_at timestamptz not null default now(),
  unique (issue_number, source)
);

create table if not exists public.wingo_prediction_grades (
  prediction_id uuid primary key references public.wingo_predictions(id) on delete cascade,
  issue_number text not null references public.wingo_results(issue_number) on delete cascade,
  actual_number smallint not null check (actual_number between 0 and 9),
  actual_range text not null check (actual_range in ('Big', 'Small')),
  range_correct boolean not null,
  number_correct boolean not null,
  graded_at timestamptz not null default now()
);

create index if not exists idx_wingo_results_created_at
  on public.wingo_results (created_at desc);

create index if not exists idx_wingo_results_game_issue
  on public.wingo_results (game_code, issue_number desc);

create index if not exists idx_wingo_predictions_issue
  on public.wingo_predictions (issue_number desc);

create index if not exists idx_wingo_predictions_created_at
  on public.wingo_predictions (created_at desc);

create index if not exists idx_wingo_predictions_action
  on public.wingo_predictions (action, confidence);

create or replace view public.wingo_accuracy_summary as
select
  p.game_code,
  p.source,
  p.action,
  count(*) as checked_predictions,
  round(avg(g.range_correct::int) * 100, 2) as range_accuracy_percent,
  round(avg(g.number_correct::int) * 100, 2) as number_accuracy_percent,
  max(g.graded_at) as last_graded_at
from public.wingo_predictions p
join public.wingo_prediction_grades g on g.prediction_id = p.id
where p.action <> 'SKIP'
group by p.game_code, p.source, p.action;

create or replace function public.grade_wingo_prediction()
returns trigger
language plpgsql
as $$
begin
  insert into public.wingo_prediction_grades (
    prediction_id,
    issue_number,
    actual_number,
    actual_range,
    range_correct,
    number_correct
  )
  select
    p.id,
    new.issue_number,
    new.number,
    new.size,
    p.predicted_range = new.size,
    p.predicted_number = new.number
  from public.wingo_predictions p
  where p.issue_number = new.issue_number
    and p.action <> 'SKIP'
  on conflict (prediction_id) do update set
    actual_number = excluded.actual_number,
    actual_range = excluded.actual_range,
    range_correct = excluded.range_correct,
    number_correct = excluded.number_correct,
    graded_at = now();

  return new;
end;
$$;

drop trigger if exists trg_grade_wingo_prediction on public.wingo_results;

create trigger trg_grade_wingo_prediction
after insert or update of number on public.wingo_results
for each row
execute function public.grade_wingo_prediction();

alter table public.wingo_results enable row level security;
alter table public.wingo_predictions enable row level security;
alter table public.wingo_prediction_grades enable row level security;

-- Public read policies for dashboard display.
drop policy if exists "wingo_results_public_read" on public.wingo_results;
create policy "wingo_results_public_read"
on public.wingo_results
for select
using (true);

drop policy if exists "wingo_predictions_public_read" on public.wingo_predictions;
create policy "wingo_predictions_public_read"
on public.wingo_predictions
for select
using (true);

drop policy if exists "wingo_grades_public_read" on public.wingo_prediction_grades;
create policy "wingo_grades_public_read"
on public.wingo_prediction_grades
for select
using (true);

-- Writes should be done from a trusted server/API using the Supabase service role key.
-- Do not expose the service role key in browser JavaScript.
