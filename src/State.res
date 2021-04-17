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

type documentItemsState = {
  currentId: string,
  map: Belt.HashMap.String.t<item>,
  editingText: string,
}

type documentsState = {
  currentId: string,
  map: Belt.HashMap.String.t<document>,
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
