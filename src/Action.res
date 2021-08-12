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

type search = SetSearchingText({text: string})

type t =
  | Event(Event.t)

  | FirestoreNote(firestoreNote)

  | Note(note)
  | Search(search)

  | FocusNote(focusNotePane)
  | FocusSearch(unit)

  | SetFirestoreState({
      documentMap: Map.String.t<State.document>,
      itemMap: Map.String.t<State.item>,
      rootDocumentId: string,
    })
  | SetNoteDocumentPaneState({currentId: string})
  | SetSearchState({items: array<State.item>})

  | DevToolUpdate({state: State.t})
