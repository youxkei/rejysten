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
  begin: int,
  end: int,
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

type focus = Note(noteFocus) | Search(unit) | ActionLog(unit)

type itemEditor = {editingText: string}

type noteItemPaneState = {selectedId: string}

type noteDocumentPaneState = {
  selectedId: string,
  editingText: string,
}

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
  itemEditor: itemEditor,
  // per page state
  note: noteState,
  search: searchState,
  actionLog: actionLogState,
  // firestore state
  firestore: firestoreState,
}

module ItemEditor = {
  let editingText = state => state.itemEditor.editingText
}

module Firestore = {
  let documentMap = state => state.firestore.documentMap
  let itemMap = state => state.firestore.itemMap
  let dateActionLogMap = state => state.firestore.dateActionLogMap
  let rootDocumentId = state => state.firestore.rootDocumentId
  let latestDateActionLogId = state => state.firestore.latestDateActionLogId

  let getDocument = ({firestore: {documentMap}}, id) => {
    documentMap->Map.String.get(id)
  }

  let rootDocument = state => state->getDocument(state->rootDocumentId)

  let getItem = ({firestore: {itemMap}}, id) => {
    itemMap->Map.String.get(id)
  }

  let getDateActitonLog = (state, id) => {
    state.firestore.dateActionLogMap->Map.String.get(id)
  }

  let latestDateActionLog = state => state->getDateActitonLog(state->latestDateActionLogId)
}

module Note = {
  module DocumentPane = {
    let selectedDocumentId = state => state.note.documentPane.selectedId
    let editingText = state => state.note.documentPane.editingText

    let selectedDocument = state => state->Firestore.getDocument(state->selectedDocumentId)

    let aboveDocument = (state, {prevId, parentId}: noteDocument) => {
      switch state->Firestore.getDocument(prevId) {
      | Some(document) => {
          let rec searchPrev = (document: noteDocument) => {
            switch state->Firestore.getDocument(document.lastChildId) {
            | Some(document) => searchPrev(document)

            | None => document
            }
          }

          Some(searchPrev(document))
        }

      | None => state->Firestore.getDocument(parentId)
      }
    }

    let belowDocument = (state, document: noteDocument) => {
      let {nextId, firstChildId} = document

      switch state->Firestore.getDocument(firstChildId) {
      | Some(document) => Some(document)

      | None =>
        switch state->Firestore.getDocument(nextId) {
        | Some(document) => Some(document)

        | None => {
            let rec searchNext = ({nextId, parentId}: noteDocument) => {
              switch state->Firestore.getDocument(nextId) {
              | Some(document) => Some(document)

              | None =>
                state
                ->Firestore.getDocument(parentId)
                ->Option.flatMap(document => searchNext(document))
              }
            }

            searchNext(document)
          }
        }
      }
    }

    let isInitial = state => state->selectedDocumentId == ""
  }

  module ItemPane = {
    let selectedItemId = state => state.note.itemPane.selectedId

    let selectedItem = state => state->Firestore.getItem(state->selectedItemId)

    let rootItem = state => {
      switch state->DocumentPane.selectedDocument {
      | Some({rootItemId}) => state->Firestore.getItem(rootItemId)

      | _ => None
      }
    }

    let topItem = state => {
      switch state->rootItem {
      | Some({firstChildId}) => state->Firestore.getItem(firstChildId)

      | None => None
      }
    }

    let bottomItem = state => {
      switch state->rootItem {
      | Some({lastChildId}) =>
        switch state->Firestore.getItem(lastChildId) {
        | Some(item) =>
          let rec searchBottom = (item: item) => {
            switch state->Firestore.getItem(item.lastChildId) {
            | Some(item) => searchBottom(item)

            | None => item
            }
          }

          Some(searchBottom(item))

        | None => None
        }

      | None => None
      }
    }

    let aboveItem = (state, {prevId, parentId}: item) => {
      switch state->Firestore.getItem(prevId) {
      | Some(item) => {
          let rec searchPrev = (item: item) => {
            switch state->Firestore.getItem(item.lastChildId) {
            | Some(item) => searchPrev(item)

            | None => item
            }
          }

          Some(searchPrev(item))
        }

      | None => state->Firestore.getItem(parentId)
      }
    }

    let belowItem = (state, item: item) => {
      let {nextId, firstChildId} = item

      switch state->Firestore.getItem(firstChildId) {
      | Some(item) => Some(item)

      | None =>
        switch state->Firestore.getItem(nextId) {
        | Some(item) => Some(item)

        | None => {
            let rec searchNext = ({nextId, parentId}: item) => {
              switch state->Firestore.getItem(nextId) {
              | Some(item) => Some(item)

              | None => state->Firestore.getItem(parentId)->Option.flatMap(item => searchNext(item))
              }
            }

            searchNext(item)
          }
        }
      }
    }
  }
}

module Search = {
  let searchingText = state => state.search.searchingText
  let ancestorDocuments = state => state.search.ancestorDocuments
  let searchedDocuments = state => state.search.searchedDocuments
  let searchedItems = state => state.search.searchedItems
}

module ActionLog = {
  let selectedActionLogId = state => state.actionLog.selectedActionLogId
  let selectedDateActionLogId = state => state.actionLog.selectedDateActionLogId
  let isInitial = state => state->selectedDateActionLogId == ""

  let selectedDateActionLog = state =>
    state->Firestore.getDateActitonLog(state->selectedDateActionLogId)

  let selectedActionLog = state =>
    switch state->selectedDateActionLog {
    | Some(dateActionLog) => dateActionLog.actionLogMap->Map.String.get(state->selectedActionLogId)

    | None => None
    }

  let aboveActionLog = state =>
    switch state->selectedDateActionLog {
    | Some(selectedDateActionLog) =>
      switch selectedDateActionLog.actionLogMap->Map.String.get(state->selectedActionLogId) {
      | Some(selectedActionLog) =>
        switch selectedDateActionLog.actionLogMap->Map.String.get(selectedActionLog.prevId) {
        | Some(actionLog) => Some(actionLog)

        | None =>
          switch state->Firestore.getDateActitonLog(selectedDateActionLog.prevId) {
          | Some(prevDateActionLog) =>
            prevDateActionLog.actionLogMap->Map.String.get(prevDateActionLog.latestActionLogId)

          | None => None
          }
        }

      | None => None
      }

    | None => None
    }

  let belowActionLog = state =>
    switch state->selectedDateActionLog {
    | Some(selectedDateActionLog) =>
      switch selectedDateActionLog.actionLogMap->Map.String.get(state->selectedActionLogId) {
      | Some(selectedActionLog) =>
        switch selectedDateActionLog.actionLogMap->Map.String.get(selectedActionLog.nextId) {
        | Some(actionLog) => Some(actionLog)

        | None =>
          switch state->Firestore.getDateActitonLog(selectedDateActionLog.nextId) {
          | Some(nextDateActionLog) =>
            nextDateActionLog.actionLogMap->Map.String.get(nextDateActionLog.oldestActionLogId)

          | None => None
          }
        }

      | None => None
      }

    | None => None
    }
}

let initialState: t = {
  mode: Normal(),
  focus: Note(DocumentPane()),
  itemEditor: {
    editingText: "",
  },
  note: {
    documentPane: {
      selectedId: "",
      editingText: "",
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
  },
  firestore: {
    documentMap: Map.String.empty,
    itemMap: Map.String.empty,
    dateActionLogMap: Map.String.empty,
    rootDocumentId: "",
    latestDateActionLogId: "",
  },
}

let state = state => state
let mode = ({mode}) => mode
let editing = ({mode}) =>
  switch mode {
  | Normal() => false
  | Insert(_) => true
  }
let focus = ({focus}) => focus

let initialCursorPosition = ({mode}) =>
  switch mode {
  | Normal() => Start()

  | Insert({initialCursorPosition}) => initialCursorPosition
  }
