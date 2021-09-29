open Belt

type direction = Prev(unit) | Next(unit)
type focusNotePane = DocumentPane(unit) | ItemPane(unit)

type firestoreNoteDocumentPane =
  | SaveDocument(unit)
  | IndentDocument(unit)
  | UnindentDocument(unit)
  | AddDocument({direction: direction})
  | DeleteDocument({nextCurrentId: string, initialCursorPosition: State.initialCursorPosition})

type firestoreNoteItemPane =
  | SaveItem(unit)
  | IndentItem(unit)
  | UnindentItem(unit)
  | AddItem({direction: direction})
  | DeleteItem({nextCurrentId: string, initialCursorPosition: State.initialCursorPosition})

type firestoreNote = DocumentPane(firestoreNoteDocumentPane) | ItemPane(firestoreNoteItemPane)

type itemEditor = SetEditingText({text: string})

type noteDocumentPane =
  | ToAboveDocument(unit)
  | ToBelowDocument(unit)
  | ToInsertMode({initialCursorPosition: State.initialCursorPosition})
  | ToNormalMode(unit)
  | SetEditingText({text: string})
  | SetCurrentDocument({id: string, initialCursorPosition: State.initialCursorPosition})

type noteItemPane =
  | ToAboveItem(unit)
  | ToBelowItem(unit)
  | ToTopItem(unit)
  | ToBottomItem(unit)
  | ToInsertMode({initialCursorPosition: State.initialCursorPosition})
  | ToNormalMode(unit)
  | SetCurrentItem({id: string, initialCursorPosition: State.initialCursorPosition})

type note =
  | DocumentPane(noteDocumentPane)
  | ItemPane(noteItemPane)

type search =
  | SetSearchingText({text: string})
  | ToInsertMode({initialCursorPosition: State.initialCursorPosition})
  | ToNormalMode(unit)

type t =
  // event action handled in EventMiddleware
  | Event(Event.t)

  // firestore actions handled in FirestoreMiddleware
  | FirestoreNote(firestoreNote)

  // per element actions
  | ItemEditor(itemEditor)

  // per tab actions
  | Note(note)
  | Search(search)

  // focus change actions
  | FocusNote(focusNotePane)
  | FocusSearch(unit)
  | FocusActionLog(unit)

  // actions for syncing state.firestore and firestore
  | SetFirestoreItemState({itemMap: State.itemMap})
  | SetFirestoreDocumentState({documentMap: State.noteDocumentMap, rootDocumentId: string})
  | SetFirestoreDateActionLogState({
      dateActionLogMap: State.dateActionLogMap,
      latestDateActionLogId: string,
    })

  // actions for data manipulation from state.firestore to each tab states
  | SetNoteDocumentPaneState({currentId: string})
  | SetSearchState({
      ancestorDocuments: Set.String.t,
      searchedDocuments: Set.String.t,
      searchedItems: Set.String.t,
    })
  | SetActionLogState({dateActionLogMap: State.dateActionLogMap})

  // action for Redux DevTool
  | DevToolUpdate({state: State.t})
