open Belt

type itemContainer =
  | Note({documentId: string})
  | ActionLog({dateActionLogId: string, actionLogId: string})

type item = {
  id: string,
  text: string,
  container: itemContainer,
  parentId: string,
  prevId: string,
  nextId: string,
  firstChildId: string,
  lastChildId: string,
}

type itemMap = Map.String.t<item>

type noteDocument = {
  id: string,
  text: string,
  rootItemId: string,
  parentId: string,
  prevId: string,
  nextId: string,
  firstChildId: string,
  lastChildId: string,
}

type noteDocumentMap = Map.String.t<noteDocument>

type actionLogItem = {
  id: string,
  dateActionLogId: string,
  actionLogId: string,
  text: string,
  parentId: string,
  prevId: string,
  nextId: string,
  firstChildId: string,
  lastChildId: string,
}

type actionLog = {
  id: string,
  dateActionLogId: string,
  begin: float,
  end: float,
  prevId: string,
  nextId: string,
  text: string,
  itemMap: itemMap,
  rootItemId: string,
}

type actionLogMap = Map.String.t<actionLog>

type dateActionLog = {
  id: string,
  date: string,
  prevId: string,
  nextId: string,
  actionLogMap: actionLogMap,
  oldestActionLogId: string,
  latestActionLogId: string,
}

type dateActionLogMap = Map.String.t<dateActionLog>

type initialCursorPosition = Start(unit) | End(unit)

type mode = Normal(unit) | Insert({initialCursorPosition: initialCursorPosition})

type noteFocus = DocumentPane(unit) | ItemPane(unit)

type actionLogRecordFocus = Text(unit) | Begin(unit) | End(unit)

type actionLogFocus = Record(actionLogRecordFocus) | Items(unit)

type focus = Note(noteFocus) | Search(unit) | ActionLog(actionLogFocus)

type editor = {editingText: string}

type noteItemPaneState = {selectedId: string}

type noteDocumentPaneState = {selectedId: string}

type noteState = {
  documentPane: noteDocumentPaneState,
  itemPane: noteItemPaneState,
}

type searchState = {
  searchingText: string,
  ancestorDocuments: Set.String.t,
  searchedDocuments: Set.String.t,
  searchedItems: Set.String.t,
}

type actionLogState = {
  selectedActionLogId: string,
  selectedDateActionLogId: string,
  selectedActionLogItemId: string,
  oldestRecentDateActionLogId: string,
}

type firestoreState = {
  documentMap: noteDocumentMap,
  itemMap: itemMap,
  dateActionLogMap: dateActionLogMap,
  rootDocumentId: string,
  latestDateActionLogId: string,
}

type t = {
  // global state
  mode: mode,
  focus: focus,
  // per element state
  editor: editor,
  // per page state
  note: noteState,
  search: searchState,
  actionLog: actionLogState,
  // firestore state
  firestore: firestoreState,
}

let initialState: t = {
  mode: Normal(),
  focus: Note(DocumentPane()),
  editor: {
    editingText: "",
  },
  note: {
    documentPane: {
      selectedId: "",
    },
    itemPane: {
      selectedId: "",
    },
  },
  search: {
    searchingText: "",
    ancestorDocuments: Set.String.empty,
    searchedDocuments: Set.String.empty,
    searchedItems: Set.String.empty,
  },
  actionLog: {
    selectedDateActionLogId: "",
    selectedActionLogId: "",
    selectedActionLogItemId: "",
    oldestRecentDateActionLogId: "",
  },
  firestore: {
    documentMap: Map.String.empty,
    itemMap: Map.String.empty,
    dateActionLogMap: Map.String.empty,
    rootDocumentId: "",
    latestDateActionLogId: "",
  },
}
