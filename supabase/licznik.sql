-- Warun Pomorze – licznik odwiedzin. Wklej całość w SQL Editor i uruchom raz.
-- Bez ciasteczek i danych osobowych: losowy identyfikator przeglądarki, dzień, telefon/komputer, czy zalogowany.
-- Każdy może tylko DODAĆ wpis; odczyt (zbiorczy) tylko dla admina przez funkcje poniżej.

create table if not exists public.visits (
  id         bigint generated always as identity primary key,
  day        date not null default (now() at time zone 'Europe/Warsaw')::date,
  visitor    uuid not null,
  page       text not null check (page in ('index', 'admin')),
  mobile     boolean not null default false,
  logged_in  boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists visits_day on public.visits(day);

alter table public.visits enable row level security;
revoke all on public.visits from anon, authenticated;
-- Dzień i czas ustawia baza – z zewnątrz nie da się ich podrobić.
grant insert (visitor, page, mobile, logged_in) on public.visits to anon, authenticated;
drop policy if exists "wizyty: dodanie" on public.visits;
create policy "wizyty: dodanie" on public.visits for insert to anon, authenticated with check (true);

-- Dzienne statystyki strony głównej z ostatnich N dni.
create or replace function public.visit_stats(days int default 30)
returns table (day date, views bigint, visitors bigint, mobile bigint, logged bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Tylko dla admina';
  end if;
  return query
    select v.day, count(*), count(distinct v.visitor),
           count(distinct v.visitor) filter (where v.mobile),
           count(distinct v.visitor) filter (where v.logged_in)
    from public.visits v
    where v.page = 'index' and v.day > (now() at time zone 'Europe/Warsaw')::date - days
    group by v.day order by v.day;
end $$;

-- Podsumowanie: unikalne osoby w 7 i 30 dni, wejścia dziś i łącznie.
create or replace function public.visit_summary()
returns table (visitors_7 bigint, visitors_30 bigint, views_today bigint, views_total bigint)
language plpgsql stable security definer set search_path = '' as $$
declare today date := (now() at time zone 'Europe/Warsaw')::date;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Tylko dla admina';
  end if;
  return query
    select count(distinct v.visitor) filter (where v.day > today - 7),
           count(distinct v.visitor) filter (where v.day > today - 30),
           count(*) filter (where v.day = today),
           count(*)
    from public.visits v where v.page = 'index';
end $$;

revoke all on function public.visit_stats(int) from public, anon;
revoke all on function public.visit_summary() from public, anon;
grant execute on function public.visit_stats(int) to authenticated;
grant execute on function public.visit_summary() to authenticated;
