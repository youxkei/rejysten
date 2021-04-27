open Belt

module Item = {
  type t = {
    id: string,
    text: string,
    parentId: string,
    prevId: string,
    nextId: string,
    firstChildId: string,
    lastChildId: string,
  }

  exception ItemNotFound(string)

  let get = (map, id) => {
    if id == "" {
      None
    } else {
      switch map->HashMap.String.get(id) {
      | Some(item) => Some(item)

      | None => raise(ItemNotFound(id))
      }
    }
  }

  let above = ({prevId, parentId}, map) => {
    switch map->get(prevId) {
    | Some(item) => {
        let rec searchPrev = item => {
          switch map->get(item.lastChildId) {
          | Some(item) => searchPrev(item)

          | None => item
          }
        }

        Some(searchPrev(item))
      }

    | None => map->get(parentId)
    }
  }

  let below = (item, map) => {
    let {nextId, firstChildId} = item

    switch map->get(firstChildId) {
    | Some(item) => Some(item)

    | None =>
      switch map->get(nextId) {
      | Some(item) => Some(item)

      | None => {
          let rec searchNext = ({nextId, parentId}) => {
            switch map->get(nextId) {
            | Some(item) => Some(item)

            | None => map->get(parentId)->Option.flatMap(item => searchNext(item))
            }
          }

          searchNext(item)
        }
      }
    }
  }
}

module Document = {
  type t = {
    id: string,
    text: string,
    rootItemId: string,
    parentId: string,
    prevId: string,
    nextId: string,
    firstChildId: string,
    lastChildId: string,
  }

  exception DocumentNotFound(string)

  let get = (map, id) => {
    if id == "" {
      None
    } else {
      switch map->HashMap.String.get(id) {
      | Some(item) => Some(item)

      | None => raise(DocumentNotFound(id))
      }
    }
  }

  let above = ({prevId, parentId}, map) => {
    switch map->get(prevId) {
    | Some(item) => {
        let rec searchPrev = item => {
          switch map->get(item.lastChildId) {
          | Some(item) => searchPrev(item)

          | None => item
          }
        }

        Some(searchPrev(item))
      }

    | None => map->get(parentId)
    }
  }

  let below = (item, map) => {
    let {nextId, firstChildId} = item

    switch map->get(firstChildId) {
    | Some(item) => Some(item)

    | None =>
      switch map->get(nextId) {
      | Some(item) => Some(item)

      | None => {
          let rec searchNext = ({nextId, parentId}) => {
            switch map->get(nextId) {
            | Some(item) => Some(item)

            | None => map->get(parentId)->Option.flatMap(item => searchNext(item))
            }
          }

          searchNext(item)
        }
      }
    }
  }
}

type initialCursorPosition = Start | End

type mode = Normal | Insert({initialCursorPosition: initialCursorPosition})

type focus = Documents | DocumentItems

type documentItemsState = {
  currentId: string,
  map: Belt.HashMap.String.t<Item.t>,
  editingText: string,
}

type documentsState = {
  currentId: string,
  map: Belt.HashMap.String.t<Document.t>,
  rootId: string,
  editingText: string,
}

type t = {
  mode: mode,
  focus: focus,
  documentItems: documentItemsState,
  documents: documentsState,
}

let initialState: t = {
  mode: Normal,
  focus: Documents,
  documentItems: {
    currentId: "",
    map: Belt.HashMap.String.make(~hintSize=0),
    editingText: "",
  },
  documents: {
    currentId: "a87b54e5-46ef-4f71-9a5d-f7df33b9dd51",
    rootId: "629ca8ea-56e5-491f-b5ee-455ff9d3c358",
    map: Belt.HashMap.String.make(~hintSize=0),
    editingText: "",
  },
}

let editing = ({mode}) =>
  switch mode {
  | Normal => false
  | Insert(_) => true
  }

let state = state => state
let mode = ({mode}) => mode
let focus = ({focus}) => focus
let editingText = ({
  focus,
  documents: {editingText: editingDocumentText},
  documentItems: {editingText: editingDocumentItemText},
}) =>
  switch focus {
  | Documents => editingDocumentText

  | DocumentItems => editingDocumentItemText
  }

let initialCursorPosition = ({mode}) =>
  switch mode {
  | Normal => Start

  | Insert({initialCursorPosition}) => initialCursorPosition
  }

let documentMap = ({documents: {map}}) => map
let currentDocumentId = ({documents: {currentId}}) => currentId
let currentDocument = ({documents: {map, currentId}}) => map->HashMap.String.get(currentId)
let rootDocument = ({documents: {map, rootId}}) => {
  map->HashMap.String.get(rootId)
}
let editingDocumentText = ({documents: {editingText}}) => editingText

let documentItemMap = ({documentItems: {map}}) => map
let currentDocumentItemId = ({documentItems: {currentId}}) => currentId
let currentRootDocumentItem = ({
  documents: {map: documentMap, currentId: currentDocumentId},
  documentItems: {map: documentItemMap},
}) => {
  switch documentMap->HashMap.String.get(currentDocumentId) {
  | Some({rootItemId}) => documentItemMap->HashMap.String.get(rootItemId)

  | _ => None
  }
}
let editingDocumentItemText = ({documentItems: {editingText}}) => editingText
