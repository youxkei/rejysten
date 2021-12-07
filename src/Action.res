open Belt

type direction = Prev(unit) | Next(unit)

type firestoreNoteDocumentPane =
  | SaveDocument(unit)
  | IndentDocument(unit)
  | DedentDocument(unit)
  | AddDocument({direction: direction})
  | DeleteDocument({nextSelectedId: string, initialCursorPosition: State.initialCursorPosition})

type firestoreNoteItemPane =
  | SaveItem(unit)
  | IndentItem(unit)
  | DedentItem(unit)
  | AddItem({direction: direction})
  | DeleteItem({nextSelectedId: string, initialCursorPosition: State.initialCursorPosition})

type firestoreNote = DocumentPane(firestoreNoteDocumentPane) | ItemPane(firestoreNoteItemPane)

type firestoreActionLogRecord =
  | SaveText(unit)
  | SaveBegin(unit)
  | SaveEnd(unit)

type firestoreActionLogItems =
  | Save(unit)
  | Add({direction: direction})
  | Delete(unit)
  | Indent(unit)
  | Dedent(unit)

type firestoreActionLog =
  | Record(firestoreActionLogRecord)
  | Items(firestoreActionLogItems)
  | Add({direction: direction})
  | Start(unit)
  | Finish(unit)

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
  | ToAboveActionLogItem(unit)
  | ToBelowActionLogItem(unit)
  | ToTopActionLogItem(unit)
  | ToBottomActionLogItem(unit)
  | SetSelectedActionLog({selectedDateActionLogId: string, selectedActionLogId: string})
  | SetSelectedActionLogItem({
      selectedActionLogItemId: string,
      initialCursorPosition: State.initialCursorPosition,
    })

type t =
  // event action handled in EventMiddleware
  | Event(Event.t)

  // firestore actions handled in FirestoreMiddleware
  | Firestore(firestore)

  // global state actions
  | ToInsertMode({initialCursorPosition: State.initialCursorPosition})
  | ToNormalMode(unit)
  | Focus(State.focus)

  // per element actions
  | Editor(editor)

  // per page actions
  | Note(note)
  | Search(search)
  | ActionLog(actionLog)

  // actions for syncing state.firestore and firestore
  | SetFirestoreItemState({itemMap: State.Item.map})
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
