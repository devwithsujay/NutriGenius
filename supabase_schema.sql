-- Run this entire script in the Supabase SQL Editor

-- 1. Create Profiles Table (extends the built-in auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  username text unique,
  name text default '',
  age integer default 30,
  gender text default 'Male',
  weight real default 70.0,
  height real default 170.0,
  activity text default 'Moderate',
  goal text default 'Fat Loss',
  diet_type text default 'Vegetarian',
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Enable RLS for profiles
alter table public.profiles enable row level security;
create policy "Users can view their own profile." on profiles for select using (auth.uid() = id);
create policy "Users can update their own profile." on profiles for update using (auth.uid() = id);
create policy "Users can insert their own profile." on profiles for insert with check (auth.uid() = id);

-- Trigger to automatically create a profile when a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, name)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- 2. Create History Table
create table public.history (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  feature text not null,
  inputs jsonb default '{}'::jsonb,
  output_preview text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Enable RLS for history
alter table public.history enable row level security;
create policy "Users can view their own history." on history for select using (auth.uid() = user_id);
create policy "Users can insert their own history." on history for insert with check (auth.uid() = user_id);


-- 3. Create Saved Plans Table
create table public.saved_plans (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  feature text not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  unique(user_id, feature) -- One saved plan per feature per user
);

-- Enable RLS for saved_plans
alter table public.saved_plans enable row level security;
create policy "Users can view their own saved plans." on saved_plans for select using (auth.uid() = user_id);
create policy "Users can insert their own saved plans." on saved_plans for insert with check (auth.uid() = user_id);
create policy "Users can update their own saved plans." on saved_plans for update using (auth.uid() = user_id);
