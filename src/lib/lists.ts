import { supabase } from '@/lib/supabase';

export type GiftList = {
  id: string;
  name: string;
  share_token: string;
  created_at: string;
};

export type SharedGiftList = GiftList & { owner_id: string };

export class ListAlreadyExistsError extends Error {
  constructor() {
    super('Lista już istnieje.');
    this.name = 'ListAlreadyExistsError';
  }
}

export class ListHasReservationsError extends Error {
  constructor() {
    super('Nie można usunąć listy, która ma zarezerwowane lub zrealizowane prezenty.');
    this.name = 'ListHasReservationsError';
  }
}

export async function getMyList(userId: string): Promise<GiftList | null> {
  const { data, error } = await supabase
    .from('gifts_lists')
    .select('id,name,share_token,created_at')
    .eq('owner_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function createList(userId: string, name: string): Promise<GiftList> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Nazwa listy nie może być pusta.');
  }

  const { data, error } = await supabase
    .from('gifts_lists')
    .insert({ name: trimmed, owner_id: userId })
    .select('id,name,share_token,created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new ListAlreadyExistsError();
    }
    throw new Error(error.message);
  }
  return data;
}

export async function openSharedList(token: string): Promise<SharedGiftList> {
  const { data, error } = await supabase.rpc('open_shared_list', { p_token: token });

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error('Nie znaleziono listy.');
  }
  const { id, name, share_token, created_at, owner_id } = data as SharedGiftList;
  return { id, name, share_token, created_at, owner_id };
}

export async function deleteList(listId: string): Promise<void> {
  const { data, error } = await supabase
    .from('gifts_lists')
    .delete()
    .eq('id', listId)
    .select('id');

  if (error) {
    throw new Error(error.message);
  }
  if (!data || data.length === 0) {
    throw new ListHasReservationsError();
  }
}
