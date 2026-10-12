/**
 * Offline token counting.
 *
 * OpenAI models get exact counts from gpt-tokenizer. Claude, Gemini and other
 * models have no tokenizer available offline, so their counts are estimates
 * (marked approximate) and the UI shows them with a "~".
 */

export type TokenizerKind = 'o200k' | 'cl100k' | 'estimate';

export interface TokenCount {
  tokens: number;
  tokenizer: TokenizerKind;
  /** False only for exact counts. */
  approximate: boolean;
}

type EncodeFn = (text: string, options?: { disallowedSpecial?: Set<string> }) => number[];

/** Above this size the BPE pass gets slow; fall back to the estimate. */
const MAX_EXACT_CHARS = 3_000_000;

export function pickTokenizer(model: string): { kind: TokenizerKind; exact: boolean } {
  const m = model.trim().toLowerCase();
  if (/^(gpt-4o|gpt-4\.1|gpt-4\.5|gpt-5|chatgpt-4o|o1|o3|o4)/.test(m)) return { kind: 'o200k', exact: true };
  if (/^(gpt-4|gpt-3\.5|text-embedding)/.test(m)) return { kind: 'cl100k', exact: true };
  // Claude and others: the o200k count is a reasonable stand-in, but not exact.
  if (m.startsWith('claude')) return { kind: 'o200k', exact: false };
  return { kind: 'estimate', exact: false };
}

function loadEncoder(kind: 'o200k' | 'cl100k'): EncodeFn {
  // Static require paths so esbuild can bundle them; loaded lazily on first use.
  const mod =
    kind === 'o200k'
      ? // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('gpt-tokenizer/encoding/o200k_base')
      : // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('gpt-tokenizer/encoding/cl100k_base');
  return mod.encode as EncodeFn;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function countTokens(text: string, model: string): TokenCount {
  const pick = pickTokenizer(model);
  if (pick.kind === 'estimate' || text.length > MAX_EXACT_CHARS) {
    return { tokens: estimateTokens(text), tokenizer: 'estimate', approximate: true };
  }
  try {
    const encode = loadEncoder(pick.kind);
    // Source code may contain strings like "<|endoftext|>"; count them as plain text.
    const tokens = encode(text, { disallowedSpecial: new Set() }).length;
    return { tokens, tokenizer: pick.kind, approximate: !pick.exact };
  } catch {
    return { tokens: estimateTokens(text), tokenizer: 'estimate', approximate: true };
  }
}

export function formatTokenCount(c: TokenCount): string {
  return `${c.approximate ? '~' : ''}${c.tokens.toLocaleString('en-US')} tokens`;
}
