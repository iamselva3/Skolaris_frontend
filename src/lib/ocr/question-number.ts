/**
 * Client-side question-number helpers for the OCR review UI.
 *
 * Visual drafts carry their OCR words in `draft.text`, beginning with the
 * question-start marker ("110. …", "Q.110 …", "110)Major"). The Question
 * Navigator derives numbers from that text so it needs NO backend change — the
 * same signal the engine uses, read on the client.
 */

/** The primary (leading) question number of a draft, or null if none is present. */
export const parseDraftNumber = (text: string | null | undefined): number | null => {
  const t = (text ?? '').trimStart();
  // "110." / "110)" / "110:" / "Q.110" / "Question 110" — punctuation may be glued.
  let m = /^(?:Q(?:uestion)?\.?\s*)?(\d{1,3})\s*[.):]/.exec(t);
  if (m) return Number(m[1]);
  // Glued, punctuation-less ("110Match") — ≥2 digits so it can't be an option.
  m = /^(\d{2,3})(?=[A-Za-z])/.exec(t);
  return m ? Number(m[1]) : null;
};

/** The single source of truth for a draft's question number across the whole UI
 *  (navigator, cards, detail modal): the authoritative `questionNumber`, falling
 *  back to the OCR text only when it's absent. NEVER the draft index/position. */
export const draftQuestionNumber = (draft: {
  questionNumber?: number | null;
  text?: string | null;
}): number | null => draft.questionNumber ?? parseDraftNumber(draft.text);

/** Display label — "Question 90" or, when no number is known, "Unnumbered". The
 *  internal array index (#0) is never shown to teachers. */
export const questionLabel = (draft: { questionNumber?: number | null; text?: string | null }): string => {
  const n = draftQuestionNumber(draft);
  return n != null ? `Question ${n}` : 'Unnumbered';
};

/** Distinct question numbers found anywhere in a crop's text. Two or more means
 *  the crop merged multiple questions. Option markers like "(1)" are paren-wrapped
 *  and excluded, so they don't inflate the count. */
export const questionNumbersInText = (text: string | null | undefined): number[] => {
  const re = /(?:^|\s)(\d{1,3})[.):](?!\d)/g;
  const found = new Set<number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text ?? ''))) found.add(Number(m[1]));
  return [...found].sort((a, b) => a - b);
};
