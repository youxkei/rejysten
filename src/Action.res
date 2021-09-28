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
  | SetEditingText({text: string})
  | SetCurrentItem({id: string, initialCursorPosition: State.initialCursorPosition})

type note =
  | DocumentPane(noteDocumentPane)
  | ItemPane(noteItemPane)

type search =
  | SetSearchingText({text: string})
  | ToInsertMode({initialCursorPosition: State.initialCursorPosition})
  | ToNormalMode(unit)

type t =
  | Event(Event.t)

  | FirestoreNote(firestoreNote)

  | Note(note)
  | Search(search)

  | FocusNote(focusNotePane)
  | FocusSearch(unit)
  | FocusActionLog(unit)

  | SetFirestoreItemState({itemMap: Map.String.t<State.item>})

  | SetFirestoreDocumentState({
      documentMap: Map.String.t<State.noteDocument>,
      rootDocumentId: string,
    })

  | SetFirestoreDateActionLogState({
      dateActionLogMap: Map.String.t<State.dateActionLog>,
      latestDateActionLogId: string,
    })

  | SetNoteDocumentPaneState({currentId: string})
  | SetSearchState({
      ancestorDocuments: Set.String.t,
      searchedDocuments: Set.String.t,
      searchedItems: Set.String.t,
    })
  | SetActionLogState({dateActionLogMap: Map.String.t<State.dateActionLog>})

  | DevToolUpdate({state: State.t})
