open Belt

type direction = Prev | Next

type firestoreDocumentItems =
  | SaveItem(unit)
  | IndentItem(unit)
  | UnindentItem(unit)
  | AddItem({direction: direction})
  | DeleteItem({nextCurrentId: string, initialCursorPosition: State.initialCursorPosition})

type firestoreDocuments =
  | Save(unit)
  | Indent(unit)
  | Unindent(unit)
  | Add({direction: direction})
  | Delete({direction: direction})

type documentItems =
  | ToAboveItem(unit)
  | ToBelowItem(unit)
  | ToDocuments(unit)
  | ToInsertMode({initialCursorPosition: State.initialCursorPosition})
  | ToNormalMode(unit)
  | SetEditingText({text: string})
  | SetCurrentItem({id: string, initialCursorPosition: State.initialCursorPosition})

type documents =
  | ToAboveDocument(unit)
  | ToBelowDocument(unit)
  | ToDocumentItems(unit)

type t =
  | KeyDown({event: Dom.keyboardEvent})

  | FirestoreDocumentItems(firestoreDocumentItems)
  | FirestoreDocuments(firestoreDocuments)

  | Documents(documents)
  | DocumentItems(documentItems)

  | SetDocumentItemState({map: HashMap.String.t<State.documentItem>})
  | SetDocumentState({map: HashMap.String.t<State.document>, rootId: string})

  | DevToolUpdate({state: State.t})
