let middleware = (store, next, action) => {
  switch action {
  | Action.FirestoreDocumentItemPane(firestoreItemAction) => FirestoreDocumentItemPaneMiddleware.middleware(store, firestoreItemAction)

  | Action.FirestoreDocumentPane(firestoreDocumentAction) => FirestoreDocumentPaneMiddleware.middleware(store, firestoreDocumentAction)

  | _ => next(action)
  }
}
