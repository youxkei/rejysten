let middleware = (store, next, action) => {
  switch action {
  | Action.FirestoreDocumentItems(firestoreItemAction) => FirestoreDocumentItemsMiddleware.middleware(store, firestoreItemAction)

  | Action.FirestoreDocuments(firestoreDocumentAction) => FirestoreDocumentsMiddleware.middleware(store, firestoreDocumentAction)

  | _ => next(action)
  }
}
