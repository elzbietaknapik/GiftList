-- GiftList: initial schema (deploy-plan.md §4.1)

-- Tabele
create table public.gifts_lists (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  share_token uuid not null default gen_random_uuid() unique,
  created_at  timestamptz not null default now()
);
create unique index gifts_lists_one_per_owner on public.gifts_lists (owner_id); -- FR-003

create table public.gifts (
  id          uuid primary key default gen_random_uuid(),
  list_id     uuid not null references public.gifts_lists(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  link        text not null,
  price       numeric(10,2) not null check (price >= 0),
  image_url   text,
  status      text not null default 'free'
              check (status in ('free','reserved','purchased')),
  created_at  timestamptz not null default now()
);
create index gifts_list_id_idx on public.gifts (list_id); -- Risk #8

create table public.list_members (               -- dostęp gości, decyzja 3
  list_id   uuid not null references public.gifts_lists(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (list_id, user_id)
);

create table public.reservations (               -- tożsamość: ZAMKNIĘTA dla klienta
  id               uuid primary key default gen_random_uuid(),
  gift_id          uuid not null unique references public.gifts(id) on delete cascade,
  reserver_user_id uuid not null references auth.users(id) on delete cascade,
  created_at       timestamptz not null default now(),
  purchased_at     timestamptz
);

-- RLS
alter table public.gifts_lists enable row level security;
alter table public.gifts enable row level security;
alter table public.list_members enable row level security;
alter table public.reservations enable row level security;

-- gifts_lists: właściciel lub członek widzi; zapis/usuwanie tylko właściciel
-- (kolumny zewnętrznego wiersza kwalifikowane jawnie: gifts_lists.id)
create policy select_lists on public.gifts_lists for select to authenticated
  using (owner_id = auth.uid()
      or exists (select 1 from public.list_members m
                 where m.list_id = gifts_lists.id and m.user_id = auth.uid()));
create policy insert_lists on public.gifts_lists for insert to authenticated
  with check (owner_id = auth.uid());
create policy update_lists on public.gifts_lists for update to authenticated
  using (owner_id = auth.uid());
create policy delete_lists on public.gifts_lists for delete to authenticated
  using (owner_id = auth.uid()
     and not exists (select 1 from public.gifts g
                     join public.reservations r on r.gift_id = g.id
                     where g.list_id = gifts_lists.id));  -- FR-004

-- gifts: widoczność jak listy; usunięcie tylko niezarezerwowanego (FR-006)
create policy select_gifts on public.gifts for select to authenticated
  using (exists (select 1 from public.gifts_lists gl
                 where gl.id = gifts.list_id and gl.owner_id = auth.uid())
      or exists (select 1 from public.list_members m
                 where m.list_id = gifts.list_id and m.user_id = auth.uid()));
create policy insert_gifts on public.gifts for insert to authenticated
  with check (exists (select 1 from public.gifts_lists gl
                      where gl.id = gifts.list_id and gl.owner_id = auth.uid()));
create policy update_gifts on public.gifts for update to authenticated
  using (exists (select 1 from public.gifts_lists gl
                 where gl.id = gifts.list_id and gl.owner_id = auth.uid()));
create policy delete_gifts on public.gifts for delete to authenticated
  using (exists (select 1 from public.gifts_lists gl
                 where gl.id = gifts.list_id and gl.owner_id = auth.uid())
     and status = 'free');

-- list_members: wstawianie wyłącznie przez security-definer RPC
create policy select_members on public.list_members for select to authenticated
  using (user_id = auth.uid());

-- reservations: zero bezpośredniego dostępu (Risk #1)
revoke all on public.reservations from anon, authenticated;
revoke all on public.list_members from anon;

-- Widok statusów bez tożsamości
create view public.reservation_status
  with (security_invoker = true) as
  select r.gift_id, r.created_at, r.purchased_at
  from public.reservations r;
grant select on public.reservation_status to authenticated;

-- RPC (security definer = atomowość + dostęp do zamkniętej tabeli)
create or replace function public.open_shared_list(p_token uuid)
returns public.gifts_lists language sql security definer set search_path = public as $$
  insert into public.list_members (list_id, user_id)
  select id, auth.uid() from public.gifts_lists where share_token = p_token
  on conflict do nothing;
  select * from public.gifts_lists where share_token = p_token;
$$;

create or replace function public.reserve_gift(p_gift_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.gifts_lists gl
    join public.gifts g on g.list_id = gl.id
    left join public.list_members m on m.list_id = gl.id and m.user_id = auth.uid()
    where g.id = p_gift_id and (gl.owner_id = auth.uid() or m.user_id is not null)
  ) then raise exception 'no access to this list'; end if;
  update public.gifts set status = 'reserved' where id = p_gift_id and status = 'free';
  if not found then raise exception 'gift is not free'; end if;
  insert into public.reservations (gift_id, reserver_user_id)
  values (p_gift_id, auth.uid());
end $$;

create or replace function public.mark_gift_purchased(p_gift_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.reservations
     set purchased_at = now()
   where gift_id = p_gift_id and reserver_user_id = auth.uid();
  if not found then raise exception 'only the reserver can mark as purchased'; end if;
  update public.gifts set status = 'purchased' where id = p_gift_id;
end $$;

create or replace function public.my_reserved_gift_ids()
returns uuid[] language sql security definer set search_path = public as $$
  select coalesce(array_agg(gift_id), '{}')
  from public.reservations where reserver_user_id = auth.uid();
$$;

revoke all on function public.reserve_gift(uuid), public.mark_gift_purchased(uuid),
                 public.open_shared_list(uuid), public.my_reserved_gift_ids() from public;
grant execute on function public.reserve_gift(uuid), public.mark_gift_purchased(uuid),
                 public.open_shared_list(uuid), public.my_reserved_gift_ids() to authenticated;

-- Realtime: publikujemy TYLKO gifts (decyzja 1; Risk #6). NIE reservations.
alter publication supabase_realtime set table public.gifts;