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

type initial_cursor_position = Start | End

type mode = Normal | Insert({initialCursorPosition: initial_cursor_position})

type item_state = {
  currentId: string,
  map: Belt.HashMap.String.t<item>,
}

type document_state = {
  currentId: string,
  map: Belt.HashMap.String.t<document>,
  rootId: string,
}

type t = {
  mode: mode,
  item: item_state,
  document: document_state,
}

let initialState: t = {
  mode: Normal,
  item: {
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
let currentDocumentId = ({document: {currentId}}) => currentId
