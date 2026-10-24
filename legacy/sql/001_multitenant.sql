begin;

create table garages (
  id bigint generated always as identity primary key,
  name text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table users (
  tg_id text primary key,
  garage_id bigint not null references garages(id) on delete cascade,
  role text not null check (role in ('owner','staff')),
  name text not null,
  created_at timestamptz not null default now()
);

insert into garages (name) values ('Мой гараж');
insert into users values ('359896904', 1, 'owner', 'Владелец');
insert into users select tg_id, 1, 'staff', name from staff;

alter table units add column garage_id bigint references garages(id) on delete cascade;
alter table marks add column garage_id bigint references garages(id) on delete cascade;
alter table parts add column garage_id bigint references garages(id) on delete cascade;
alter table marks add column engine_hours numeric;

update units set garage_id = 1;
update marks set garage_id = 1;
update parts set garage_id = 1;

alter table units alter column garage_id set not null;
alter table marks alter column garage_id set not null;
alter table parts alter column garage_id set not null;

create index units_garage_idx on units(garage_id);
create index marks_garage_idx on marks(garage_id);
create index parts_garage_idx on parts(garage_id);

alter table garages enable row level security;
alter table users enable row level security;
alter table staff enable row level security;
alter table units enable row level security;
alter table marks enable row level security;
alter table parts enable row level security;

commit;
