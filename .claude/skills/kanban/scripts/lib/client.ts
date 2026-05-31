// Typed Trello REST client. Uses Node's built-in fetch (Node 22.12+).
// All methods return decoded JSON via Response.json() (any) flowing into the declared
// return type — no explicit `as` casts (see AGENTS.md → No type assertions).

import type { Env } from "./config.js"
import type { Board, Card, CommentAction, Label, Organization, TrelloList } from "./types.js"

export class TrelloError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
    readonly body: string,
  ) {
    super(message)
    this.name = "TrelloError"
  }
}

interface RequestOpts {
  method?: "GET" | "POST" | "PUT" | "DELETE"
  query?: Record<string, string | number | boolean | undefined>
  body?: Record<string, string | number | boolean | undefined>
}

export class TrelloClient {
  constructor(private env: Env) {}

  private async request<T = unknown>(path: string, opts: RequestOpts = {}): Promise<T> {
    const url = new URL(`https://api.trello.com/1${path}`)
    url.searchParams.set("key", this.env.apiKey)
    url.searchParams.set("token", this.env.token)
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined) url.searchParams.set(k, String(v))
      }
    }

    const method = opts.method ?? "GET"
    const init: RequestInit = { method }
    if (opts.body) {
      const params = new URLSearchParams()
      for (const [k, v] of Object.entries(opts.body)) {
        if (v !== undefined) params.set(k, String(v))
      }
      init.headers = { "content-type": "application/x-www-form-urlencoded" }
      init.body = params.toString()
    }

    const res = await fetch(url, init)
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      // Strip key/token from the URL before surfacing it (defense in depth — they're env
      // secrets and we don't want them ending up in error logs).
      const safeUrl = url
        .toString()
        .replace(/key=[^&]+/, "key=***")
        .replace(/token=[^&]+/, "token=***")
      throw new TrelloError(
        `Trello API ${res.status} ${res.statusText} on ${method} ${url.pathname}`,
        res.status,
        safeUrl,
        text,
      )
    }
    // The next two casts are the boundary between unknown JSON and the caller's typed T.
    // Validation belongs in the caller (or a Schema decode) — the client is a transport.

    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }

  // -- Boards ----------------------------------------------------------------

  getBoard(id: string): Promise<Board> {
    return this.request<Board>(`/boards/${id}`)
  }

  createBoard(opts: {
    name: string
    idOrganization?: string | undefined
    visibility?: "private" | "org" | "public" | undefined
  }): Promise<Board> {
    return this.request<Board>("/boards/", {
      method: "POST",
      body: {
        name: opts.name,
        defaultLists: false,
        defaultLabels: false,
        idOrganization: opts.idOrganization,
        prefs_permissionLevel: opts.visibility ?? "private",
      },
    })
  }

  // -- Organizations (workspaces) -------------------------------------------

  getMyOrganizations(): Promise<Organization[]> {
    return this.request<Organization[]>("/members/me/organizations", {
      query: { fields: "name,displayName" },
    })
  }

  // -- Lists -----------------------------------------------------------------

  getLists(boardId: string): Promise<TrelloList[]> {
    return this.request<TrelloList[]>(`/boards/${boardId}/lists`)
  }

  createList(boardId: string, name: string, pos: string | number = "bottom"): Promise<TrelloList> {
    return this.request<TrelloList>(`/boards/${boardId}/lists`, {
      method: "POST",
      body: { name, pos },
    })
  }

  // -- Labels ---------------------------------------------------------------

  getLabels(boardId: string): Promise<Label[]> {
    return this.request<Label[]>(`/boards/${boardId}/labels`, {
      query: { limit: 1000 },
    })
  }

  createLabel(boardId: string, name: string, color: string): Promise<Label> {
    return this.request<Label>("/labels", {
      method: "POST",
      body: { idBoard: boardId, name, color },
    })
  }

  // -- Cards ----------------------------------------------------------------

  getCard(cardId: string): Promise<Card> {
    return this.request<Card>(`/cards/${cardId}`)
  }

  getCardsByList(listId: string): Promise<Card[]> {
    return this.request<Card[]>(`/lists/${listId}/cards`)
  }

  createCard(opts: {
    idList: string
    name: string
    desc?: string
    pos?: string | number
  }): Promise<Card> {
    return this.request<Card>("/cards", { method: "POST", body: opts })
  }

  updateCard(
    cardId: string,
    fields: Partial<{
      idList: string
      name: string
      desc: string
      pos: string | number
      closed: boolean
    }>,
  ): Promise<Card> {
    return this.request<Card>(`/cards/${cardId}`, { method: "PUT", body: fields })
  }

  moveCard(cardId: string, idList: string): Promise<Card> {
    return this.updateCard(cardId, { idList })
  }

  archiveCard(cardId: string): Promise<Card> {
    return this.updateCard(cardId, { closed: true })
  }

  addLabelToCard(cardId: string, labelId: string): Promise<unknown> {
    return this.request(`/cards/${cardId}/idLabels`, {
      method: "POST",
      body: { value: labelId },
    })
  }

  removeLabelFromCard(cardId: string, labelId: string): Promise<unknown> {
    return this.request(`/cards/${cardId}/idLabels/${labelId}`, {
      method: "DELETE",
    })
  }

  // -- Comments / actions ---------------------------------------------------

  addComment(cardId: string, text: string): Promise<CommentAction> {
    return this.request<CommentAction>(`/cards/${cardId}/actions/comments`, {
      method: "POST",
      body: { text },
    })
  }

  getCardActions(
    cardId: string,
    filter: string = "commentCard",
    limit: number = 50,
  ): Promise<CommentAction[]> {
    return this.request<CommentAction[]>(`/cards/${cardId}/actions`, {
      query: { filter, limit },
    })
  }
}
