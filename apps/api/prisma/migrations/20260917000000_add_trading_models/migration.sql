-- CreateEnum
CREATE TYPE "order_side" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "order_type" AS ENUM ('MARKET', 'LIMIT');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('PENDING', 'FILLED', 'CANCELLED', 'REJECTED');

-- CreateTable
CREATE TABLE "positions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "asset" VARCHAR(20) NOT NULL,
    "quantity" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "average_cost_usd" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "realized_pnl_usd" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "positions_quantity_check" CHECK (quantity >= 0 AND quantity < 'Infinity'::numeric),
    CONSTRAINT "positions_average_cost_check" CHECK (average_cost_usd >= 0 AND average_cost_usd < 'Infinity'::numeric),
    CONSTRAINT "positions_realized_pnl_check" CHECK (realized_pnl_usd > '-Infinity'::numeric AND realized_pnl_usd < 'Infinity'::numeric)
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "symbol" VARCHAR(41) NOT NULL,
    "base_asset" VARCHAR(20) NOT NULL,
    "quote_asset" VARCHAR(20) NOT NULL,
    "side" "order_side" NOT NULL,
    "type" "order_type" NOT NULL,
    "status" "order_status" NOT NULL,
    "quantity" DECIMAL(38,18) NOT NULL,
    "limit_price" DECIMAL(38,18),
    "filled_quantity" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "avg_fill_price" DECIMAL(38,18),
    "reserved_asset" VARCHAR(20),
    "reserved_amount" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "idempotency_key" VARCHAR(255),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filled_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "rejection_reason_code" VARCHAR(100),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "orders_quantity_check" CHECK (quantity > 0 AND quantity < 'Infinity'::numeric),
    CONSTRAINT "orders_limit_price_check" CHECK (
        (type = 'MARKET' AND limit_price IS NULL) OR
        (type = 'LIMIT' AND limit_price IS NOT NULL AND limit_price > 0 AND limit_price < 'Infinity'::numeric)
    ),
    CONSTRAINT "orders_filled_quantity_check" CHECK (filled_quantity >= 0 AND filled_quantity <= quantity AND filled_quantity < 'Infinity'::numeric),
    CONSTRAINT "orders_avg_fill_price_check" CHECK (avg_fill_price IS NULL OR (avg_fill_price > 0 AND avg_fill_price < 'Infinity'::numeric)),
    CONSTRAINT "orders_reserved_amount_check" CHECK (reserved_amount >= 0 AND reserved_amount < 'Infinity'::numeric)
);

-- CreateTable
CREATE TABLE "trades" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "symbol" VARCHAR(41) NOT NULL,
    "side" "order_side" NOT NULL,
    "price" DECIMAL(38,18) NOT NULL,
    "quantity" DECIMAL(38,18) NOT NULL,
    "quote_amount" DECIMAL(38,18) NOT NULL,
    "executed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trades_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "trades_price_check" CHECK (price > 0 AND price < 'Infinity'::numeric),
    CONSTRAINT "trades_quantity_check" CHECK (quantity > 0 AND quantity < 'Infinity'::numeric),
    CONSTRAINT "trades_quote_amount_check" CHECK (quote_amount > 0 AND quote_amount < 'Infinity'::numeric)
);

-- CreateIndex
CREATE UNIQUE INDEX "positions_user_id_asset_key" ON "positions"("user_id", "asset");

-- CreateIndex
CREATE UNIQUE INDEX "orders_id_user_id_key" ON "orders"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_user_id_idempotency_key_key" ON "orders"("user_id", "idempotency_key")
    WHERE "idempotency_key" IS NOT NULL;

-- CreateIndex
CREATE INDEX "orders_user_id_created_at_idx" ON "orders"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "orders_user_id_status_created_at_idx" ON "orders"("user_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "orders_status_symbol_idx" ON "orders"("status", "symbol");

-- CreateIndex
CREATE INDEX "trades_user_id_executed_at_idx" ON "trades"("user_id", "executed_at" DESC);

-- CreateIndex
CREATE INDEX "trades_order_id_idx" ON "trades"("order_id");

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_order_user_fkey"
    FOREIGN KEY ("order_id", "user_id") REFERENCES "orders"("id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
