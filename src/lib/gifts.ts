import { supabase } from '@/lib/supabase';

export type GiftStatus = 'free' | 'reserved' | 'purchased';

export type Gift = {
  id: string;
  list_id: string;
  name: string;
  link: string;
  price: number;
  image_url: string | null;
  status: GiftStatus;
  created_at: string;
};

export type NewGift = {
  name: string;
  link: string;
  price: number;
  image_url: string | null;
};

export type GiftFieldErrors = Partial<Record<'name' | 'link' | 'price' | 'image', string>>;

export class GiftAlreadyReservedError extends Error {
  constructor() {
    super('Prezent jest już zarezerwowany.');
    this.name = 'GiftAlreadyReservedError';
  }
}

const GIFT_COLUMNS = 'id,list_id,name,link,price,image_url,status,created_at';
const PRICE_PATTERN = /^\d+(\.\d{1,2})?$/;
const MAX_PRICE = 99999999.99;

type GiftRow = Omit<Gift, 'price'> & { price: number | string };

function toGift(row: GiftRow): Gift {
  return { ...row, price: Number(row.price) };
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function parseGiftInput(raw: {
  name: string;
  link: string;
  price: string;
  image: string;
}): { value: NewGift; errors: null } | { value: null; errors: GiftFieldErrors } {
  const name = raw.name.trim();
  const link = raw.link.trim();
  const priceRaw = raw.price.trim().replace(',', '.');
  const image = raw.image.trim();

  const errors: GiftFieldErrors = {};

  if (!name) {
    errors.name = 'Podaj nazwę prezentu.';
  }

  if (!link) {
    errors.link = 'Podaj link do prezentu.';
  } else if (!isHttpUrl(link)) {
    errors.link = 'Link musi zaczynać się od http:// lub https://.';
  }

  let price = 0;
  if (!priceRaw) {
    errors.price = 'Podaj cenę.';
  } else {
    price = Number(priceRaw);
    if (!PRICE_PATTERN.test(priceRaw) || !Number.isFinite(price) || price > MAX_PRICE) {
      errors.price = 'Cena musi być liczbą ≥ 0 z maksymalnie 2 miejscami po przecinku.';
    }
  }

  if (image && !isHttpUrl(image)) {
    errors.image = 'Link do zdjęcia musi zaczynać się od http:// lub https://.';
  }

  if (Object.keys(errors).length > 0) {
    return { value: null, errors };
  }

  return {
    value: { name, link, price, image_url: image || null },
    errors: null,
  };
}

export async function listGifts(listId: string): Promise<Gift[]> {
  const { data, error } = await supabase
    .from('gifts')
    .select(GIFT_COLUMNS)
    .eq('list_id', listId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as GiftRow[]).map(toGift);
}

export async function addGift(listId: string, gift: NewGift): Promise<Gift> {
  const { data, error } = await supabase
    .from('gifts')
    .insert({ list_id: listId, ...gift })
    .select(GIFT_COLUMNS)
    .single();

  if (error) {
    throw new Error(error.message);
  }
  return toGift(data as GiftRow);
}

export async function reserveGift(giftId: string): Promise<void> {
  const { error } = await supabase.rpc('reserve_gift', { p_gift_id: giftId });

  if (error) {
    if (error.message.includes('gift is not free')) {
      throw new GiftAlreadyReservedError();
    }
    if (error.message.includes('no access to this list')) {
      throw new Error('Nie masz dostępu do tej listy.');
    }
    throw new Error(error.message);
  }
}
