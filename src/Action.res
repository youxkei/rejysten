open Belt

type direction = Prev | Next

type firestore_item_action =
  | Save({text: string})
  | Indent({text: string})
  | Unindent({text: string})
  | Add({text: option<string>, direction: direction})
  | Delete({direction: direction})

type firestore_document_action =
  | Save({text: string})
  | Indent({text: string})
  | Unindent({text: string})
  | Add({text: option<string>})
  | AddDirectory
  | Delete

type cursor_position = Begin | End

type t =
  | FirestoreItem(firestore_item_action)
  | FirestoreDocument(firestore_document_action)

  | MoveCursorLeft(unit)
  | MoveCursorDown(unit)
  | MoveCursorUp(unit)
  | MoveCursorRight(unit)

  | ToInsertMode({initialCursorPosition: State.initialCursorPosition, itemId: option<string>})
  | ToNormalMode(unit)

  | SetCurrentDocumentItem({id: string, initialCursorPosition: State.initialCursorPosition})
  | SetDocumentItemState({map: HashMap.String.t<State.item>})
  | SetDocumentState({map: HashMap.String.t<State.document>, rootId: string})

  | DevToolUpdate({state: State.t})
