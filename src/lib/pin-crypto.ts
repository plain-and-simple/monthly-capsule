import { compare, hash } from "bcryptjs";
import { randomInt } from "crypto";

const ROUNDS = 12;

export function generatePin(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function hashPin(pin: string): Promise<string> {
  return hash(pin, ROUNDS);
}

export async function verifyPin(pin: string, pinHash: string): Promise<boolean> {
  return compare(pin, pinHash);
}
