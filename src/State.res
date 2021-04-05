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

type focus = Documents | DocumentItems

type documentItemState = {
  currentId: string,
  map: Belt.HashMap.String.t<item>,
}

type documentState = {
  currentId: string,
  map: Belt.HashMap.String.t<document>,
  rootId: string,
}

type t = {
  mode: mode,
  focus: focus,
  documentItem: documentItemState,
  document: documentState,
}

let initialState: t = {
  mode: Normal,
  focus: Documents,
  documentItem: {
    currentId: "",
    map: Belt.HashMap.String.make(~hintSize=0),
  },
  document: {
    currentId: "a87b54e5-46ef-4f71-9a5d-f7df33b9dd51",
    rootId: "629ca8ea-56e5-491f-b5ee-455ff9d3c358",
    map: Belt.HashMap.String.make(~hintSize=0),
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

let documentMap = ({document: {map}}) => map
let currentDocumentId = ({document: {currentId}}) => currentId
let currentDocument = ({document: {map, currentId}}) => map->HashMap.String.get(currentId)
let rootDocument = ({document: {map, rootId}}) => {
  map->HashMap.String.get(rootId)
}

let documentItemMap = ({documentItem: {map}}) => map
let currentDocumentItemId = ({documentItem: {currentId}}) => currentId
let currentRootDocumentItem = ({
  document: {map: documentMap, currentId: currentDocumentId},
  documentItem: {map: documentItemMap},
}) => {
  switch documentMap->HashMap.String.get(currentDocumentId) {
  | Some({rootItemId}) => documentItemMap->HashMap.String.get(rootItemId)

  | _ => None
  }
}
