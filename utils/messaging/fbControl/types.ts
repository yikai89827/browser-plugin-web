export type FbControlIncomingMessage = {
  action: string;
  data?: unknown;
};

export type FbControlMessageResult =
  | { success: true; payload?: unknown }
  | { success: false; error: string }
  | null;
