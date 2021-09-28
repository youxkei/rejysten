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
  itemMap: Map.String.t<item>,
  rootItemId: string,
}

type dateActionLog = {
  id: string,
  date: string,
  prevId: string,
  nextId: string,
  actionLogMap: Map.String.t<actionLog>,
  oldestActionLogId: string,
}

type initialCursorPosition = Start(unit) | End(unit)

type mode = Normal(unit) | Insert({initialCursorPosition: initialCursorPosition})

type noteFocus = DocumentPane(unit) | ItemPane(unit)

type focus = Note(noteFocus) | Search(unit) | ActionLog(unit)

type firestoreState = {
  documentMap: Map.String.t<noteDocument>,
  itemMap: Map.String.t<item>,
  dateActionLogMap: Map.String.t<dateActionLog>,
  rootDocumentId: string,
  latestDateActionLogId: string,
}

type noteItemPaneState = {
  currentId: string,
  editingText: string,
}

type noteDocumentPaneState = {
  currentId: string,
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
  currentId: string,
  dateActionLogMap: Map.String.t<dateActionLog>,
}

type t = {
  mode: mode,
  focus: focus,
  firestore: firestoreState,
  note: noteState,
  search: searchState,
  actionLog: actionLogState,
}

module Firestore = {
  let documentMap = state => state.firestore.documentMap
  let itemMap = state => state.firestore.itemMap
  let dateActionLogMap = state => state.firestore.dateActionLogMap
  let rootDocumentId = state => state.firestore.rootDocumentId

  let getDocument = ({firestore: {documentMap}}, id) => {
    documentMap->Map.String.get(id)
  }

  let rootDocument = state => state->getDocument(state->rootDocumentId)

  let getItem = ({firestore: {itemMap}}, id) => {
    itemMap->Map.String.get(id)
  }
}

module Note = {
  module DocumentPane = {
    let currentDocumentId = ({note: {documentPane: {currentId}}}) => currentId
    let editingText = ({note: {documentPane: {editingText}}}) => editingText

    let currentDocument = state => state->Firestore.getDocument(state->currentDocumentId)

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

    let isInitial = ({note: {documentPane: {currentId}}}) => currentId == ""
  }

  module ItemPane = {
    let currentItemId = ({note: {itemPane: {currentId}}}) => currentId
    let editingText = ({note: {itemPane: {editingText}}}) => editingText

    let currentItem = state => state->Firestore.getItem(state->currentItemId)

    let rootItem = state => {
      switch state->DocumentPane.currentDocument {
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

let initialState: t = {
  mode: Normal(),
  focus: Note(DocumentPane()),
  firestore: {
    documentMap: Map.String.empty,
    itemMap: Map.String.empty,
    dateActionLogMap: Map.String.empty,
    rootDocumentId: "",
    latestDateActionLogId: "",
  },
  note: {
    documentPane: {
      currentId: "",
      editingText: "",
    },
    itemPane: {
      currentId: "",
      editingText: "",
    },
  },
  search: {
    searchingText: "",
    ancestorDocuments: Set.String.empty,
    searchedDocuments: Set.String.empty,
    searchedItems: Set.String.empty,
  },
  actionLog: {
    currentId: "",
    dateActionLogMap: Map.String.empty,
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
