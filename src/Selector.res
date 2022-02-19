open Belt

module Editor = {
  let editingText = (state: State.t) => state.editor.editingText
}

module Firestore = {
  let documentMap = (state: State.t) => state.firestore.documentMap
  let itemMap = (state: State.t) => state.firestore.itemMap
  let dateActionLogMap = (state: State.t) => state.firestore.dateActionLogMap
  let rootDocumentId = (state: State.t) => state.firestore.rootDocumentId
  let latestDateActionLogId = (state: State.t) => state.firestore.latestDateActionLogId
  let oldestRecentDateActionLogId = (state: State.t) => state.firestore.oldestRecentDateActionLogId

  let getDocument = ({firestore: {documentMap}}: State.t, id) => {
    documentMap->Map.String.get(id)
  }

  let rootDocument = (state: State.t) => state->getDocument(state->rootDocumentId)

  let getItem = ({firestore: {itemMap}}: State.t, id) => {
    itemMap->Map.String.get(id)
  }

  let getDateActitonLog = (state: State.t, id) => {
    state.firestore.dateActionLogMap->Map.String.get(id)
  }

  let latestDateActionLog = (state: State.t) =>
    state->getDateActitonLog(state->latestDateActionLogId)

  let latestActionLog = (state: State.t) =>
    switch state->latestDateActionLog {
    | Some(dateActionLog) =>
      dateActionLog.actionLogMap->Map.String.get(dateActionLog.latestActionLogId)

    | None => None
    }
}

module Note = {
  module DocumentPane = {
    let selectedDocumentId = (state: State.t) => state.note.documentPane.selectedId

    let selectedDocument = (state: State.t) =>
      state->Firestore.getDocument(state->selectedDocumentId)

    let aboveSelectedDocument = (state: State.t) => {
      switch state->selectedDocument {
      | Some({prevId, parentId}) =>
        switch state->Firestore.getDocument(prevId) {
        | Some(document) => {
            let rec searchPrev = (document: State.noteDocument) => {
              switch state->Firestore.getDocument(document.lastChildId) {
              | Some(document) => searchPrev(document)

              | None => document
              }
            }

            Some(searchPrev(document))
          }

        | None => state->Firestore.getDocument(parentId)
        }

      | None => None
      }
    }

    let belowSelectedDocument = (state: State.t) => {
      switch state->selectedDocument {
      | Some(document) =>
        let {nextId, firstChildId} = document

        switch state->Firestore.getDocument(firstChildId) {
        | Some(document) => Some(document)

        | None =>
          switch state->Firestore.getDocument(nextId) {
          | Some(document) => Some(document)

          | None => {
              let rec searchNext = ({nextId, parentId}: State.noteDocument) => {
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

      | None => None
      }
    }

    let isInitial = (state: State.t) => state->selectedDocumentId == ""
  }

  module ItemPane = {
    let selectedItemId = (state: State.t) => state.note.itemPane.selectedId

    let selectedItem = (state: State.t) => state->Firestore.getItem(state->selectedItemId)

    let rootItem = (state: State.t) => {
      switch state->DocumentPane.selectedDocument {
      | Some({rootItemId}) => state->Firestore.getItem(rootItemId)

      | _ => None
      }
    }

    let aboveSelectedItem = (state: State.t) => {
      switch state->selectedItem {
      | Some(selectedItem) => state->Firestore.itemMap->State.Item.above(selectedItem)

      | None => None
      }
    }

    let belowSelectedItem = (state: State.t) => {
      switch state->selectedItem {
      | Some(selectedItem) => state->Firestore.itemMap->State.Item.below(selectedItem)

      | None => None
      }
    }

    let topItem = (state: State.t) => {
      switch state->rootItem {
      | Some(rootItem) => state->Firestore.itemMap->State.Item.top(rootItem)

      | None => None
      }
    }

    let bottomItem = (state: State.t) => {
      switch state->rootItem {
      | Some(rootItem) => state->Firestore.itemMap->State.Item.bottom(rootItem)

      | None => None
      }
    }
  }
}

module Search = {
  let searchingText = (state: State.t) => state.search.searchingText
  let ancestorDocuments = (state: State.t) => state.search.ancestorDocuments
  let searchedDocuments = (state: State.t) => state.search.searchedDocuments
  let searchedItems = (state: State.t) => state.search.searchedItems
}

module ActionLog = {
  let selectedDateActionLogId = (state: State.t) => state.actionLog.selectedDateActionLogId
  let selectedActionLogId = (state: State.t) => state.actionLog.selectedActionLogId
  let selectedActionLogItemId = (state: State.t) => state.actionLog.selectedActionLogItemId
  let isInitial = (state: State.t) => state->selectedDateActionLogId == ""

  let selectedDateActionLog = (state: State.t) =>
    state->Firestore.getDateActitonLog(state->selectedDateActionLogId)

  let selectedActionLog = (state: State.t) =>
    switch state->selectedDateActionLog {
    | Some(dateActionLog) =>
      switch dateActionLog.actionLogMap->Map.String.get(state->selectedActionLogId) {
      | Some(actionLog) => Some(dateActionLog, actionLog)

      | None => None
      }

    | None => None
    }

  let aboveSelectedActionLog = (state: State.t) =>
    switch state->selectedActionLog {
    | Some(selectedDateActionLog, {prevId}) =>
      switch selectedDateActionLog.actionLogMap->Map.String.get(prevId) {
      | Some(aboveActionLog) => Some(selectedDateActionLog, aboveActionLog)

      | None => None
      }

    | None => None
    }

  let belowSelectedActionLog = (state: State.t) =>
    switch state->selectedActionLog {
    | Some(selectedDateActionLog, {nextId}) =>
      switch selectedDateActionLog.actionLogMap->Map.String.get(nextId) {
      | Some(belowActionLog) => Some(selectedDateActionLog, belowActionLog)

      | None => None
      }

    | None => None
    }

  let aboveSelectedActionLogAcrossRecentDateActionLogs = (state: State.t) =>
    switch state->selectedActionLog {
    | Some(selectedDateActionLog, selectedActionLog) =>
      switch selectedDateActionLog.actionLogMap->Map.String.get(selectedActionLog.prevId) {
      | Some(actionLog) => Some(actionLog)

      | None =>
        if selectedDateActionLog.id == state.firestore.oldestRecentDateActionLogId {
          None
        } else {
          switch state->Firestore.getDateActitonLog(selectedDateActionLog.prevId) {
          | Some(prevDateActionLog) =>
            prevDateActionLog.actionLogMap->Map.String.get(prevDateActionLog.latestActionLogId)

          | None => None
          }
        }
      }

    | None => None
    }

  let belowSelectedActionLogAcrossRecentDateActionLogs = (state: State.t) =>
    switch state->selectedActionLog {
    | Some(selectedDateActionLog, selectedActionLog) =>
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

  let selectedActionLogRootItem = (state: State.t) =>
    switch state->selectedActionLog {
    | Some(dateActionLog, actionLog) =>
      switch actionLog.itemMap->Map.String.get(actionLog.rootItemId) {
      | Some(rootItem) => Some(dateActionLog, actionLog, rootItem)

      | None => None
      }

    | None => None
    }

  let selectedActionLogItem = (state: State.t) =>
    switch state->selectedActionLog {
    | Some(dateActionLog, actionLog) =>
      switch actionLog.itemMap->Map.String.get(state->selectedActionLogItemId) {
      | Some(item) => Some(dateActionLog, actionLog, item)

      | None => None
      }

    | None => None
    }

  let topSelectedActionLogItem = (state: State.t) =>
    switch state->selectedActionLogRootItem {
    | Some(_, actionLog, rootItem) => actionLog.itemMap->State.Item.top(rootItem)

    | None => None
    }

  let bottomSelectedActionLogItem = (state: State.t) =>
    switch state->selectedActionLogRootItem {
    | Some(_, actionLog, rootItem) => actionLog.itemMap->State.Item.bottom(rootItem)

    | None => None
    }

  let aboveSelectedActionLogItem = (state: State.t) =>
    switch state->selectedActionLogItem {
    | Some(_, selectedActionLog, selectedItem) =>
      selectedActionLog.itemMap->State.Item.above(selectedItem)

    | None => None
    }

  let belowSelectedActionLogItem = (state: State.t) =>
    switch state->selectedActionLogItem {
    | Some(_, selectedActionLog, selectedItem) =>
      selectedActionLog.itemMap->State.Item.below(selectedItem)

    | None => None
    }
}

let mode = ({mode}: State.t) => mode
let focus = ({focus}: State.t) => focus

let initialCursorPosition = ({mode}: State.t) =>
  switch mode {
  | Normal() => State.Start()

  | Insert({initialCursorPosition}) => initialCursorPosition
  }

let selectedText = (state: State.t) =>
  switch state.focus {
  | Note(DocumentPane()) =>
    switch state->Note.DocumentPane.selectedDocument {
    | Some(item) => item.text

    | None => ""
    }

  | Note(ItemPane()) =>
    switch state->Note.ItemPane.selectedItem {
    | Some(item) => item.text

    | None => ""
    }

  | Search() => ""

  | ActionLog(focus) =>
    switch state->ActionLog.selectedActionLog {
    | Some((_, actionLog)) =>
      switch focus {
      | Record(Text()) => actionLog.text

      | Record(Begin()) => actionLog.begin->Date.fromUnixtimeMillis->Date.getTimeStringForEdit

      | Record(End()) => actionLog.end->Date.fromUnixtimeMillis->Date.getTimeStringForEdit

      | Items() =>
        switch state->ActionLog.selectedActionLogItem {
        | Some(_, _, item) => item.text
        | None => ""
        }
      }

    | None => ""
    }
  }
