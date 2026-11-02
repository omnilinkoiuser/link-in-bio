-- OmniLink database setup. Paste this whole file into Supabase > SQL Editor and click Run.

create or replace function public.is_reserved_slug(value text)
returns boolean
language sql
immutable
as $$
  select value = any (array[
    '404', 'abuse', 'about', 'account', 'admin', 'api', 'app', 'auth', 'billing', 'blog',
    'cloud', 'config', 'contact', 'dashboard', 'docs', 'edit', 'editor', 'help', 'home',
    'index', 'legal', 'login', 'logout', 'new', 'official', 'omnilink', 'password', 'pay',
    'privacy', 'profile', 'publish', 'register', 'report', 'root', 'security', 'settings',
    'signin', 'signup', 'staff', 'support', 'system', 'team', 'templates', 'terms', 'user',
    'users', 'verify', 'www'
  ]);
$$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  slug text not null unique
    constraint slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$')
    constraint slug_allowed check (not public.is_reserved_slug(slug)),
  state jsonb not null
    constraint state_size check (octet_length(state::text) <= 2097152),
  html text not null
    constraint html_size check (octet_length(html) <= 2097152),
  published boolean not null default true,
  -- Set to true in the Table Editor to take a page down. Owners can't change this.
  blocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;

drop policy if exists "Anyone can read live pages" on public.profiles;
create policy "Anyone can read live pages"
  on public.profiles for select
  using (published and not blocked);

drop policy if exists "Owners can read their page" on public.profiles;
create policy "Owners can read their page"
  on public.profiles for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Owners can create their page" on public.profiles;
create policy "Owners can create their page"
  on public.profiles for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Owners can update their page" on public.profiles;
create policy "Owners can update their page"
  on public.profiles for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Owners can delete their page" on public.profiles;
create policy "Owners can delete their page"
  on public.profiles for delete to authenticated
  using (auth.uid() = user_id);

-- Limit what each role can touch. Visitors only ever see a live page's address and HTML,
-- and nobody but you (through the dashboard) can change "blocked". The update grant includes
-- user_id because saving is an upsert; the policies above stop it being set to anyone else.
revoke all on public.profiles from anon, authenticated;
grant select (slug, html, published, blocked) on public.profiles to anon;
grant select (user_id, slug, state, html, published, blocked, updated_at) on public.profiles to authenticated;
grant insert (user_id, slug, state, html, published) on public.profiles to authenticated;
grant update (user_id, slug, state, html, published) on public.profiles to authenticated;
grant delete on public.profiles to authenticated;
