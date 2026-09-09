CREATE TABLE "wallet_balances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "asset" VARCHAR(20) NOT NULL,
    "available" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "locked" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wallet_balances_pkey" PRIMARY KEY ("id"),
    -- Prisma does not express CHECK constraints; keep these in migrations.
    CONSTRAINT "wallet_balances_available_check" CHECK (available >= 0 AND available < 'Infinity'::numeric),
    CONSTRAINT "wallet_balances_locked_check" CHECK (locked >= 0 AND locked < 'Infinity'::numeric)
);
CREATE UNIQUE INDEX "wallet_balances_user_id_asset_key" ON "wallet_balances"("user_id", "asset");
ALTER TABLE "wallet_balances" ADD CONSTRAINT "wallet_balances_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
