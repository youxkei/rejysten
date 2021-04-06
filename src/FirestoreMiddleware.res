let middleware = (store, next, action) => {
  switch action {
  | Action.FirestoreItem(firestoreItemAction) => FirestoreItemMiddleware.middleware(store, firestoreItemAction)

  | Action.FirestoreDocument(firestoreDocumentAction) => FirestoreDocumentMiddleware.middleware(store, firestoreDocumentAction)

  | _ => next(action)
  }
}
