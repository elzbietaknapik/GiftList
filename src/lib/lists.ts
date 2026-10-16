import { supabase } from '@/lib/supabase';

export type GiftList = {
  id: string;
  name: string;
  share_token: string;
  created_at: string;
};

export class ListAlreadyExistsError extends Error {
  constructor() {
    super('Lista już istnieje.');
    this.name = 'ListAlreadyExistsError';
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
