open Belt

type direction = Prev | Next

type firestoreDocumentItemPane =
  | SaveItem(unit)
  | IndentItem(unit)
  | UnindentItem(unit)
  | AddItem({direction: direction})
  | DeleteItem({nextCurrentId: string, initialCursorPosition: State.initialCursorPosition})

type firestoreDocumentPane =
  | SaveDocument(unit)
  | IndentDocument(unit)
  | UnindentDocument(unit)
  | AddDocument({direction: direction})
  | DeleteDocument({nextCurrentId: string, initialCursorPosition: State.initialCursorPosition})

type documentItemPane =
  | ToAboveItem(unit)
  | ToBelowItem(unit)
  | ToInsertMode({initialCursorPosition: State.initialCursorPosition})
  | ToNormalMode(unit)
  | ToDocumentPane(unit)
  | SetEditingText({text: string})
  | SetCurrentItem({id: string, initialCursorPosition: State.initialCursorPosition})

type documentPane =
  | ToAboveDocument(unit)
  | ToBelowDocument(unit)
  | ToInsertMode({initialCursorPosition: State.initialCursorPosition})
  | ToNormalMode(unit)
  | ToDocumentItemPane(unit)

type t =
  | KeyDown({event: Dom.keyboardEvent})

  | FirestoreDocumentItemPane(firestoreDocumentItemPane)
  | FirestoreDocumentPane(firestoreDocumentPane)

  | DocumentPane(documentPane)
  | DocumentItemPane(documentItemPane)

  | SetDocumentItemPaneState({map: HashMap.String.t<State.documentItem>})
  | SetDocumentPaneState({map: HashMap.String.t<State.document>, rootId: string})

  | DevToolUpdate({state: State.t})
