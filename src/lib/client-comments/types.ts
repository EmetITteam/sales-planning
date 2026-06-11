/**
 * Замітки менеджера по клієнтах — типи.
 */

export interface ClientComment {
  id: number;
  clientId1c: string;
  authorLogin: string;
  authorName: string;
  comment: string;
  createdAt: string;        // ISO timestamp
  /** true якщо це коментар поточного юзера (можна видалити). */
  isMine: boolean;
}

/** Внутрішня структура з БД. */
export interface ClientCommentRow {
  id: number;
  client_id_1c: string;
  author_login: string;
  author_name: string;
  comment: string;
  created_at: string;
  deleted_at: string | null;
}

export function adaptClientComment(row: ClientCommentRow, sessionLogin: string): ClientComment {
  return {
    id: row.id,
    clientId1c: row.client_id_1c,
    authorLogin: row.author_login,
    authorName: row.author_name,
    comment: row.comment,
    createdAt: row.created_at,
    isMine: row.author_login.toLowerCase().trim() === sessionLogin.toLowerCase().trim(),
  };
}
