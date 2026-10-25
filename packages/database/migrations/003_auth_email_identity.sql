-- 003_auth_email_identity.sql
-- Additive: links public.users to Supabase Auth (email/password) without removing Telegram.
-- Apply on staging first, then production. Forward-only.
--
-- Prerequisites (Supabase Dashboard):
--   Authentication → Providers → Email → enabled
--   Optional: disable public signups; owners created via invite/admin API later.
--
-- Does NOT change primary key on users (still tg_id). Telegram-only rows stay valid.

begin;

alter table users
  add column if not exists auth_user_id uuid unique;

alter table users
  add column if not exists email text unique;

comment on column users.auth_user_id is 'auth.users.id when the person signs in with email/password';
comment on column users.email is 'Login email; unique platform-wide when set';

create index if not exists users_auth_user_id_idx
  on users (auth_user_id)
  where auth_user_id is not null;

create index if not exists users_email_idx
  on users (email)
  where email is not null;

-- Optional FK (Supabase hosts auth schema in same database):
-- alter table users
--   add constraint users_auth_user_id_fkey
--   foreign key (auth_user_id) references auth.users (id) on delete set null;

commit;
