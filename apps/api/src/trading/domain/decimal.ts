export const FINANCIAL_SCALE = 18;

const MAX_FINANCIAL_PRECISION = 38;
const MAX_FINANCIAL_INTEGER_DIGITS = MAX_FINANCIAL_PRECISION - FINANCIAL_SCALE;
const DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

type DecimalValue = Readonly<{
  coefficient: bigint;
  scale: number;
}>;

export class TradingDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TradingDomainError";
  }
}

/**
 * Parses only fixed-point decimal strings so business calculations never depend
 * on JavaScript's binary floating-point representation.
 */
function parseDecimal(value: string): DecimalValue {
  if (typeof value !== "string" || !DECIMAL_PATTERN.test(value)) {
    throw new TradingDomainError("Decimal values must use a fixed-point string format.");
  }

  const negative = value.startsWith("-");
  const [integer, fractional = ""] = (negative ? value.slice(1) : value).split(".");
  if (integer.length > MAX_FINANCIAL_INTEGER_DIGITS || fractional.length > FINANCIAL_SCALE) {
    throw new TradingDomainError(
      `Decimal values must fit PostgreSQL NUMERIC(${MAX_FINANCIAL_PRECISION}, ${FINANCIAL_SCALE}).`,
    );
  }

  const coefficient = BigInt(`${integer}${fractional}`) * (negative ? -1n : 1n);
  return normalize({ coefficient, scale: fractional.length });
}

function normalize(value: DecimalValue): DecimalValue {
  if (value.coefficient === 0n) return { coefficient: 0n, scale: 0 };

  let coefficient = value.coefficient;
  let scale = value.scale;
  while (scale > 0 && coefficient % 10n === 0n) {
    coefficient /= 10n;
    scale--;
  }
  return { coefficient, scale };
}

function powerOfTen(exponent: number): bigint {
  if (!Number.isSafeInteger(exponent) || exponent < 0) {
    throw new TradingDomainError("Decimal scale must be a non-negative safe integer.");
  }
  return 10n ** BigInt(exponent);
}

function align(left: DecimalValue, right: DecimalValue): readonly [bigint, bigint] {
  const scale = Math.max(left.scale, right.scale);
  return [
    left.coefficient * powerOfTen(scale - left.scale),
    right.coefficient * powerOfTen(scale - right.scale),
  ];
}

function compare(left: DecimalValue, right: DecimalValue): number {
  const [alignedLeft, alignedRight] = align(left, right);
  if (alignedLeft === alignedRight) return 0;
  return alignedLeft > alignedRight ? 1 : -1;
}

function add(left: DecimalValue, right: DecimalValue): DecimalValue {
  const scale = Math.max(left.scale, right.scale);
  const [alignedLeft, alignedRight] = align(left, right);
  return normalize({ coefficient: alignedLeft + alignedRight, scale });
}

function subtract(left: DecimalValue, right: DecimalValue): DecimalValue {
  return add(left, { coefficient: -right.coefficient, scale: right.scale });
}

function multiply(left: DecimalValue, right: DecimalValue): DecimalValue {
  return normalize({
    coefficient: left.coefficient * right.coefficient,
    scale: left.scale + right.scale,
  });
}

function divide(left: DecimalValue, right: DecimalValue, scale = FINANCIAL_SCALE): DecimalValue {
  if (right.coefficient === 0n) throw new TradingDomainError("Cannot divide by zero.");

  const negative = left.coefficient < 0n !== right.coefficient < 0n;
  let numerator = absolute(left.coefficient);
  let denominator = absolute(right.coefficient);
  const exponent = scale + right.scale - left.scale;
  if (exponent >= 0) numerator *= powerOfTen(exponent);
  else denominator *= powerOfTen(-exponent);

  let quotient = numerator / denominator;
  const remainder = numerator % denominator;
  // Store values at one precision everywhere; ties round away from zero.
  if (remainder * 2n >= denominator) quotient++;
  return normalize({ coefficient: negative ? -quotient : quotient, scale });
}

function roundToScale(value: DecimalValue, scale: number): DecimalValue {
  if (value.scale <= scale) return value;

  const factor = powerOfTen(value.scale - scale);
  const negative = value.coefficient < 0n;
  const absoluteCoefficient = absolute(value.coefficient);
  let quotient = absoluteCoefficient / factor;
  const remainder = absoluteCoefficient % factor;
  if (remainder * 2n >= factor) quotient++;
  return normalize({ coefficient: negative ? -quotient : quotient, scale });
}

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function format(value: DecimalValue): string {
  const normalized = normalize(value);
  if (normalized.coefficient === 0n) return "0";

  const negative = normalized.coefficient < 0n;
  const digits = absolute(normalized.coefficient).toString();
  if (normalized.scale === 0) return `${negative ? "-" : ""}${digits}`;

  const padded = digits.padStart(normalized.scale + 1, "0");
  const integer = padded.slice(0, -normalized.scale);
  const fractional = padded.slice(-normalized.scale);
  return `${negative ? "-" : ""}${integer}.${fractional}`;
}

function formatFinancial(value: DecimalValue): string {
  const rounded = roundToScale(value, FINANCIAL_SCALE);
  const integerDigits = Math.max(
    0,
    absolute(rounded.coefficient).toString().length - rounded.scale,
  );
  if (integerDigits > MAX_FINANCIAL_INTEGER_DIGITS) {
    throw new TradingDomainError(
      `Decimal values must fit PostgreSQL NUMERIC(${MAX_FINANCIAL_PRECISION}, ${FINANCIAL_SCALE}).`,
    );
  }
  return format(rounded);
}

export function compareDecimals(left: string, right: string): number {
  return compare(parseDecimal(left), parseDecimal(right));
}

export function addDecimals(left: string, right: string): string {
  return formatFinancial(add(parseDecimal(left), parseDecimal(right)));
}

export function subtractDecimals(left: string, right: string): string {
  return formatFinancial(subtract(parseDecimal(left), parseDecimal(right)));
}

export function multiplyDecimals(left: string, right: string): string {
  return formatFinancial(multiply(parseDecimal(left), parseDecimal(right)));
}

export function divideDecimals(left: string, right: string): string {
  return formatFinancial(divide(parseDecimal(left), parseDecimal(right)));
}

export function normalizeFinancialDecimal(value: string): string {
  return formatFinancial(parseDecimal(value));
}

export function requireNonNegativeDecimal(value: string, fieldName: string): string {
  const parsed = parseDecimal(value);
  if (parsed.coefficient < 0n) throw new TradingDomainError(`${fieldName} cannot be negative.`);
  return formatFinancial(parsed);
}

export function requirePositiveDecimal(value: string, fieldName: string): string {
  const parsed = parseDecimal(value);
  if (parsed.coefficient <= 0n) {
    throw new TradingDomainError(`${fieldName} must be greater than zero.`);
  }
  return formatFinancial(parsed);
}

export function calculateQuoteAmount(price: string, quantity: string): string {
  const normalizedPrice = requirePositiveDecimal(price, "price");
  const normalizedQuantity = requirePositiveDecimal(quantity, "quantity");
  const amount = formatFinancial(
    multiply(parseDecimal(normalizedPrice), parseDecimal(normalizedQuantity)),
  );
  if (amount === "0") {
    throw new TradingDomainError("price multiplied by quantity is too small to persist.");
  }
  return amount;
}

/**
 * Calculates weighted average cost at full intermediate precision, then rounds
 * only the persisted result to the database financial scale.
 */
export function calculateWeightedAverageCost(
  existingQuantity: string,
  existingAverageCost: string,
  purchasedQuantity: string,
  purchasePrice: string,
): string {
  const currentQuantity = parseDecimal(
    requireNonNegativeDecimal(existingQuantity, "existing quantity"),
  );
  const currentAverageCost = parseDecimal(
    requireNonNegativeDecimal(existingAverageCost, "existing average cost"),
  );
  const buyQuantity = parseDecimal(requirePositiveDecimal(purchasedQuantity, "quantity"));
  const buyPrice = parseDecimal(requirePositiveDecimal(purchasePrice, "purchase price"));
  const totalQuantity = add(currentQuantity, buyQuantity);
  const totalCost = add(
    multiply(currentQuantity, currentAverageCost),
    multiply(buyQuantity, buyPrice),
  );

  return formatFinancial(divide(totalCost, totalQuantity));
}
