let middleware = (store, next, action) => {
  switch action {
  | Action.FirestoreNote(Action.DocumentPane(firestoreDocumentAction)) =>
    FirestoreNoteDocumentPaneMiddleware.middleware(store, firestoreDocumentAction)

  | Action.FirestoreNote(Action.ItemPane(firestoreItemAction)) =>
    FirestoreNoteItemPaneMiddleware.middleware(store, firestoreItemAction)

  | _ => next(action)
  }
}
