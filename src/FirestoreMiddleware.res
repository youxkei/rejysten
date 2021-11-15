let middleware = (store, next, action) => {
  switch action {
  | Action.FirestoreNote(Action.DocumentPane(firestoreDocumentAction)) =>
    FirestoreNoteDocumentPaneMiddleware.middleware(store, firestoreDocumentAction)

  | Action.FirestoreNote(Action.ItemPane(firestoreItemAction)) =>
    FirestoreNoteItemPaneMiddleware.middleware(store, firestoreItemAction)

  | Action.FirestoreActionLog(firestoreActionLogAction) =>
    FirestoreActionLogMiddleware.middleware(store, firestoreActionLogAction)

  | _ => next(action)
  }
}
