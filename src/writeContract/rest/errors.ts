// Transport-level failures the domain ops and HTTP handlers map to responses:
// unauthorized → 401 (propagate so the watch re-fetches its token), contention
// → 503 (retries exhausted), and a catch-all request error for anything else.
export class RestUnauthorizedError extends Error {
  constructor(detail = "") {
    super(`Firestore REST unauthorized: ${detail}`);
    this.name = "RestUnauthorizedError";
  }
}

export class RestContentionError extends Error {
  constructor(attempts: number) {
    super(`Firestore REST transaction still contended after ${attempts} attempts`);
    this.name = "RestContentionError";
  }
}

export class RestRequestError extends Error {
  constructor(
    public status: number,
    public detail: string,
    public method?: string,
  ) {
    // The method is named because the transport makes four different calls per
    // transaction, and a status alone leaves the failing one to be guessed at.
    super(`Firestore REST ${method ?? "request"} failed (${status}): ${detail}`);
    this.name = "RestRequestError";
  }
}
