let middleware = (store, next, action) => {
  switch action {
  | Action.Firestore(firestoreAction) =>
    switch firestoreAction {
    | Action.Note(Action.DocumentPane(firestoreDocumentAction)) =>
      FirestoreNoteDocumentPaneMiddleware.middleware(store, firestoreDocumentAction)

    | Action.Note(Action.ItemPane(firestoreItemAction)) =>
      FirestoreNoteItemPaneMiddleware.middleware(store, firestoreItemAction)

    | Action.ActionLog(firestoreActionLogAction) =>
      FirestoreActionLogMiddleware.middleware(store, firestoreActionLogAction)
    }

  | _ => next(action)
  }
}
