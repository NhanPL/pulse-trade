type RealtimeWireData = string | Buffer | ArrayBuffer | Buffer[];

export type ParsedRealtimeMessage = Readonly<{
  data: unknown;
  event: string;
}>;

export function parseRealtimeMessage(data: RealtimeWireData): ParsedRealtimeMessage | undefined {
  const payload = JSON.parse(toUtf8(data)) as unknown;

  if (!isRecord(payload) || typeof payload.action !== "string") return undefined;

  return {
    data: payload,
    event: payload.action,
  };
}

function toUtf8(data: RealtimeWireData): string {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  return Buffer.from(data).toString("utf8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
