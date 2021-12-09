open Belt

module Item = {
  type container =
    | Note({documentId: string})
    | ActionLog({dateActionLogId: string, actionLogId: string})

  type t = {
    id: string,
    text: string,
    container: container,
    parentId: string,
    prevId: string,
    nextId: string,
    firstChildId: string,
    lastChildId: string,
  }

  type map = Map.String.t<t>

  let above = (map, item) => {
    switch map->Map.String.get(item.prevId) {
    | Some(item) =>
      let rec searchPrev = item => {
        switch map->Map.String.get(item.lastChildId) {
        | Some(item) => searchPrev(item)

        | None => item
        }
      }

      Some(searchPrev(item))

    | None => map->Map.String.get(item.parentId)
    }
  }

  let below = (map, item) => {
    switch map->Map.String.get(item.firstChildId) {
    | Some(item) => Some(item)

    | None =>
      let rec searchNext = item => {
        switch map->Map.String.get(item.nextId) {
        | Some(item) => Some(item)

        | None =>
          switch map->Map.String.get(item.parentId) {
          | Some(item) => searchNext(item)

          | None => None
          }
        }
      }

      searchNext(item)
    }
  }

  let top = (map, item) => {
    map->Map.String.get(item.firstChildId)
  }

  let bottom = (map, item) => {
    let rec searchBottom = (item, isRoot) =>
      switch map->Map.String.get(item.lastChildId) {
      | Some(item) => searchBottom(item, false)

      | None =>
        if isRoot {
          None
        } else {
          Some(item)
        }
      }

    searchBottom(item, true)
  }
}

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
  itemMap: Item.map,
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
  itemMap: Item.map,
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
  focus: ActionLog(Record(Text())),
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
