open Belt

type item = {
  id: string,
  text: string,
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

type initialCursorPosition = Start | End

type mode = Normal | Insert({initialCursorPosition: initialCursorPosition})

type focus = DocumentPane | DocumentItemPane | SearchPane

type documentItemPaneState = {
  currentId: string,
  map: Belt.HashMap.String.t<item>,
  editingText: string,
}

type documentPaneState = {
  currentId: string,
  map: Belt.HashMap.String.t<document>,
  rootId: string,
  editingText: string,
}

type searchPaneState = {searchingText: string, items: Js.Array.t<item>}

type t = {
  mode: mode,
  focus: focus,
  documentItemPane: documentItemPaneState,
  documentPane: documentPaneState,
  searchPane: searchPaneState,
}

module DocumentPane = {
  let currentDocumentId = ({documentPane: {currentId}}) => currentId
  let documentMap = ({documentPane: {map}}) => map
  let editingText = ({documentPane: {editingText}}) => editingText
  let rootDocumentId = ({documentPane: {rootId}}) => rootId

  let getDocument = ({documentPane: {map}}, id) => {
    map->HashMap.String.get(id)
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

            | None => state->getDocument(parentId)->Option.flatMap(document => searchNext(document))
            }
          }

          searchNext(document)
        }
      }
    }
  }
}

module DocumentItemPane = {
  let currentItemId = ({documentItemPane: {currentId}}) => currentId
  let itemMap = ({documentItemPane: {map}}) => map
  let editingText = ({documentItemPane: {editingText}}) => editingText

  let getItem = ({documentItemPane: {map}}, id) => {
    map->HashMap.String.get(id)
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

            | None => state->getItem(parentId)->Option.flatMap(item => searchNext(item))
            }
          }

          searchNext(item)
        }
      }
    }
  }
}

module SearchPane = {
  let searchingText = state => state.searchPane.searchingText
}

let initialState: t = {
  mode: Normal,
  focus: DocumentPane,
  documentItemPane: {
    currentId: "",
    map: Belt.HashMap.String.make(~hintSize=0),
    editingText: "",
  },
  documentPane: {
    currentId: "",
    rootId: "629ca8ea-56e5-491f-b5ee-455ff9d3c358",
    map: Belt.HashMap.String.make(~hintSize=0),
    editingText: "",
  },
  searchPane: {
    searchingText: "",
    items: [],
  },
}

let state = state => state
let mode = ({mode}) => mode
let editing = ({mode}) =>
  switch mode {
  | Normal => false
  | Insert(_) => true
  }
let focus = ({focus}) => focus

let initialCursorPosition = ({mode}) =>
  switch mode {
  | Normal => Start

  | Insert({initialCursorPosition}) => initialCursorPosition
  }
