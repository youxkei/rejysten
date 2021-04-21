open Belt

type direction = Prev | Next

type firestore_item_action =
  | Save
  | Indent
  | Unindent
  | Add({direction: direction})
  | Delete

type firestore_document_action =
  | Save
  | Indent
  | Unindent
  | Add({direction: direction})
  | Delete({direction: direction})

type cursor_position = Begin | End

type t =
  | KeyDown({event: Dom.keyboardEvent})
  | FirestoreItem(firestore_item_action)
  | FirestoreDocument(firestore_document_action)

  | MoveCursorLeft(unit)
  | MoveCursorDown(unit)
  | MoveCursorUp(unit)
  | MoveCursorRight(unit)

  | ToInsertMode({initialCursorPosition: State.initialCursorPosition, itemId: option<string>})
  | ToNormalMode(unit)

  | SetDocumentEditingText({text: string})
  | SetDocumentItemEditingText({text: string})

  | SetCurrentDocumentItem({id: string, initialCursorPosition: State.initialCursorPosition})
  | SetDocumentItemState({map: HashMap.String.t<State.Item.t>})
  | SetDocumentState({map: HashMap.String.t<State.document>, rootId: string})

  | DevToolUpdate({state: State.t})
