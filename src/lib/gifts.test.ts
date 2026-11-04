import { beforeEach, describe, expect, it, vi } from "vitest";

import { GiftNotEditableError, updateGift, type NewGift } from "@/lib/gifts";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: fromMock },
}));

const giftInput: NewGift = {
  name: "Kawa",
  link: "https://example.com/kawa",
  price: 49.99,
  image_url: null,
};

const updatedRow = {
  id: "gift-1",
  list_id: "list-1",
  ...giftInput,
  status: "free" as const,
  created_at: "2026-11-04T12:00:00.000Z",
};

function queryReturning(result: { data: unknown; error: null }) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    update: vi.fn(() => query),
    limit: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
  };
  return query;
}

describe("updateGift", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("throws GiftNotEditableError when the gift is already reserved", async () => {
    const giftsQuery = queryReturning({ data: { status: "reserved" }, error: null });
    fromMock.mockReturnValue(giftsQuery);

    await expect(updateGift("gift-1", giftInput)).rejects.toBeInstanceOf(GiftNotEditableError);

    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith("gifts");
    expect(giftsQuery.eq).toHaveBeenCalledWith("id", "gift-1");
    expect(giftsQuery.update).not.toHaveBeenCalled();
  });

  it("throws GiftNotEditableError when the gift is already purchased", async () => {
    const giftsQuery = queryReturning({ data: { status: "purchased" }, error: null });
    fromMock.mockReturnValue(giftsQuery);

    await expect(updateGift("gift-1", giftInput)).rejects.toBeInstanceOf(GiftNotEditableError);

    expect(giftsQuery.update).not.toHaveBeenCalled();
  });

  it("throws GiftNotEditableError when a reservation exists even if status is free", async () => {
    const giftsQuery = queryReturning({ data: { status: "free" }, error: null });
    const reservationsQuery = queryReturning({ data: [{ gift_id: "gift-1" }], error: null });
    fromMock.mockReturnValueOnce(giftsQuery).mockReturnValueOnce(reservationsQuery);

    await expect(updateGift("gift-1", giftInput)).rejects.toBeInstanceOf(GiftNotEditableError);

    expect(fromMock).toHaveBeenNthCalledWith(1, "gifts");
    expect(fromMock).toHaveBeenNthCalledWith(2, "reservation_status");
    expect(giftsQuery.update).not.toHaveBeenCalled();
  });

  it("updates a free gift without a reservation", async () => {
    const giftsQuery = queryReturning({ data: { status: "free" }, error: null });
    const reservationsQuery = queryReturning({ data: [], error: null });
    const updateQuery = queryReturning({
      data: { ...updatedRow, price: "49.99" },
      error: null,
    });
    fromMock
      .mockReturnValueOnce(giftsQuery)
      .mockReturnValueOnce(reservationsQuery)
      .mockReturnValueOnce(updateQuery);

    const result = await updateGift("gift-1", giftInput);

    expect(result).toEqual(updatedRow);
    expect(updateQuery.update).toHaveBeenCalledWith(giftInput);
    expect(updateQuery.eq).toHaveBeenCalledWith("id", "gift-1");
    expect(updateQuery.eq).toHaveBeenCalledWith("status", "free");
  });
});
