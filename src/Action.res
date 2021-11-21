open Belt

type direction = Prev(unit) | Next(unit)

type focusNotePane = DocumentPane(unit) | ItemPane(unit)

type firestoreNoteDocumentPane =
  | SaveDocument(unit)
  | IndentDocument(unit)
  | UnindentDocument(unit)
  | AddDocument({direction: direction})
  | DeleteDocument({nextSelectedId: string, initialCursorPosition: State.initialCursorPosition})

type firestoreNoteItemPane =
  | SaveItem(unit)
  | IndentItem(unit)
  | UnindentItem(unit)
  | AddItem({direction: direction})
  | DeleteItem({nextSelectedId: string, initialCursorPosition: State.initialCursorPosition})

type firestoreNote = DocumentPane(firestoreNoteDocumentPane) | ItemPane(firestoreNoteItemPane)

type firestoreActionLog =
  | SaveActionLog(unit)
  | AddActionLog({direction: direction})
  | StartActionLog(unit)
  | FinishActionLog(unit)

type firestore = Note(firestoreNote) | ActionLog(firestoreActionLog)

type editor = SetEditingText({text: string})

type noteDocumentPane =
  | ToAboveDocument(unit)
  | ToBelowDocument(unit)
  | SetSelectedDocument({id: string, initialCursorPosition: State.initialCursorPosition})

type noteItemPane =
  | ToAboveItem(unit)
  | ToBelowItem(unit)
  | ToTopItem(unit)
  | ToBottomItem(unit)
  | SetSelectedItem({id: string, initialCursorPosition: State.initialCursorPosition})

type note =
  | DocumentPane(noteDocumentPane)
  | ItemPane(noteItemPane)

type search = SetSearchingText({text: string})

type actionLog =
  | ToAboveActionLog(unit)
  | ToBelowActionLog(unit)
  | SetSelectedActionLog({selectedDateActionLogId: string, selectedActionLogId: string})
  | Focus(State.actionLogFocus)

type t =
  // event action handled in EventMiddleware
  | Event(Event.t)

  // firestore actions handled in FirestoreMiddleware
  | Firestore(firestore)

  // global state actions
  | ToInsertMode({initialCursorPosition: State.initialCursorPosition})
  | ToNormalMode(unit)
  | FocusNote(focusNotePane)
  | FocusSearch(unit)
  | FocusActionLog(unit)

  // per element actions
  | Editor(editor)

  // per page actions
  | Note(note)
  | Search(search)
  | ActionLog(actionLog)

  // actions for syncing state.firestore and firestore
  | SetFirestoreItemState({itemMap: State.itemMap})
  | SetFirestoreDocumentState({documentMap: State.noteDocumentMap, rootDocumentId: string})
  | SetFirestoreDateActionLogState({
      dateActionLogMap: State.dateActionLogMap,
      latestDateActionLogId: string,
    })

  // actions for data manipulation from state.firestore to each page states
  | SetNoteDocumentPaneState({selectedId: string})
  | SetSearchState({
      ancestorDocuments: Set.String.t,
      searchedDocuments: Set.String.t,
      searchedItems: Set.String.t,
    })
  | SetActionLogState({selectedDateActionLogId: string, selectedActionLogId: string})
  | SetActionLogOldestRecentDateActionLogId({oldestRecentDateActionLogId: string})

  // action for Redux DevTool
  | DevToolUpdate({state: State.t})
