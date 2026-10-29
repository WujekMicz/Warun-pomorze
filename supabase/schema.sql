-- Warun Pomorze – baza w Supabase. Wklej całość w SQL Editor i uruchom raz.
-- Konta zakłada tylko admin (admin.py, klucz secret). Publiczna rejestracja wyłączona w ustawieniach Auth.

-- Profil: login i flaga „hasło startowe do zmiany”. Tworzony automatycznie przy zakładaniu konta.
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  login        text not null unique,
  display_name text not null default '',
  must_change  boolean not null default true,
  created_at   timestamptz not null default now()
);

-- Własne skrzydła: progi w m/s.
create table if not exists public.wings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 40),
  wmin       real not null check (wmin >= 0 and wmin <= 30),
  wmax       real not null check (wmax > wmin and wmax <= 30),
  gust       real not null check (gust >= wmax and gust <= 40),
  spread     real not null check (spread > 0 and spread <= 20),
  created_at timestamptz not null default now()
);
create index if not exists wings_user on public.wings(user_id);

alter table public.profiles enable row level security;
alter table public.wings    enable row level security;

-- Każdy widzi i zmienia tylko swoje dane.
drop policy if exists "profil: odczyt" on public.profiles;
create policy "profil: odczyt" on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "profil: zmiana" on public.profiles;
create policy "profil: zmiana" on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- Użytkownik może zmienić tylko te kolumny (loginu nie).
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (display_name, must_change) on public.profiles to authenticated;

drop policy if exists "skrzydła: odczyt" on public.wings;
create policy "skrzydła: odczyt" on public.wings for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "skrzydła: dodanie" on public.wings;
create policy "skrzydła: dodanie" on public.wings for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists "skrzydła: zmiana" on public.wings;
create policy "skrzydła: zmiana" on public.wings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "skrzydła: usunięcie" on public.wings;
create policy "skrzydła: usunięcie" on public.wings for delete to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.wings from anon;

-- Limit 20 skrzydeł na osobę.
create or replace function public.wings_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.wings where user_id = new.user_id) >= 20 then
    raise exception 'Limit 20 skrzydeł na konto';
  end if;
  return new;
end $$;
drop trigger if exists wings_limit on public.wings;
create trigger wings_limit before insert on public.wings for each row execute function public.wings_limit();

-- Profil zakładany razem z kontem (login z metadanych albo z części adresu przed @).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, login, display_name)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'login', split_part(new.email, '@', 1)),
          coalesce(new.raw_user_meta_data->>'display_name', ''));
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
