open Belt

type direction = Prev | Next

type firestore_item_action =
  | Save({text: string})
  | Indent({text: string})
  | Unindent({text: string})
  | Add({text: option<string>, direction: direction})
  | Delete

type firestore_document_action =
  | Save({text: string})
  | Indent({text: string})
  | Unindent({text: string})
  | Add({text: option<string>})
  | AddDirectory
  | Delete

type cursor_position = Begin | End

type normal_mode_action =
  | ToInsertMode({initialCursorPosition: State.initialCursorPosition, itemId: option<string>})
  | MoveCursorLeft
  | MoveCursorDown
  | MoveCursorUp
  | MoveCursorRight

type insert_mode_action = ToNormalMode

type t =
  | FirestoreItem(firestore_item_action)
  | FirestoreDocument(firestore_document_action)
  | NormalMode(normal_mode_action)
  | InsertMode(insert_mode_action)
  | SetCurrentDocumentItem({id: string})
  | SetDocumentItemState({map: HashMap.String.t<State.item>})
  | SetDocumentState({map: HashMap.String.t<State.document>, rootId: string})
