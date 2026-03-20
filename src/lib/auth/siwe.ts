import crypto from "crypto";
import { SiweMessage } from "siwe";
import { getAddress } from "viem";

export function generateNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

export async function verifySiweMessage(
  message: string,
  signature: string,
  expectedNonce: string,
): Promise<string> {
  const siweMessage = new SiweMessage(message);

  const result = await siweMessage.verify({ signature });

  if (!result.success) {
    throw new Error(result.error?.type ?? "SIWE verification failed");
  }

  if (result.data.nonce !== expectedNonce) {
    throw new Error("Nonce mismatch");
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    throw new Error("NEXT_PUBLIC_APP_URL is not configured");
  }

  const expectedDomain = new URL(appUrl).host;
  if (result.data.domain !== expectedDomain) {
    throw new Error("Domain mismatch");
  }

  // Validate the URI matches the expected app URL origin
  if (result.data.uri) {
    const expectedOrigin = new URL(appUrl).origin;
    const messageOrigin = new URL(result.data.uri).origin;
    if (messageOrigin !== expectedOrigin) {
      throw new Error("URI mismatch");
    }
  }

  return getAddress(result.data.address);
}
