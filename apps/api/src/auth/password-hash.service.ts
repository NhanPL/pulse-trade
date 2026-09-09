import { Injectable } from "@nestjs/common";
import { argon2id, hash, verify } from "argon2";

@Injectable()
export class PasswordHashService {
  hash(password: string): Promise<string> {
    // Explicit OWASP Argon2id baseline; the library generates a fresh random salt.
    return hash(password, {
      type: argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
      hashLength: 32,
    });
  }

  async verify(password: string, passwordHash: string): Promise<boolean> {
    if (!passwordHash.startsWith("$argon2id$")) return false;

    try {
      return await verify(passwordHash, password);
    } catch {
      // A corrupt stored hash must never authenticate or expose credential data.
      return false;
    }
  }
}
