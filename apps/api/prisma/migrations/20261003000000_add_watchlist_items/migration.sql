CREATE TABLE "watchlist_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "symbol" VARCHAR(41) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlist_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "watchlist_items_symbol_check" CHECK (symbol ~ '^[A-Z0-9]{1,20}-[A-Z0-9]{1,20}$')
);

-- The leading user_id also indexes account-scoped reads and deletes.
CREATE UNIQUE INDEX "watchlist_items_user_id_symbol_key" ON "watchlist_items"("user_id", "symbol");

ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
