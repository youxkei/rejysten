type item = {
  id: string,
  text: string,
  documentId: string,
  parentId: string,
  prevId: string,
  nextId: string,
  firstChildId: string,
  lastChildId: string,
}

type document = {
  id: string,
  text: string,
  rootItemId: string,
  parentId: string,
  prevId: string,
  nextId: string,
  firstChildId: string,
  lastChildId: string,
}

type initialCursorPosition = Start(unit) | End(unit)

type mode = Normal(unit) | Insert({initialCursorPosition: initialCursorPosition})

type noteFocus = DocumentPane(unit) | ItemPane(unit)

type focus = Note(noteFocus) | Search(unit)

type noteItemPaneState = {
  currentId: string,
  map: Belt.Map.String.t<item>,
  editingText: string,
}

type noteDocumentPaneState = {
  currentId: string,
  map: Belt.Map.String.t<document>,
  rootId: string,
  editingText: string,
}

type noteState = {
  documentPane: noteDocumentPaneState,
  itemPane: noteItemPaneState,
}

type searchState = {searchingText: string, items: array<item>}

type firestoreState = {documentMap: Belt.Map.String.t<document>, itemMap: Belt.Map.String.t<item>}

type t = {
  mode: mode,
  focus: focus,
  note: noteState,
  search: searchState,
  firestore: firestoreState,
}

module Note = {
  module DocumentPane = {
    let currentDocumentId = ({note: {documentPane: {currentId}}}) => currentId
    let documentMap = ({note: {documentPane: {map}}}) => map
    let editingText = ({note: {documentPane: {editingText}}}) => editingText
    let rootDocumentId = ({note: {documentPane: {rootId}}}) => rootId

    let getDocument = ({note: {documentPane: {map}}}, id) => {
      map->Belt.Map.String.get(id)
    }

    let currentDocument = state => state->getDocument(state->currentDocumentId)
    let rootDocument = state => state->getDocument(state->rootDocumentId)

    let aboveDocument = (state, {prevId, parentId}: document) => {
      switch state->getDocument(prevId) {
      | Some(document) => {
          let rec searchPrev = (document: document) => {
            switch state->getDocument(document.lastChildId) {
            | Some(document) => searchPrev(document)

            | None => document
            }
          }

          Some(searchPrev(document))
        }

      | None => state->getDocument(parentId)
      }
    }

    let belowDocument = (state, document) => {
      let {nextId, firstChildId} = document

      switch state->getDocument(firstChildId) {
      | Some(document) => Some(document)

      | None =>
        switch state->getDocument(nextId) {
        | Some(document) => Some(document)

        | None => {
            let rec searchNext = ({nextId, parentId}) => {
              switch state->getDocument(nextId) {
              | Some(document) => Some(document)

              | None =>
                state->getDocument(parentId)->Belt.Option.flatMap(document => searchNext(document))
              }
            }

            searchNext(document)
          }
        }
      }
    }
  }

  module ItemPane = {
    let currentItemId = ({note: {itemPane: {currentId}}}) => currentId
    let itemMap = ({note: {itemPane: {map}}}) => map
    let editingText = ({note: {itemPane: {editingText}}}) => editingText

    let getItem = ({note: {itemPane: {map}}}, id) => {
      map->Belt.Map.String.get(id)
    }

    let currentItem = state => state->getItem(state->currentItemId)

    let rootItem = state => {
      switch state->DocumentPane.currentDocument {
      | Some({rootItemId}) => state->getItem(rootItemId)

      | _ => None
      }
    }

    let topItem = state => {
      switch state->rootItem {
      | Some({firstChildId}) => state->getItem(firstChildId)

      | None => None
      }
    }

    let bottomItem = state => {
      switch state->rootItem {
      | Some({lastChildId}) =>
        switch state->getItem(lastChildId) {
        | Some(item) =>
          let rec searchBottom = (item: item) => {
            switch state->getItem(item.lastChildId) {
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
      switch state->getItem(prevId) {
      | Some(item) => {
          let rec searchPrev = (item: item) => {
            switch state->getItem(item.lastChildId) {
            | Some(item) => searchPrev(item)

            | None => item
            }
          }

          Some(searchPrev(item))
        }

      | None => state->getItem(parentId)
      }
    }

    let belowItem = (state, item: item) => {
      let {nextId, firstChildId} = item

      switch state->getItem(firstChildId) {
      | Some(item) => Some(item)

      | None =>
        switch state->getItem(nextId) {
        | Some(item) => Some(item)

        | None => {
            let rec searchNext = ({nextId, parentId}: item) => {
              switch state->getItem(nextId) {
              | Some(item) => Some(item)

              | None => state->getItem(parentId)->Belt.Option.flatMap(item => searchNext(item))
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
  let items = state => state.search.items
}

module Firestore = {
  let documentMap = state => state.firestore.documentMap
  let itemMap = state => state.firestore.itemMap
}

let initialState: t = {
  mode: Normal(),
  focus: Note(DocumentPane()),
  note: {
    documentPane: {
      currentId: "",
      rootId: "",
      map: Belt.Map.String.empty,
      editingText: "",
    },
    itemPane: {
      currentId: "",
      map: Belt.Map.String.empty,
      editingText: "",
    },
  },
  search: {
    searchingText: "",
    items: [],
  },
  firestore: {
    documentMap: Belt.Map.String.empty,
    itemMap: Belt.Map.String.empty,
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
