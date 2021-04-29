open Belt

type documentItem = {
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

type focus = DocumentPane | DocumentItemPane

type documentItemPaneState = {
  currentId: string,
  map: Belt.HashMap.String.t<documentItem>,
  editingText: string,
}

type documentPaneState = {
  currentId: string,
  map: Belt.HashMap.String.t<document>,
  rootId: string,
  editingText: string,
}

type t = {
  mode: mode,
  focus: focus,
  documentItemPane: documentItemPaneState,
  documentPane: documentPaneState,
}

module DocumentPane = {
  let currentId = ({documentPane: {currentId}}) => currentId

  let current = ({documentPane: {map, currentId}}) => map->HashMap.String.get(currentId)

  let map = ({documentPane: {map}}) => map

  let editingText = ({documentPane: {editingText}}) => editingText

  let rootId = ({documentPane: {rootId}}) => rootId

  let root = ({documentPane: {map, rootId}}) => map->HashMap.String.get(rootId)

  let get = ({documentPane: {map}}, id) => {
    map->HashMap.String.get(id)
  }

  let currentRootDocumentItem = ({
    documentPane: {map: documentMap, currentId: currentDocumentId},
    documentItemPane: {map: documentItemMap},
  }) => {
    switch documentMap->HashMap.String.get(currentDocumentId) {
    | Some({rootItemId}) => documentItemMap->HashMap.String.get(rootItemId)

    | _ => None
    }
  }

  let above = (state, {prevId, parentId}: document) => {
    switch state->get(prevId) {
    | Some(document) => {
        let rec searchPrev = (document: document) => {
          switch state->get(document.lastChildId) {
          | Some(document) => searchPrev(document)

          | None => document
          }
        }

        Some(searchPrev(document))
      }

    | None => state->get(parentId)
    }
  }

  let below = (state, document) => {
    let {nextId, firstChildId} = document

    switch state->get(firstChildId) {
    | Some(document) => Some(document)

    | None =>
      switch state->get(nextId) {
      | Some(document) => Some(document)

      | None => {
          let rec searchNext = ({nextId, parentId}) => {
            switch state->get(nextId) {
            | Some(document) => Some(document)

            | None => state->get(parentId)->Option.flatMap(document => searchNext(document))
            }
          }

          searchNext(document)
        }
      }
    }
  }
}

module DocumentItemPane = {
  let currentId = ({documentItemPane: {currentId}}) => currentId

  let current = ({documentItemPane: {currentId, map}}) => {
    map->HashMap.String.get(currentId)
  }

  let map = ({documentItemPane: {map}}) => map

  let editingText = ({documentItemPane: {editingText}}) => editingText

  let get = ({documentItemPane: {map}}, id) => {
    map->HashMap.String.get(id)
  }

  let above = (state, {prevId, parentId}: documentItem) => {
    switch state->get(prevId) {
    | Some(item) => {
        let rec searchPrev = (item: documentItem) => {
          switch state->get(item.lastChildId) {
          | Some(item) => searchPrev(item)

          | None => item
          }
        }

        Some(searchPrev(item))
      }

    | None => state->get(parentId)
    }
  }

  let below = (state, item: documentItem) => {
    let {nextId, firstChildId} = item

    switch state->get(firstChildId) {
    | Some(item) => Some(item)

    | None =>
      switch state->get(nextId) {
      | Some(item) => Some(item)

      | None => {
          let rec searchNext = ({nextId, parentId}: documentItem) => {
            switch state->get(nextId) {
            | Some(item) => Some(item)

            | None => state->get(parentId)->Option.flatMap(item => searchNext(item))
            }
          }

          searchNext(item)
        }
      }
    }
  }
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
    currentId: "a87b54e5-46ef-4f71-9a5d-f7df33b9dd51",
    rootId: "629ca8ea-56e5-491f-b5ee-455ff9d3c358",
    map: Belt.HashMap.String.make(~hintSize=0),
    editingText: "",
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
