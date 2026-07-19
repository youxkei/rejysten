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
  ) {
    super(`Firestore REST request failed (${status}): ${detail}`);
    this.name = "RestRequestError";
  }
}
