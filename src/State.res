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

type document =
  | Document({
      id: string,
      text: string,
      rootItemId: string,
      parentId: string,
      prevId: string,
      nextId: string,
    })
  | DocumentDirectory({
      id: string,
      text: string,
      parentId: string,
      prevId: string,
      nextId: string,
      firstChildId: string,
      lastChildId: string,
    })

type initialCursorPosition = Start | End

type mode = Normal | Insert({initialCursorPosition: initialCursorPosition})

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
  documentItem: documentItemState,
  document: documentState,
}

let initialState: t = {
  mode: Normal,
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

let currentDocumentItemId = ({documentItem: {currentId}}) => currentId
let currentRootDocumentItem = ({document: {map: documentMap, currentId: currentDocumentId}, documentItem: {map: documentItemMap}}) => {
  switch documentMap->HashMap.String.get(currentDocumentId) {
  | Some(Document({rootItemId})) => documentItemMap->HashMap.String.get(rootItemId)

  | _ => None
  }
}

let currentDocumentId = ({document: {currentId}}) => currentId
let currentDocument = ({document: {map, currentId}}) => map->HashMap.String.get(currentId)

let documentItemMap = ({documentItem: {map}}) => map
