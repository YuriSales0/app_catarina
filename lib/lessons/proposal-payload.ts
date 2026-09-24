import type { ActivityProposal } from "@/schemas/ai-proposals";

export type PlayProposal = { proposal: ActivityProposal; packId: string };

/**
 * Reads an accepted activity proposal from an AI_PROPOSAL_RECEIVED payload.
 * The payload stores the ActivityContent ({ proposal, packId }); older rows may
 * hold the bare proposal. Returns null for anything else.
 */
export function proposalFromPayload(payload: unknown): PlayProposal | null {
  const p = payload as { proposal?: unknown; pack_id?: string } | null;
  const raw = p?.proposal as { items?: unknown; proposal?: ActivityProposal; packId?: string } | undefined;
  if (!raw) return null;
  if (Array.isArray(raw.items)) return { proposal: raw as unknown as ActivityProposal, packId: String(p?.pack_id ?? "") };
  if (raw.proposal && Array.isArray(raw.proposal.items)) return { proposal: raw.proposal, packId: String(raw.packId ?? p?.pack_id ?? "") };
  return null;
}
